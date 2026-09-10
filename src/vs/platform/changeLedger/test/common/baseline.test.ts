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
import { BaselineProvider, EMPTY_BASELINE, IBaseline } from '../../common/baseline.js';
import { createLedgerStorageLayout, snapshotResource } from '../../common/ledgerStorage.js';
import { computeContentHash } from '../../common/snapshotHash.js';
import { IShadowStore, ShadowStore } from '../../common/shadowStore.js';
import { SnapshotStore } from '../../common/snapshotStore.js';

/** Conteúdo fixo do "antes" nos testes que não variam. */
const GIT_CONTENT = 'const a = 1;';
const SHADOW_CONTENT = 'const b = 2;';

const FILE_URI = 'src/vs/base/a.ts';

suite('baseline', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let shadowStore: IShadowStore;

	function createProvider(readFromHead: (fileUri: string) => Promise<VSBuffer | undefined>): BaselineProvider {
		return new BaselineProvider(readFromHead, shadowStore);
	}

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const layout = createLedgerStorageLayout(URI.from({ scheme: Schemas.inMemory, path: '/storage' }), 'workspace-1');
		const snapshots = new SnapshotStore(layout, fileService);

		shadowStore = new ShadowStore(layout, snapshots, fileService);
	});

	test('a resposta do git vence a sombra', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString(SHADOW_CONTENT), 1);

		const baseline = await createProvider(() => Promise.resolve(VSBuffer.fromString(GIT_CONTENT))).resolve(FILE_URI);

		assert.deepStrictEqual({
			origin: baseline.origin,
			content: baseline.content?.toString(),
			contentHash: baseline.contentHash,
		}, {
			origin: 'git',
			content: GIT_CONTENT,
			contentHash: await computeContentHash(VSBuffer.fromString(GIT_CONTENT)),
		});
	});

	test('falha do git degrada para a sombra sem propagar', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString(SHADOW_CONTENT), 1);

		const baseline = await createProvider(() => Promise.reject(new Error('git is not installed'))).resolve(FILE_URI);

		assert.deepStrictEqual({
			origin: baseline.origin,
			content: baseline.content?.toString(),
		}, {
			origin: 'shadow',
			content: SHADOW_CONTENT,
		});
	});

	test('sem git, a sombra responde', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString(SHADOW_CONTENT), 1);

		const baseline = await createProvider(() => Promise.resolve(undefined)).resolve(FILE_URI);

		assert.strictEqual(baseline.origin, 'shadow');
		assert.strictEqual(baseline.content?.toString(), SHADOW_CONTENT);
	});

	test('sem git e sem sombra, o baseline está ausente', async () => {
		const baseline = await createProvider(() => Promise.resolve(undefined)).resolve(FILE_URI);

		assert.deepStrictEqual(baseline, EMPTY_BASELINE);
		assert.strictEqual(baseline.content, undefined);
	});

	test('sombra órfã — conteúdo fora do store — vale como ausente', async () => {
		const layout = createLedgerStorageLayout(URI.from({ scheme: Schemas.inMemory, path: '/storage' }), 'workspace-1');

		await shadowStore.put(FILE_URI, VSBuffer.fromString(SHADOW_CONTENT), 1);

		// O conteúdo some do store: a sombra aponta para um endereço vazio.
		const contentHash = await computeContentHash(VSBuffer.fromString(SHADOW_CONTENT));
		await fileService.del(snapshotResource(layout, contentHash));

		const baseline = await new BaselineProvider(() => Promise.resolve(undefined), shadowStore).resolve(FILE_URI);

		assert.strictEqual(baseline.origin, 'none');
	});

	test('conteúdo vazio é baseline válido, não ausência', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString(''), 1);

		const baseline: IBaseline = await createProvider(() => Promise.resolve(undefined)).resolve(FILE_URI);

		assert.strictEqual(baseline.origin, 'shadow');
		assert.strictEqual(baseline.content?.toString(), '');
		assert.strictEqual(baseline.contentHash, await computeContentHash(VSBuffer.fromString('')));
	});
});
