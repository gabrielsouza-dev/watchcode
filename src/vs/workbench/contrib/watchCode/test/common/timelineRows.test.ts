/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChangeEvent, ChangeLineRange } from '../../../../../platform/changeLedger/common/changeEvent.js';
import { buildTimelineRows, formatClockTime, formatFullTime, formatLineRanges, splitFilePath } from '../../common/timelineRows.js';

/** Instante na hora local: a formatacao nao pode depender do fuso da maquina. */
function localTimestamp(hours: number, minutes: number): number {
	return new Date(2026, 2, 12, hours, minutes, 0, 0).getTime();
}

/** Evento com o que o teste precisa, sem repetir o resto. */
function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'event-1',
		sessionId: 'session-1',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'src/vs/base/a.ts',
		beforeHash: 'hash-antes',
		afterHash: 'hash-depois',
		timestamp: localTimestamp(14, 32),
		status: 'current',
		...overrides
	};
}

suite('watchCode timelineRows', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('um evento vira uma linha', () => {
		assert.deepStrictEqual(buildTimelineRows([changeEvent()]), [{
			id: 'event-1',
			fileUri: 'src/vs/base/a.ts',
			fileName: 'a.ts',
			folderPath: 'src/vs/base',
			lines: '',
			clock: '14:32',
			fullTime: '2026-03-12 14:32',
			attribution: 'observed'
		}]);
	});

	test('a ordem da entrada e preservada', () => {
		const rows = buildTimelineRows([
			changeEvent({ id: 'event-1' }),
			changeEvent({ id: 'event-2' }),
			changeEvent({ id: 'event-3' })
		]);

		assert.deepStrictEqual(rows.map(row => row.id), ['event-1', 'event-2', 'event-3']);
	});

	test('sem evento, sem linha', () => {
		assert.deepStrictEqual(buildTimelineRows([]), []);
	});

	test('caminho aninhado separa nome e diretorio', () => {
		assert.deepStrictEqual(splitFilePath('src/vs/base/a.ts'), { fileName: 'a.ts', folderPath: 'src/vs/base' });
	});

	test('arquivo na raiz fica sem diretorio', () => {
		assert.deepStrictEqual(splitFilePath('a.ts'), { fileName: 'a.ts', folderPath: '' });
	});

	test('separador do Windows e prefixo ./ sao normalizados', () => {
		assert.deepStrictEqual(splitFilePath('src\\base\\a.ts'), { fileName: 'a.ts', folderPath: 'src/base' });
		assert.deepStrictEqual(splitFilePath('./src/a.ts'), { fileName: 'a.ts', folderPath: 'src' });
	});

	test('sem linhas alteradas nao ha trecho de linha', () => {
		assert.strictEqual(formatLineRanges(undefined), '');
		assert.strictEqual(formatLineRanges([]), '');
	});

	test('linha unica, intervalo e varios intervalos', () => {
		assert.strictEqual(formatLineRanges([[12, 12]]), '12');
		assert.strictEqual(formatLineRanges([[12, 14]]), '12-14');
		assert.strictEqual(formatLineRanges([[12, 14], [20, 20], [30, 31]] as ChangeLineRange[]), '12-14, 20, 30-31');
	});

	test('a hora sai no formato HH:MM, com zero a esquerda', () => {
		assert.strictEqual(formatClockTime(localTimestamp(9, 5)), '09:05');
	});

	test('a data completa sai no formato do tooltip', () => {
		assert.strictEqual(formatFullTime(localTimestamp(9, 5)), '2026-03-12 09:05');
	});

	test('a origem chega a linha como veio do evento', () => {
		const [observado] = buildTimelineRows([changeEvent({ attribution: 'observed' })]);
		const [doHook] = buildTimelineRows([changeEvent({ attribution: 'hook' })]);

		assert.deepStrictEqual([observado.attribution, doHook.attribution], ['observed', 'hook']);
	});
});
