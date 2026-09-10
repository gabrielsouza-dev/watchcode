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
import { ChangeRecorderService, IChangeRecorderService, WorkspaceHeadReader } from '../../common/changeRecorderService.js';
import { computeContentHash } from '../../common/snapshotHash.js';

const WORKSPACE_FOLDER = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
const FILE_URI = 'src/vs/base/a.ts';
const TIMESTAMP = 1767225600000;

/** Lê o conteúdo do arquivo dentro do workspace em memória. */
function resource(fileUri: string): URI {
	return URI.joinPath(WORKSPACE_FOLDER, fileUri);
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

	function observedChange(overrides: Partial<{ fileUri: string; attribution: 'hook' | 'observed' }> = {}) {
		return {
			fileUri: FILE_URI,
			sessionId: 'S-0001',
			attribution: 'observed' as const,
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

		ledger = new ChangeLedgerService(fileService, environmentService, workspaceContextService);
	});

	test('registra a alteração com o "antes" vindo do git', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const before = VSBuffer.fromString('antes');

		const event = await createRecorder(() => Promise.resolve(before)).recordChange(observedChange());

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

	test('sem baseline algum o evento é gravado sem "antes"', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await createRecorder().recordChange(observedChange());

		assert.strictEqual(event.beforeHash, undefined);
		assert.strictEqual(event.afterHash, await computeContentHash(VSBuffer.fromString('depois')));
	});

	test('a segunda alteração usa como "antes" o conteúdo da primeira', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		await recorder.recordChange(observedChange());

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('segundo'));
		const second = await recorder.recordChange(observedChange());

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

		const event = await createRecorder().recordChange(observedChange({ attribution: 'hook' }));

		assert.strictEqual(event.attribution, 'hook');
	});

	test('o evento gravado entra no ledger como atual', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await createRecorder().recordChange(observedChange());
		const stored = await ledger.readByFile(FILE_URI);

		assert.strictEqual(stored.length, 1);
		assert.deepStrictEqual(stored[0], event);
	});

	test('arquivo ilegível não vira evento', async () => {
		const recorder = createRecorder();

		await assert.rejects(() => recorder.recordChange(observedChange()));
		assert.deepStrictEqual(await ledger.readByFile(FILE_URI), []);
	});

	test('duas alterações do mesmo arquivo rebaixam a primeira para histórico', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		const first = await recorder.recordChange(observedChange());

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

	test('cada alteração recebe um id próprio', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('um'));
		const first = await recorder.recordChange(observedChange());

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('dois'));
		const second = await recorder.recordChange(observedChange());

		assert.notStrictEqual(first.id, second.id);
	});
});
