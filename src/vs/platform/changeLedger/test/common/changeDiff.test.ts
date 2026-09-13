/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChangeLineRange } from '../../common/changeEvent.js';
import { changedLineRanges, computeChangeDiff, IChangeDiff, IChangeHunk, MAX_DIFF_LINES } from '../../common/changeDiff.js';

/** Conteudo de arquivo, a partir das linhas dadas. */
function arquivo(...linhas: readonly string[]): VSBuffer {
	return VSBuffer.fromString(linhas.join('\n') + '\n');
}

/** O diff esperado, com os totais contados dos hunks. */
function diff(hunks: readonly IChangeHunk[], coarse = false): IChangeDiff {
	let addedLines = 0;
	let removedLines = 0;

	for (const hunk of hunks) {
		addedLines += hunk.after ? hunk.after[1] - hunk.after[0] + 1 : 0;
		removedLines += hunk.before ? hunk.before[1] - hunk.before[0] + 1 : 0;
	}

	return { hunks, addedLines, removedLines, coarse };
}

/** Hunk cujo lado de depois produz linhas. */
function troca(before: ChangeLineRange, after: ChangeLineRange): IChangeHunk {
	return { before, after };
}

/** Hunk de remocao pura: so o lado de antes, ancorado na linha do depois. */
function remocao(before: ChangeLineRange, afterLine: number): IChangeHunk {
	return { before, afterLine };
}

suite('watchCode changeDiff', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('conteudo igual nao tem hunk', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'b', 'c')), diff([]));
	});

	test('uma linha trocada aponta os dois lados', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'c')), diff([troca([2, 2], [2, 2])]));
	});

	test('linhas seguidas trocadas viram um hunk so', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c', 'd'), arquivo('a', 'x', 'y', 'd')), diff([troca([2, 3], [2, 3])]));
	});

	test('insercao no meio so tem o lado de depois', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'y', 'b', 'c')), diff([{ after: [2, 3] }]));
	});

	test('remocao pura so tem o lado de antes', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'c')), diff([remocao([2, 2], 2)]));
	});

	test('remocao no comeco aponta a primeira linha', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('b', 'c')), diff([remocao([1, 1], 1)]));
	});

	test('remocao no fim aponta a ultima linha que ficou', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'b')), diff([remocao([3, 3], 2)]));
	});

	test('arquivo novo e um hunk com o arquivo inteiro', () => {
		assert.deepStrictEqual(computeChangeDiff(undefined, arquivo('a', 'b')), diff([{ after: [1, 2] }]));
	});

	test('arquivo removido e um hunk sem lado de depois', () => {
		assert.deepStrictEqual(computeChangeDiff(arquivo('a'), undefined), diff([{ before: [1, 1] }]));
	});

	test('duas alteracoes distantes viram dois hunks', () => {
		const antes = arquivo('1', '2', '3', '4', '5', '6', '7', '8', '9', '10');
		const depois = arquivo('1', 'X', '3', '4', '5', '6', '7', 'Y', '9', '10');

		assert.deepStrictEqual(computeChangeDiff(antes, depois), diff([troca([2, 2], [2, 2]), troca([8, 8], [8, 8])]));
	});

	test('bloco movido vira remocao e insercao', () => {
		assert.deepStrictEqual(
			computeChangeDiff(arquivo('a', 'b', 'c', 'd', 'e', 'f'), arquivo('a', 'c', 'd', 'e', 'b', 'f')),
			diff([remocao([2, 2], 2), { after: [5, 5] }]));
	});

	test('a contagem soma o que entrou e o que saiu', () => {
		const resultado = computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'y', 'b', 'c'));

		assert.deepStrictEqual({ addedLines: resultado.addedLines, removedLines: resultado.removedLines }, { addedLines: 2, removedLines: 0 });
	});

	test('linha trocada conta uma somada e uma removida', () => {
		const resultado = computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'x', 'c'));

		assert.deepStrictEqual({ addedLines: resultado.addedLines, removedLines: resultado.removedLines }, { addedLines: 1, removedLines: 1 });
	});

	test('quebra de linha final a mais nao e alteracao', () => {
		assert.deepStrictEqual(computeChangeDiff(VSBuffer.fromString('a\nb'), VSBuffer.fromString('a\nb\n')), diff([]));
	});

	test('fim de linha do Windows nao e alteracao', () => {
		assert.deepStrictEqual(computeChangeDiff(VSBuffer.fromString('a\r\nb\r\n'), VSBuffer.fromString('a\nb\n')), diff([]));
	});

	test('dois arquivos vazios nao tem hunk', () => {
		assert.deepStrictEqual(computeChangeDiff(VSBuffer.fromString(''), VSBuffer.fromString('')), diff([]));
	});

	test('acima do limite o diff vem grosso, em um hunk so', () => {
		const linhas = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, index) => 'linha ' + index);
		const alteradas = [...linhas];
		alteradas[1] = 'mudou no comeco';
		alteradas[linhas.length - 2] = 'mudou no fim';

		assert.deepStrictEqual(
			computeChangeDiff(arquivo(...linhas), arquivo(...alteradas)),
			diff([troca([2, MAX_DIFF_LINES], [2, MAX_DIFF_LINES])], true));
	});

	test('o diff grosso ainda recorta as duas pontas', () => {
		const linhas = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, index) => 'linha ' + index);
		const alteradas = [...linhas];
		alteradas[1] = 'mudou no comeco';

		assert.deepStrictEqual(
			computeChangeDiff(arquivo(...linhas), arquivo(...alteradas)),
			diff([troca([2, 2], [2, 2])], true));
	});

	test('arquivo grande sem alteracao nao tem hunk', () => {
		const linhas = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, index) => 'linha ' + index);

		assert.deepStrictEqual(computeChangeDiff(arquivo(...linhas), arquivo(...linhas)), diff([]));
	});

	test('as faixas saem na ordem dos hunks', () => {
		const antes = arquivo('1', '2', '3', '4', '5', '6', '7', '8', '9', '10');
		const depois = arquivo('1', 'X', '3', '4', '5', '6', '7', 'Y', '9', '10');

		assert.deepStrictEqual(changedLineRanges(computeChangeDiff(antes, depois)), [[2, 2], [8, 8]]);
	});

	test('a remocao pura aponta a linha que ficou no lugar', () => {
		assert.deepStrictEqual(changedLineRanges(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'c'))), [[2, 2]]);
		assert.deepStrictEqual(changedLineRanges(computeChangeDiff(arquivo('a', 'b', 'c'), arquivo('a', 'b'))), [[2, 2]]);
	});

	test('arquivo esvaziado ou removido nao tem faixa', () => {
		assert.deepStrictEqual(changedLineRanges(computeChangeDiff(arquivo('a', 'b'), VSBuffer.fromString(''))), []);
		assert.deepStrictEqual(changedLineRanges(computeChangeDiff(arquivo('a', 'b'), undefined)), []);
	});
});
