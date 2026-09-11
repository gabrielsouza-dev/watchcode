/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { ChangeEvent } from '../../../../../platform/changeLedger/common/changeEvent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { planReveal } from '../../common/changeReveal.js';

/** Um evento qualquer, com o que o teste quiser trocar. */
function event(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'event-1',
		sessionId: 'session-1',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'src/arquivo.ts',
		beforeHash: 'antes',
		afterHash: 'depois',
		linesChanged: [[12, 14]],
		timestamp: 1700000000000,
		status: 'current',
		...overrides
	};
}

suite('watchCode changeReveal', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('remocao registrada nao abre arquivo, mesmo com o arquivo no disco', () => {
		assert.deepStrictEqual(planReveal(event({ afterHash: undefined }), true), { kind: 'missing', because: 'removed' });
	});

	test('arquivo que sumiu do disco vira ausente', () => {
		assert.deepStrictEqual(planReveal(event(), false), { kind: 'missing', because: 'absent' });
	});

	test('a remocao tem precedencia sobre o arquivo ausente', () => {
		assert.deepStrictEqual(planReveal(event({ afterHash: undefined }), false), { kind: 'missing', because: 'removed' });
	});

	test('evento sem faixas abre o arquivo sem selecao', () => {
		assert.deepStrictEqual(planReveal(event({ linesChanged: undefined }), true), { kind: 'file', range: undefined });
	});

	test('lista de faixas vazia abre o arquivo sem selecao', () => {
		assert.deepStrictEqual(planReveal(event({ linesChanged: [] }), true), { kind: 'file', range: undefined });
	});

	test('a unica faixa e a que o salto mostra', () => {
		assert.deepStrictEqual(planReveal(event({ linesChanged: [[12, 14]] }), true), { kind: 'file', range: [12, 14] });
	});

	test('varias faixas: vale a primeira da lista, e nao a menor', () => {
		assert.deepStrictEqual(planReveal(event({ linesChanged: [[30, 31], [12, 14]] }), true), { kind: 'file', range: [30, 31] });
	});

	test('evento historico salta igual a um atual', () => {
		assert.deepStrictEqual(planReveal(event({ status: 'history' }), true), planReveal(event({ status: 'current' }), true));
	});

	test('evento parcial, sem antes, nao muda o plano', () => {
		assert.deepStrictEqual(planReveal(event({ beforeHash: undefined }), true), { kind: 'file', range: [12, 14] });
	});
});
