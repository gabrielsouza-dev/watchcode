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
import { createLedgerStorageLayout, shadowResource } from '../../common/ledgerStorage.js';
import { computeContentHash } from '../../common/snapshotHash.js';
import { SnapshotStore } from '../../common/snapshotStore.js';
import { ShadowStore } from '../../common/shadowStore.js';

const FILE_URI = 'src/vs/base/a.ts';
const OTHER_FILE_URI = 'src/vs/base/b.ts';

suite('shadowStore', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let shadowStore: ShadowStore;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const layout = createLedgerStorageLayout(URI.from({ scheme: Schemas.inMemory, path: '/storage' }), 'workspace-1');

		shadowStore = new ShadowStore(layout, new SnapshotStore(layout, fileService), fileService);
	});

	test('arquivo nunca observado não tem sombra', async () => {
		assert.strictEqual(await shadowStore.get(FILE_URI), undefined);
		assert.strictEqual(await shadowStore.read(FILE_URI), undefined);
	});

	test('gravar torna o conteúdo legível pela sombra', async () => {
		const content = VSBuffer.fromString('const a = 1;');
		const contentHash = await shadowStore.put(FILE_URI, content, 1767225600000);

		assert.deepStrictEqual(await shadowStore.get(FILE_URI), {
			fileUri: FILE_URI,
			contentHash,
			recordedAt: 1767225600000,
		});
		assert.strictEqual((await shadowStore.read(FILE_URI))?.toString(), 'const a = 1;');
		assert.strictEqual(contentHash, await computeContentHash(content));
	});

	test('a sombra é sempre a última observação, não um histórico', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString('primeiro'), 1);
		await shadowStore.put(FILE_URI, VSBuffer.fromString('segundo'), 2);

		assert.strictEqual((await shadowStore.read(FILE_URI))?.toString(), 'segundo');
	});

	test('cada arquivo tem a sua própria sombra', async () => {
		await shadowStore.put(FILE_URI, VSBuffer.fromString('arquivo a'), 1);
		await shadowStore.put(OTHER_FILE_URI, VSBuffer.fromString('arquivo b'), 2);

		assert.strictEqual((await shadowStore.read(FILE_URI))?.toString(), 'arquivo a');
		assert.strictEqual((await shadowStore.read(OTHER_FILE_URI))?.toString(), 'arquivo b');
	});

	test('caminhos que só diferem no separador compartilham a sombra', async () => {
		await shadowStore.put('src/vs/base/a.ts', VSBuffer.fromString('conteúdo'), 1);

		assert.strictEqual((await shadowStore.read('src\\vs\\base\\a.ts'))?.toString(), 'conteúdo');
	});

	test('sombra corrompida é tratada como ausente', async () => {
		const layout = createLedgerStorageLayout(URI.from({ scheme: Schemas.inMemory, path: '/storage' }), 'workspace-1');

		await fileService.createFolder(layout.shadowDir);
		await fileService.writeFile(shadowResource(layout, FILE_URI), VSBuffer.fromString('{ isso não é json'));

		assert.strictEqual(await shadowStore.get(FILE_URI), undefined);
	});
});
