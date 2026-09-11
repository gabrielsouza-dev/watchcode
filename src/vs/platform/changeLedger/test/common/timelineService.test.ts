/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IWorkspaceContextService } from '../../../workspace/common/workspace.js';
import { ChangeEvent } from '../../common/changeEvent.js';
import { ChangeLedgerService, IChangeLedgerService, IRecordEventResult } from '../../common/changeLedgerService.js';
import { createLedgerStorageLayout, eventResource, ILedgerStorageLayout } from '../../common/ledgerStorage.js';
import { ISnapshotStore } from '../../common/snapshotStore.js';
import { ITimelineChange, TimelineService } from '../../common/timelineService.js';

/** Armazenamento em memória, isolado por teste — nada toca o disco real. */
const storageRoot = URI.from({ scheme: Schemas.inMemory, path: '/storage' });

/** Arquivo usado na maioria dos testes. */
const FILE_URI = 'src/vs/base/a.ts';

/** Outro arquivo, para o filtro e para a derivação por arquivo. */
const OTHER_FILE_URI = 'src/vs/base/b.ts';

function environmentService(): IEnvironmentService {
	return { workspaceStorageHome: storageRoot } as unknown as IEnvironmentService;
}

function workspaceContextService(): IWorkspaceContextService {
	return { getWorkspace: () => ({ id: 'workspace-1', folders: [] }) } as unknown as IWorkspaceContextService;
}

/** Evento completo; cada teste sobrescreve só o que importa. */
function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'E-0001',
		sessionId: 'S-0001',
		source: 'agent',
		attribution: 'observed',
		fileUri: FILE_URI,
		beforeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		afterHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		timestamp: 1767225600000,
		status: 'current',
		...overrides,
	};
}

/**
 * Dublê que delega ao ledger de verdade e segura a leitura até o teste liberar.
 *
 * É o que permite provocar os dois lados da corrida da carga: com a espera antes
 * da leitura, a gravação já está no disco quando a leitura acontece; com a espera
 * depois, a gravação só pode chegar pelo aviso.
 */
class GatedLedger implements IChangeLedgerService {

	readonly _serviceBrand: undefined;

	/** Quantas vezes o ledger foi lido — é como se prova a carga única. */
	readCount = 0;

	/** Espera depois da leitura do disco, e não antes dela. */
	holdAfterReading = false;

	/** Concluída quando a leitura do disco terminou. */
	readonly readDone = new DeferredPromise<void>();

	/** Libera a leitura pendente. */
	readonly gate = new DeferredPromise<void>();

	/** Erro a devolver na próxima leitura, quando houver. */
	failWith: Error | undefined;

	constructor(private readonly inner: IChangeLedgerService) { }

	get snapshots(): ISnapshotStore {
		return this.inner.snapshots;
	}

	get onDidRecord(): Event<IRecordEventResult> {
		return this.inner.onDidRecord;
	}

	record(event: ChangeEvent): Promise<IRecordEventResult> {
		return this.inner.record(event);
	}

	readByFile(fileUri: string): Promise<readonly ChangeEvent[]> {
		return this.inner.readByFile(fileUri);
	}

	readById(eventId: string): Promise<ChangeEvent | undefined> {
		return this.inner.readById(eventId);
	}

	readCurrentUnder(folderUri: string): Promise<readonly ChangeEvent[]> {
		return this.inner.readCurrentUnder(folderUri);
	}

	recordSnapshot(content: VSBuffer): Promise<string> {
		return this.inner.recordSnapshot(content);
	}

	readSnapshot(hash: string): Promise<VSBuffer | undefined> {
		return this.inner.readSnapshot(hash);
	}

	async readAll(): Promise<readonly ChangeEvent[]> {
		this.readCount++;

		if (!this.holdAfterReading) {
			await this.gate.p;
		}

		const events = await this.inner.readAll();

		this.readDone.complete();

		if (this.holdAfterReading) {
			await this.gate.p;
		}

		if (this.failWith) {
			const error = this.failWith;

			this.failWith = undefined;

			throw error;
		}

		return events;
	}
}

