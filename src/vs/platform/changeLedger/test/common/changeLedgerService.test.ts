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
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IWorkspaceContextService } from '../../../workspace/common/workspace.js';
import { ChangeEvent } from '../../common/changeEvent.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../common/changeLedgerService.js';
import { createLedgerStorageLayout } from '../../common/ledgerStorage.js';

/** Armazenamento em memória, isolado por teste — nada toca o disco real. */
const storageRoot = URI.from({ scheme: Schemas.inMemory, path: '/storage' });

function environmentService(): IEnvironmentService {
	return { workspaceStorageHome: storageRoot } as unknown as IEnvironmentService;
}

function workspaceContextService(workspaceId: string): IWorkspaceContextService {
	return { getWorkspace: () => ({ id: workspaceId, folders: [] }) } as unknown as IWorkspaceContextService;
}

/** Evento completo; cada teste sobrescreve só o que importa. */
function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'E-0001',
		sessionId: 'S-0001',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'src/vs/base/a.ts',
		beforeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		afterHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		linesChanged: [[1, 2]],
		timestamp: 1767225600000,
		status: 'current',
		...overrides,
	};
}

suite('changeLedgerService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;

	function createLedger(workspaceId = 'workspace-1'): IChangeLedgerService {
		return new ChangeLedgerService(fileService, environmentService(), workspaceContextService(workspaceId));
	}

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	});

	test('round-trips an event without losing a field', async () => {
		const ledger = createLedger();
		const event = changeEvent();

		await ledger.record(event);

		assert.deepStrictEqual(await ledger.readById(event.id), event);
	});

	test('stores a snapshot that can be read back', async () => {
		const ledger = createLedger();

		const contentHash = await ledger.recordSnapshot(VSBuffer.fromString('const a = 1;'));

		assert.strictEqual((await ledger.readSnapshot(contentHash))?.toString(), 'const a = 1;');
	});

	test('is content addressed', async () => {
		const ledger = createLedger();

		const first = await ledger.recordSnapshot(VSBuffer.fromString('same content'));
		const second = await ledger.recordSnapshot(VSBuffer.fromString('same content'));

		assert.strictEqual(first, second);
	});

	test('returns undefined for a missing snapshot', async () => {
		const ledger = createLedger();

		assert.strictEqual(await ledger.readSnapshot('da39a3ee5e6b4b0d3255bfef95601890afd80709'), undefined);
	});

	test('returns undefined for a malformed hash', async () => {
		const ledger = createLedger();

		assert.deepStrictEqual(
			await Promise.all(['abc', '', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'].map(hash => ledger.readSnapshot(hash))),
			[undefined, undefined, undefined]
		);
	});

	test('supersedes the previous event of the same file', async () => {
		const ledger = createLedger();

		const first = await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1 }));
		const second = await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2 }));
		const third = await ledger.record(changeEvent({ id: 'E-0003', timestamp: 3 }));

		assert.deepStrictEqual(
			{
				firstSuperseded: first.supersededEventId,
				secondSuperseded: second.supersededEventId,
				thirdSuperseded: third.supersededEventId,
				statuses: [(await ledger.readById('E-0001'))?.status, (await ledger.readById('E-0002'))?.status, (await ledger.readById('E-0003'))?.status],
			},
			{ firstSuperseded: undefined, secondSuperseded: 'E-0001', thirdSuperseded: 'E-0002', statuses: ['history', 'history', 'current'] }
		);
	});

	test('always births an event as current', async () => {
		const ledger = createLedger();

		const result = await ledger.record(changeEvent({ status: 'history' }));

		assert.strictEqual(result.event.status, 'current');
	});

	test('isolates files from each other', async () => {
		const ledger = createLedger();

		await ledger.record(changeEvent({ id: 'E-0001', fileUri: 'src/a.ts', timestamp: 1 }));
		await ledger.record(changeEvent({ id: 'E-0002', fileUri: 'src/b.ts', timestamp: 2 }));

		assert.deepStrictEqual(
			[(await ledger.readById('E-0001'))?.status, (await ledger.readById('E-0002'))?.status],
			['current', 'current']
		);
	});

	test('reads the events of a single file', async () => {
		const ledger = createLedger();

		await ledger.record(changeEvent({ id: 'E-0001', fileUri: 'src/a.ts', timestamp: 1 }));
		await ledger.record(changeEvent({ id: 'E-0002', fileUri: 'src/b.ts', timestamp: 2 }));
		await ledger.record(changeEvent({ id: 'E-0003', fileUri: 'src/a.ts', timestamp: 3 }));

		assert.deepStrictEqual((await ledger.readByFile('src/a.ts')).map(event => event.id), ['E-0001', 'E-0003']);
	});

	test('reads every event in chronological order', async () => {
		const ledger = createLedger();

		await ledger.record(changeEvent({ id: 'E-0003', timestamp: 3 }));
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2 }));

		assert.deepStrictEqual((await ledger.readAll()).map(event => event.id), ['E-0001', 'E-0002', 'E-0003']);
	});

	test('returns undefined for an unknown event', async () => {
		const ledger = createLedger();

		assert.strictEqual(await ledger.readById('E-9999'), undefined);
	});

	test('handles a missing directory', async () => {
		const ledger = createLedger();

		assert.deepStrictEqual([await ledger.readAll(), await ledger.readByFile('src/a.ts')], [[], []]);
	});

	test('survives a new instance', async () => {
		const event = changeEvent();

		await createLedger().record(event);

		assert.deepStrictEqual(await createLedger().readAll(), [event]);
	});

	test('keeps workspaces apart', async () => {
		const event = changeEvent();

		await createLedger('workspace-1').record(event);

		assert.deepStrictEqual([await createLedger('workspace-2').readAll()], [[]]);
	});

	test('rebuilds the file index from the events', async () => {
		const ledger = createLedger();
		await ledger.record(changeEvent({ id: 'E-0001', timestamp: 1 }));
		await ledger.record(changeEvent({ id: 'E-0002', timestamp: 2 }));

		// O índice é derivado: apagá-lo não pode perder o histórico do arquivo.
		await fileService.del(createLedgerStorageLayout(storageRoot, 'workspace-1').indexDir, { recursive: true });

		assert.deepStrictEqual((await ledger.readByFile('src/vs/base/a.ts')).map(event => event.id), ['E-0001', 'E-0002']);
	});

	test('ignores an unreadable event', async () => {
		const ledger = createLedger();
		await ledger.record(changeEvent({ id: 'E-0001' }));

		await fileService.writeFile(
			URI.joinPath(createLedgerStorageLayout(storageRoot, 'workspace-1').eventsDir, 'E-0002.json'),
			VSBuffer.fromString('{ not json')
		);

		assert.deepStrictEqual((await ledger.readAll()).map(event => event.id), ['E-0001']);
	});
});
