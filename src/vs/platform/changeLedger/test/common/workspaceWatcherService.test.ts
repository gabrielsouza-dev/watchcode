/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
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
import { ChangeRecorderService, IChangeRecorderService } from '../../common/changeRecorderService.js';
import { computeContentHash } from '../../common/snapshotHash.js';
import { WorkspaceWatcherService } from '../../common/workspaceWatcherService.js';

const WORKSPACE_FOLDER = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
const OUTSIDE_FOLDER = URI.from({ scheme: Schemas.inMemory, path: '/fora' });
const FILE_URI = 'src/vs/base/a.ts';

/** O provider em memória avisa as mudanças num timer curto. */
const SETTLED = 30;

/** Log que guarda os erros escritos, para o teste conferir que não houve nenhum. */
class RecordingLogService extends NullLogService {

	readonly errors: string[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push(typeof message === 'string' ? message : message.message);
	}
}

/** Recurso de um arquivo dentro do workspace em memória. */
function resource(fileUri: string): URI {
	return URI.joinPath(WORKSPACE_FOLDER, fileUri);
}

suite('workspaceWatcherService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let ledger: IChangeLedgerService;
	let service: WorkspaceWatcherService;
	let logs: RecordingLogService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }] }),
		} as unknown as IWorkspaceContextService;

		ledger = disposables.add(new ChangeLedgerService(fileService, environmentService, workspaceContextService));

		const recorder: IChangeRecorderService = new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);

		logs = new RecordingLogService();
		service = disposables.add(new WorkspaceWatcherService(fileService, workspaceContextService, recorder, logs));
	});

	test('uma escrita no workspace vira evento observado', async () => {
		service.start();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		await timeout(SETTLED);

		const events = await ledger.readByFile(FILE_URI);

		assert.deepStrictEqual({
			total: events.length,
			attribution: events[0]?.attribution,
			afterHash: events[0]?.afterHash,
		}, {
			total: 1,
			attribution: 'observed',
			afterHash: await computeContentHash(VSBuffer.fromString('depois')),
		});
	});

	test('caminho ignorado não vira evento', async () => {
		service.start();

		await fileService.writeFile(resource('node_modules/x/y.js'), VSBuffer.fromString('ruido'));
		await timeout(SETTLED);

		assert.deepStrictEqual(await ledger.readByFile('node_modules/x/y.js'), []);
	});

	test('caminho fora do workspace não vira evento', async () => {
		service.start();

		await fileService.writeFile(URI.joinPath(OUTSIDE_FOLDER, FILE_URI), VSBuffer.fromString('fora'));
		await timeout(SETTLED);

		assert.deepStrictEqual(await ledger.readByFile(FILE_URI), []);
	});

	test('start duas vezes mantém uma observação só', async () => {
		service.start();
		service.start();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		await timeout(SETTLED);

		assert.deepStrictEqual({
			isActive: service.isActive,
			total: (await ledger.readByFile(FILE_URI)).length,
		}, {
			isActive: true,
			total: 1,
		});
	});

	test('depois de stop a escrita não vira evento', async () => {
		service.start();
		service.stop();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		await timeout(SETTLED);

		assert.deepStrictEqual({
			isActive: service.isActive,
			total: (await ledger.readByFile(FILE_URI)).length,
		}, {
			isActive: false,
			total: 0,
		});
	});

	test('stop e start voltam a observar', async () => {
		service.start();
		service.stop();
		service.start();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		await timeout(SETTLED);

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 1);
	});

	test('start avisa que a observação ligou', () => {
		const emitidos: boolean[] = [];
		disposables.add(service.onDidChangeActive(active => emitidos.push(active)));

		service.start();

		assert.deepStrictEqual(emitidos, [true]);
	});

	test('stop avisa que a observação desligou', () => {
		service.start();

		const emitidos: boolean[] = [];
		disposables.add(service.onDidChangeActive(active => emitidos.push(active)));

		service.stop();

		assert.deepStrictEqual(emitidos, [false]);
	});

	test('start repetido não avisa de novo', () => {
		const emitidos: boolean[] = [];
		disposables.add(service.onDidChangeActive(active => emitidos.push(active)));

		service.start();
		service.start();

		assert.deepStrictEqual(emitidos, [true]);
	});

	test('stop repetido não avisa de novo', () => {
		service.start();
		service.stop();

		const emitidos: boolean[] = [];
		disposables.add(service.onDidChangeActive(active => emitidos.push(active)));

		service.stop();

		assert.deepStrictEqual(emitidos, []);
	});

	test('toggle inverte o estado', () => {
		const emitidos: boolean[] = [];
		disposables.add(service.onDidChangeActive(active => emitidos.push(active)));

		service.toggle();
		service.toggle();

		assert.deepStrictEqual({ emitidos, isActive: service.isActive }, { emitidos: [true, false], isActive: false });
	});

	test('toggle religado volta a observar com sessão nova', async () => {
		service.start();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await timeout(SETTLED);

		service.toggle();
		service.toggle();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		await timeout(SETTLED);

		const events = await ledger.readByFile(FILE_URI);

		assert.deepStrictEqual({
			total: events.length,
			mesmaSessao: events[0]?.sessionId === events[1]?.sessionId,
		}, {
			total: 2,
			mesmaSessao: false,
		});
	});

	test('sem pasta no workspace o toggle não liga', () => {
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const emptyContext = { getWorkspace: () => ({ id: 'workspace-3', folders: [] }) } as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, emptyContext, environmentService);
		const semPasta = disposables.add(new WorkspaceWatcherService(fileService, emptyContext, recorder, new NullLogService()));

		const emitidos: boolean[] = [];
		disposables.add(semPasta.onDidChangeActive(active => emitidos.push(active)));

		semPasta.toggle();

		assert.deepStrictEqual({ isActive: semPasta.isActive, emitidos }, { isActive: false, emitidos: [] });
	});

	test('a remoção do arquivo vira evento sem "depois"', async () => {
		service.start();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await timeout(SETTLED);
		await fileService.del(resource(FILE_URI));
		await timeout(SETTLED);

		const events = await ledger.readByFile(FILE_URI);

		assert.deepStrictEqual({
			total: events.length,
			lastAfterHash: events[events.length - 1]?.afterHash,
		}, {
			total: 2,
			lastAfterHash: undefined,
		});
	});

	test('a pasta nova não vira evento nem erro no log', async () => {
		service.start();

		// Criar a pasta chega ao watcher como alteração: o provider avisa o ADDED do
		// diretório, e o caminho da pasta cai no mesmo fluxo de um arquivo.
		await fileService.createFolder(resource('src/modulo'));
		await timeout(SETTLED);

		const eventosDaPasta = (await ledger.readByFile('src')).length + (await ledger.readByFile('src/modulo')).length;

		await fileService.writeFile(resource('src/modulo/regra.ts'), VSBuffer.fromString('novo'));
		await timeout(SETTLED);

		assert.deepStrictEqual({
			eventosDaPasta,
			eventosDoArquivo: (await ledger.readByFile('src/modulo/regra.ts')).length,
			erros: logs.errors,
		}, {
			eventosDaPasta: 0,
			eventosDoArquivo: 1,
			erros: [],
		});
	});

	test('escritas próximas entram na mesma sessão', async () => {
		service.start();

		await fileService.writeFile(resource('a.ts'), VSBuffer.fromString('um'));
		await timeout(SETTLED);
		await fileService.writeFile(resource('a.ts'), VSBuffer.fromString('dois'));
		await timeout(SETTLED);

		const events = await ledger.readByFile('a.ts');
		const sessions = new Set(events.map(event => event.sessionId));

		assert.deepStrictEqual({ total: events.length, sessions: sessions.size }, { total: 2, sessions: 1 });
	});

	test('sem pasta no workspace o start não faz nada', () => {
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const emptyContext = { getWorkspace: () => ({ id: 'workspace-2', folders: [] }) } as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, emptyContext, environmentService);
		const semPasta = disposables.add(new WorkspaceWatcherService(fileService, emptyContext, recorder, new NullLogService()));

		semPasta.start();

		assert.strictEqual(semPasta.isActive, false);
	});
});
