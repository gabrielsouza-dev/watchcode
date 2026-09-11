/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IWorkspaceContextService } from '../../../workspace/common/workspace.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../common/changeLedgerService.js';
import { ChangeEvent } from '../../common/changeEvent.js';
import { ChangeRecorderService, IChangeRecorderService, ObservedChangeKind, WorkspaceHeadReader } from '../../common/changeRecorderService.js';
import { computeContentHash } from '../../common/snapshotHash.js';

const WORKSPACE_FOLDER = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
const FILE_URI = 'src/vs/base/a.ts';
const TIMESTAMP = 1767225600000;

/** Lê o conteúdo do arquivo dentro do workspace em memória. */
function resource(fileUri: string): URI {
	return URI.joinPath(WORKSPACE_FOLDER, fileUri);
}

/**
 * O evento que o recorder gravou.
 *
 * Os testes de alteração de arquivo exigem que ele exista: `undefined` é a
 * resposta para o caminho que não é arquivo, e nenhum deles testa esse caso.
 */
async function recordedEvent(change: Promise<ChangeEvent | undefined>): Promise<ChangeEvent> {
	const event = await change;

	if (!event) {
		throw new Error('o recorder nao gravou evento nenhum');
	}

	return event;
}

suite('changeRecorderService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let ledger: IChangeLedgerService;

	function createRecorder(readFromHead?: WorkspaceHeadReader): IChangeRecorderService {
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }] }),
		} as unknown as IWorkspaceContextService;

		return readFromHead
			? new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService, readFromHead)
			: new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);
	}

	function observedChange(overrides: Partial<{ fileUri: string; attribution: 'hook' | 'observed'; kind: ObservedChangeKind; folderUri: URI }> = {}) {
		return {
			fileUri: FILE_URI,
			sessionId: 'S-0001',
			attribution: 'observed' as const,
			kind: 'updated' as const,
			timestamp: TIMESTAMP,
			...overrides,
		};
	}

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }] }),
		} as unknown as IWorkspaceContextService;

		ledger = disposables.add(new ChangeLedgerService(fileService, environmentService, workspaceContextService));
	});

	test('registra a alteração com o "antes" vindo do git', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const before = VSBuffer.fromString('antes');

		const event = await recordedEvent(createRecorder(() => Promise.resolve(before)).recordChange(observedChange()));

		assert.deepStrictEqual({
			source: event.source,
			attribution: event.attribution,
			fileUri: event.fileUri,
			sessionId: event.sessionId,
			timestamp: event.timestamp,
			status: event.status,
			beforeHash: event.beforeHash,
			afterHash: event.afterHash,
		}, {
			source: 'agent',
			attribution: 'observed',
			fileUri: FILE_URI,
			sessionId: 'S-0001',
			timestamp: TIMESTAMP,
			status: 'current',
			beforeHash: await computeContentHash(before),
			afterHash: await computeContentHash(VSBuffer.fromString('depois')),
		});
	});

	test('o "antes" vindo do git fica guardado no store de snapshots', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const before = VSBuffer.fromString('antes');

		const event = await recordedEvent(createRecorder(() => Promise.resolve(before)).recordChange(observedChange()));
		const stored = event.beforeHash ? await ledger.readSnapshot(event.beforeHash) : undefined;

		assert.deepStrictEqual({
			stored: stored?.toString(),
			hashIsTheRealOne: event.beforeHash === await computeContentHash(before),
		}, {
			stored: 'antes',
			hashIsTheRealOne: true,
		});
	});

	test('sem baseline algum o evento é gravado sem "antes"', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange()));

		assert.strictEqual(event.beforeHash, undefined);
		assert.strictEqual(event.afterHash, await computeContentHash(VSBuffer.fromString('depois')));
	});

	test('a segunda alteração usa como "antes" o conteúdo da primeira', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		await recorder.recordChange(observedChange());

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('segundo'));
		const second = await recordedEvent(recorder.recordChange(observedChange()));

		assert.deepStrictEqual({
			beforeHash: second.beforeHash,
			afterHash: second.afterHash,
		}, {
			beforeHash: await computeContentHash(VSBuffer.fromString('primeiro')),
			afterHash: await computeContentHash(VSBuffer.fromString('segundo')),
		});
	});

	test('a atribuição do anúncio é preservada no evento', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange({ attribution: 'hook' })));

		assert.strictEqual(event.attribution, 'hook');
	});

	test('o evento gravado entra no ledger como atual', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange()));
		const stored = await ledger.readByFile(FILE_URI);

		assert.strictEqual(stored.length, 1);
		assert.deepStrictEqual(stored[0], event);
	});

	test('a pasta não é arquivo e não vira evento', async () => {
		const pasta = 'pasta';

		await fileService.createFolder(resource(pasta));

		const event = await createRecorder().recordChange(observedChange({ fileUri: pasta }));

		assert.deepStrictEqual({
			event,
			eventos: (await ledger.readByFile(pasta)).length,
		}, {
			event: undefined,
			eventos: 0,
		});
	});

	test('a pasta não atrapalha o arquivo que nasce no mesmo caminho', async () => {
		const recorder = createRecorder();
		const caminho = 'alvo';

		await fileService.createFolder(resource(caminho));
		const pasta = await recorder.recordChange(observedChange({ fileUri: caminho }));

		// A pasta sai e um arquivo ocupa o mesmo caminho: sem nada memorizado para a
		// pasta, o arquivo tem de virar evento normalmente.
		await fileService.del(resource(caminho), { recursive: true });
		await fileService.writeFile(resource(caminho), VSBuffer.fromString('agora e arquivo'));
		const arquivo = await recorder.recordChange(observedChange({ fileUri: caminho }));

		assert.deepStrictEqual({
			pasta,
			arquivo: arquivo?.afterHash,
			eventos: (await ledger.readByFile(caminho)).length,
		}, {
			pasta: undefined,
			arquivo: await computeContentHash(VSBuffer.fromString('agora e arquivo')),
			eventos: 1,
		});
	});

	test('arquivo ilegível não vira evento', async () => {
		const recorder = createRecorder();

		await assert.rejects(() => recorder.recordChange(observedChange()));
		assert.deepStrictEqual(await ledger.readByFile(FILE_URI), []);
	});

	test('duas alterações do mesmo arquivo rebaixam a primeira para histórico', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('segundo'));
		await recorder.recordChange(observedChange());

		const stored = await ledger.readByFile(FILE_URI);

		assert.deepStrictEqual({
			total: stored.length,
			firstStatus: stored.find(e => e.id === first.id)?.status,
			currentCount: stored.filter(e => e.status === 'current').length,
		}, {
			total: 2,
			firstStatus: 'history',
			currentCount: 1,
		});
	});

	test('a entrega repetida da mesma escrita não vira um segundo evento', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));
		// A raiz do workspace é observada por mais de um pedido: a mesma escrita
		// chega uma segunda vez, e essa repetição não é uma alteração nova.
		const repeated = await recordedEvent(recorder.recordChange(observedChange()));

		assert.deepStrictEqual({
			total: (await ledger.readByFile(FILE_URI)).length,
			repeatedIsTheSameEvent: repeated.id === first.id,
		}, {
			total: 1,
			repeatedIsTheSameEvent: true,
		});
	});

	test('duas entregas simultâneas da mesma escrita não viram dois eventos', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		// As duas entregas chegam quase juntas: nenhuma delas pode gravar antes de a
		// outra olhar o que já foi registrado.
		const [first, second] = await Promise.all([
			recordedEvent(recorder.recordChange(observedChange())),
			recordedEvent(recorder.recordChange(observedChange())),
		]);

		assert.deepStrictEqual({
			total: (await ledger.readByFile(FILE_URI)).length,
			sameEvent: first.id === second.id,
		}, {
			total: 1,
			sameEvent: true,
		});
	});

	test('a remoção repetida não vira um segundo evento', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await recorder.recordChange(observedChange());

		await fileService.del(resource(FILE_URI));
		await recorder.recordChange(observedChange({ kind: 'deleted' }));
		await recorder.recordChange(observedChange({ kind: 'deleted' }));

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 2);
	});

	test('cada alteração recebe um id próprio', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('um'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('dois'));
		const second = await recordedEvent(recorder.recordChange(observedChange()));

		assert.notStrictEqual(first.id, second.id);
	});

	test('a remoção é gravada sem "depois", usando a última sombra como "antes"', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await recorder.recordChange(observedChange());

		await fileService.del(resource(FILE_URI));
		const removal = await recordedEvent(recorder.recordChange(observedChange({ kind: 'deleted' })));

		assert.deepStrictEqual({
			afterHash: removal.afterHash,
			beforeHash: removal.beforeHash,
		}, {
			afterHash: undefined,
			beforeHash: await computeContentHash(VSBuffer.fromString('antes')),
		});
	});

	test('a remoção de um arquivo que nunca existiu não rejeita', async () => {
		const removal = await recordedEvent(createRecorder().recordChange(observedChange({ kind: 'deleted' })));

		assert.deepStrictEqual({
			afterHash: removal.afterHash,
			beforeHash: removal.beforeHash,
		}, {
			afterHash: undefined,
			beforeHash: undefined,
		});
	});

	test('conteúdo que volta a ser o de antes vira evento', async () => {
		const recorder = createRecorder();

		for (const content of ['a', 'b', 'a']) {
			await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString(content));
			await recorder.recordChange(observedChange());
		}

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 3);
	});

	test('o mesmo caminho em pastas diferentes não é confundido', async () => {
		const secondFolder = URI.from({ scheme: Schemas.inMemory, path: '/outra' });
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }, { uri: secondFolder }] }),
		} as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);

		for (const folder of [WORKSPACE_FOLDER, secondFolder]) {
			await fileService.writeFile(URI.joinPath(folder, FILE_URI), VSBuffer.fromString('igual'));
			await recorder.recordChange(observedChange({ folderUri: folder }));
		}

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 2);
	});

	test('a pasta recebida define onde o caminho relativo é resolvido', async () => {
		const secondFolder = URI.from({ scheme: Schemas.inMemory, path: '/outra' });
		await fileService.writeFile(URI.joinPath(secondFolder, FILE_URI), VSBuffer.fromString('na segunda pasta'));

		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }, { uri: secondFolder }] }),
		} as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);

		const event = await recordedEvent(recorder.recordChange(observedChange({ folderUri: secondFolder })));

		assert.strictEqual(event.afterHash, await computeContentHash(VSBuffer.fromString('na segunda pasta')));
	});
});