suite('timelineService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let layout: ILedgerStorageLayout;
	let ledger: ChangeLedgerService;

	function createTimeline(source: IChangeLedgerService = ledger): TimelineService {
		return disposables.add(new TimelineService(source));
	}

	/** Grava o evento direto no diretório do ledger, sem passar pela regra de atualidade. */
	async function writeEventDirectly(event: ChangeEvent): Promise<void> {
		await fileService.createFolder(layout.eventsDir);
		await fileService.writeFile(eventResource(layout, event.id), VSBuffer.fromString(JSON.stringify(event)));
	}

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		layout = createLedgerStorageLayout(storageRoot, 'workspace-1');
		ledger = disposables.add(new ChangeLedgerService(fileService, environmentService(), workspaceContextService()));
	});

	test('devolve os eventos gravados em ordem cronológica crescente', async () => {
		await ledger.record(changeEvent({ id: 'E-0003', timestamp: 3000, fileUri: OTHER_FILE_URI }));
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000, fileUri: 'src/vs/base/c.ts' }));

		const events = await createTimeline().getEvents();

		assert.deepStrictEqual(events.map(event => event.id), ['E-0001', 'E-0002', 'E-0003']);
	});

	test('o último evento de cada arquivo é o atual e os anteriores são histórico', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000 }));

		const events = await createTimeline().getEvents();

		assert.deepStrictEqual(events.map(event => [event.id, event.status]), [
			['E-0001', 'history'],
			['E-0002', 'current'],
		]);
	});

	test('cada arquivo tem o seu próprio atual', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000, fileUri: OTHER_FILE_URI }));

		const events = await createTimeline().getEvents();

		assert.deepStrictEqual(events.map(event => [event.id, event.status]), [
			['E-0001', 'current'],
			['E-0002', 'current'],
		]);
	});

	test('a derivação vence o status gravado no ledger', async () => {
		// Dois atuais para o mesmo arquivo: é o que sobra de uma gravação
		// interrompida entre a gravação e o rebaixamento do anterior.
		await writeEventDirectly(changeEvent({ id: 'E-0001', timestamp: 1000, status: 'current' }));
		await writeEventDirectly(changeEvent({ id: 'E-0002', timestamp: 2000, status: 'current' }));
		// E um histórico que, no disco, é o mais recente do arquivo dele.
		await writeEventDirectly(changeEvent({ id: 'E-0003', timestamp: 3000, fileUri: OTHER_FILE_URI, status: 'history' }));

		const events = await createTimeline().getEvents();

		assert.deepStrictEqual(events.map(event => [event.id, event.status]), [
			['E-0001', 'history'],
			['E-0002', 'current'],
			['E-0003', 'current'],
		]);
	});

	test('filtra os eventos por arquivo', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000, fileUri: OTHER_FILE_URI }));
		await ledger.record(changeEvent({ id: 'E-0003', timestamp: 3000 }));

		const events = await createTimeline().getEventsForFile(FILE_URI);

		// O recorte do arquivo dá o mesmo status que a lista inteira: a derivação
		// é por arquivo.
		assert.deepStrictEqual(events.map(event => [event.id, event.status]), [
			['E-0001', 'history'],
			['E-0003', 'current'],
		]);
	});

	test('aceita o caminho com o separador do Windows', async () => {
		await ledger.record(changeEvent({ id: 'E-0001' }));

		const events = await createTimeline().getEventsForFile('.\\src\\vs\\base\\a.ts');

		assert.deepStrictEqual(events.map(event => event.id), ['E-0001']);
	});

	test('arquivo sem histórico devolve lista vazia', async () => {
		await ledger.record(changeEvent({ id: 'E-0001' }));

		assert.deepStrictEqual(await createTimeline().getEventsForFile('src/vs/base/nunca.ts'), []);
	});

	test('busca um evento por id', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000 }));

		const timeline = createTimeline();

		assert.deepStrictEqual([
			(await timeline.getEvent('E-0001'))?.status,
			(await timeline.getEvent('E-0002'))?.status,
			await timeline.getEvent('E-9999'),
		], ['history', 'current', undefined]);
	});

	test('avisa a cada gravação, com o rebaixado quando houver', async () => {
		const timeline = createTimeline();
		const changes: ITimelineChange[] = [];

		disposables.add(timeline.onDidChange(change => changes.push(change)));

		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2000 }));
		await ledger.record(changeEvent({ id: 'E-0003', timestamp: 3000, fileUri: OTHER_FILE_URI }));

		assert.deepStrictEqual(changes.map(change => [change.added.id, change.demotedEventId]), [
			['E-0001', undefined],
			['E-0002', 'E-0001'],
			['E-0003', undefined],
		]);
	});

	test('a consulta seguinte ao aviso já traz o evento gravado', async () => {
		const timeline = createTimeline();

		await timeline.getEvents();
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));

		assert.deepStrictEqual((await timeline.getEvents()).map(event => event.id), ['E-0001']);
	});

	test('workspace sem histórico devolve lista vazia', async () => {
		const timeline = createTimeline();

		assert.deepStrictEqual([await timeline.getEvents(), await timeline.getEventsForFile(FILE_URI)], [[], []]);
	});

	test('lê o ledger uma vez só, mesmo com consultas simultâneas', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));

		const source = new GatedLedger(ledger);
		const timeline = createTimeline(source);
		const simultaneous = Promise.all([timeline.getEvents(), timeline.getEvents()]);

		source.gate.complete();

		await simultaneous;
		await timeline.getEventsForFile(FILE_URI);
		await timeline.getEvent('E-0001');

		assert.strictEqual(source.readCount, 1);
	});

	test('gravação que chega depois da leitura do disco não se perde', async () => {
		const source = new GatedLedger(ledger);

		source.holdAfterReading = true;

		const timeline = createTimeline(source);
		const loading = timeline.getEvents();

		// A leitura do disco já terminou — e ela não viu o evento nenhum: o que
		// chega depois só pode entrar pela gravação.
		await source.readDone.p;
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));

		source.gate.complete();

		assert.deepStrictEqual((await loading).map(event => event.id), ['E-0001']);
	});

	test('gravação que a leitura do disco já trouxe não entra duas vezes', async () => {
		const source = new GatedLedger(ledger);
		const timeline = createTimeline(source);

		// A leitura espera, a gravação acontece e só então o disco é lido: o evento
		// chega pela gravação e também pela leitura.
		const loading = timeline.getEvents();

		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));

		source.gate.complete();

		assert.deepStrictEqual((await loading).map(event => event.id), ['E-0001']);
	});

	test('falha na leitura rejeita a consulta e a próxima tenta de novo', async () => {
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1000 }));

		const source = new GatedLedger(ledger);

		source.failWith = new Error('disco fora');

		const timeline = createTimeline(source);

		source.gate.complete();

		await assert.rejects(() => timeline.getEvents(), /disco fora/);

		assert.deepStrictEqual((await timeline.getEvents()).map(event => event.id), ['E-0001']);
		assert.strictEqual(source.readCount, 2);
	});
});
