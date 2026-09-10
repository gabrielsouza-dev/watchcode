/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLedgerStorageLayout, eventResource, fileIndexResource, fileKey, isContentHash, snapshotResource } from '../../common/ledgerStorage.js';
import { computeContentHash } from '../../common/snapshotHash.js';

function buffer(text: string): VSBuffer {
	return VSBuffer.fromString(text);
}

suite('snapshotHash', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('is deterministic for the same content', async () => {
		assert.strictEqual(await computeContentHash(buffer('const a = 1;')), await computeContentHash(buffer('const a = 1;')));
	});

	test('differs for different contents', async () => {
		const hashes = await Promise.all([
			computeContentHash(buffer('const a = 1;')),
			computeContentHash(buffer('const a = 2;')),
			computeContentHash(buffer('')),
		]);

		assert.strictEqual(new Set(hashes).size, 3);
	});

	test('produces a well formed content hash', async () => {
		const contentHash = await computeContentHash(buffer('export const x = 1;'));

		assert.ok(isContentHash(contentHash), `expected a content hash, got ${contentHash}`);
		assert.strictEqual(contentHash.length, 40);
	});

	test('handles binary content', async () => {
		const contentHash = await computeContentHash(VSBuffer.wrap(new Uint8Array([0, 1, 2, 255])));

		assert.ok(isContentHash(contentHash));
	});

	test('accepts only well formed hashes', () => {
		assert.deepStrictEqual(
			[
				isContentHash('da39a3ee5e6b4b0d3255bfef95601890afd80709'),
				isContentHash('DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'),
				isContentHash('abc'),
				isContentHash(''),
				isContentHash(undefined),
				isContentHash(42),
				isContentHash('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
			],
			[true, false, false, false, false, false, false]
		);
	});
});

suite('ledgerStorage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const root = URI.file('/storage');
	const layout = createLedgerStorageLayout(root, 'workspace-1');

	test('places every folder under the workspace id', () => {
		assert.deepStrictEqual(
			[layout.eventsDir.path, layout.indexDir.path, layout.snapshotsDir.path],
			['/storage/workspace-1/changeLedger/events', '/storage/workspace-1/changeLedger/index', '/storage/workspace-1/changeLedger/snapshots']
		);
	});

	test('names the event file after the event id', () => {
		assert.strictEqual(eventResource(layout, 'E-0001').path, '/storage/workspace-1/changeLedger/events/E-0001.json');
	});

	test('names the snapshot after the hash', () => {
		const contentHash = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

		assert.strictEqual(snapshotResource(layout, contentHash).path, `/storage/workspace-1/changeLedger/snapshots/${contentHash}`);
	});

	test('ignores the separator style when keying a file', () => {
		assert.strictEqual(fileKey('src/vs/base/a.ts'), fileKey('src\\vs\\base\\a.ts'));
		assert.strictEqual(fileKey('./src/a.ts'), fileKey('src/a.ts'));
	});

	test('never collides for different files', () => {
		const keys = ['src/base/a.ts', 'src/base/b.ts', 'src/base/aa.ts', 'a.ts', 'src/base/a.tss'];

		assert.strictEqual(new Set(keys.map(fileKey)).size, keys.length);
	});

	test('produces a file name safe on every platform', () => {
		for (const key of ['C:\\repo\\a.ts', 'src/a.ts', '.aih/events.jsonl'].map(fileKey)) {
			assert.match(key, /^[0-9a-f]{8}$/);
		}
	});

	test('keys the index by the file key', () => {
		assert.strictEqual(fileIndexResource(layout, 'src/a.ts').path, `/storage/workspace-1/changeLedger/index/${fileKey('src/a.ts')}.json`);
	});
});
