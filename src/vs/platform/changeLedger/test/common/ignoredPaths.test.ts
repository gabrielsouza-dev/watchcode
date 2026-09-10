/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isIgnoredPath } from '../../common/ignoredPaths.js';

suite('ignoredPaths', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('controle de versão, dependências e saída de build ficam de fora', () => {
		assert.deepStrictEqual([
			'.git/config',
			'src/.git/HEAD',
			'.hg/store',
			'.svn/entries',
			'node_modules/x/y.js',
			'out/main.js',
			'dist/index.js',
			'.build/x.js',
			'build/x.js',
			'.aih/agent-brief.md'
		].map(isIgnoredPath), [true, true, true, true, true, true, true, true, true, true]);
	});

	test('um nome parecido não basta para ignorar', () => {
		assert.deepStrictEqual([
			'src/git/x.ts',
			'.gitignore',
			'src/github/client.ts',
			'nodes_modules/x.js',
			'output/main.js'
		].map(isIgnoredPath), [false, false, false, false, false]);
	});

	test('caminho comum é observado', () => {
		assert.strictEqual(isIgnoredPath('src/vs/base/common/a.ts'), false);
	});

	test('os dois separadores valem o mesmo', () => {
		assert.strictEqual(isIgnoredPath('src\\node_modules\\x.js'), isIgnoredPath('src/node_modules/x.js'));
		assert.strictEqual(isIgnoredPath('.git\\config'), true);
	});
});
