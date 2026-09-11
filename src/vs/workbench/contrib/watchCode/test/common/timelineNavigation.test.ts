/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { stepActiveId } from '../../common/timelineNavigation.js';

/** Tres alteracoes, na ordem em que o servico da timeline as entrega. */
const IDS = ['event-1', 'event-2', 'event-3'];

suite('watchCode timelineNavigation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('lista vazia nao devolve nenhum id', () => {
		assert.deepStrictEqual([stepActiveId([], undefined, 'next'), stepActiveId([], undefined, 'previous')], [undefined, undefined]);
	});

	test('sem evento ativo, proximo comeca no primeiro', () => {
		assert.deepStrictEqual(stepActiveId(IDS, undefined, 'next'), 'event-1');
	});

	test('sem evento ativo, anterior comeca no ultimo', () => {
		assert.deepStrictEqual(stepActiveId(IDS, undefined, 'previous'), 'event-3');
	});

	test('proximo anda uma casa na ordem', () => {
		assert.deepStrictEqual(stepActiveId(IDS, 'event-1', 'next'), 'event-2');
	});

	test('anterior anda uma casa para tras', () => {
		assert.deepStrictEqual(stepActiveId(IDS, 'event-3', 'previous'), 'event-2');
	});

	test('nas pontas o passo para, sem dar a volta', () => {
		assert.deepStrictEqual([stepActiveId(IDS, 'event-1', 'previous'), stepActiveId(IDS, 'event-3', 'next')], ['event-1', 'event-3']);
	});

	test('id que nao esta na lista vale como nenhum evento ativo', () => {
		assert.deepStrictEqual([stepActiveId(IDS, 'sumiu', 'next'), stepActiveId(IDS, 'sumiu', 'previous')], ['event-1', 'event-3']);
	});

	test('lista de um elemento fica nele mesmo', () => {
		assert.deepStrictEqual([stepActiveId(['unico'], undefined, 'next'), stepActiveId(['unico'], 'unico', 'previous')], ['unico', 'unico']);
	});

	test('a ordem recebida e preservada', () => {
		assert.deepStrictEqual([stepActiveId(['c', 'a', 'b'], 'a', 'next'), stepActiveId(['c', 'a', 'b'], 'a', 'previous')], ['b', 'c']);
	});
});
