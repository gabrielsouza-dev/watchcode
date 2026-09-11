/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { changedLineRange } from '../../common/changedLines.js';

/** Conteudo de arquivo, a partir das linhas dadas. */
function arquivo(...linhas: readonly string[]): VSBuffer {
	return VSBuffer.fromString(linhas.join('\n') + '\n');
}

suite('watchCode changedLines', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('conteudo igual nao tem faixa', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c'), arquivo('a', 'b', 'c')), undefined);
	});

	test('uma linha trocada aponta so ela', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'c')), [2, 2]);
	});

	test('linhas seguidas trocadas viram uma faixa', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c', 'd'), arquivo('a', 'x', 'y', 'd')), [2, 3]);
	});

	test('troca na primeira e na segunda linha comeca na primeira', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c'), arquivo('x', 'y', 'c')), [1, 2]);
	});

	test('insercao no meio cobre so o que entrou', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'y', 'b', 'c')), [2, 3]);
	});

	test('remocao pura aponta a linha que ficou no lugar', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b', 'c'), arquivo('a', 'c')), [2, 2]);
	});

	test('arquivo novo tem o arquivo inteiro como faixa', () => {
		assert.deepStrictEqual(changedLineRange(undefined, arquivo('a', 'b')), [1, 2]);
	});

	test('remocao do arquivo nao tem faixa', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a'), undefined), undefined);
	});

	test('arquivo esvaziado nao tem faixa', () => {
		assert.deepStrictEqual(changedLineRange(arquivo('a', 'b'), VSBuffer.fromString('')), undefined);
	});

	test('quebra de linha final a mais nao e alteracao', () => {
		assert.deepStrictEqual(changedLineRange(VSBuffer.fromString('a\nb'), VSBuffer.fromString('a\nb\n')), undefined);
	});

	test('fim de linha do Windows nao e alteracao', () => {
		assert.deepStrictEqual(changedLineRange(VSBuffer.fromString('a\r\nb\r\n'), VSBuffer.fromString('a\nb\n')), undefined);
	});

	test('dois arquivos vazios nao tem faixa', () => {
		assert.deepStrictEqual(changedLineRange(VSBuffer.fromString(''), VSBuffer.fromString('')), undefined);
	});
});
