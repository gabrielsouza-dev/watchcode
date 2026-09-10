/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DEFAULT_PAUSE_MS, SessionGrouper } from '../../common/sessionGrouper.js';

/** Instante fixo: o agrupamento depende do tempo, não do relógio. */
const START = 1767225600000;

suite('sessionGrouper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('escritas dentro da pausa compartilham a sessão', () => {
		const grouper = new SessionGrouper();

		const first = grouper.sessionFor('folder', START);
		const second = grouper.sessionFor('folder', START + DEFAULT_PAUSE_MS - 1);

		assert.strictEqual(second, first);
	});

	test('uma escrita depois da pausa abre outra sessão', () => {
		const grouper = new SessionGrouper();

		const first = grouper.sessionFor('folder', START);
		const second = grouper.sessionFor('folder', START + DEFAULT_PAUSE_MS);

		assert.notStrictEqual(second, first);
	});

	test('pastas diferentes têm sessões independentes', () => {
		const grouper = new SessionGrouper();

		const a = grouper.sessionFor('a', START);
		const b = grouper.sessionFor('b', START);

		assert.notStrictEqual(b, a);
		assert.strictEqual(grouper.sessionFor('a', START + 1), a);
	});

	test('closeExpired fecha só as sessões vencidas', () => {
		const grouper = new SessionGrouper();
		const closed: string[] = [];

		const a = grouper.sessionFor('a', START);
		const b = grouper.sessionFor('b', START + DEFAULT_PAUSE_MS);

		grouper.closeExpired(START + DEFAULT_PAUSE_MS, sessionId => closed.push(sessionId));

		assert.deepStrictEqual(closed, [a]);
		assert.strictEqual(grouper.sessionFor('b', START + DEFAULT_PAUSE_MS + 1), b);
	});

	test('closeAll fecha tudo o que ficou aberto', () => {
		const grouper = new SessionGrouper();
		const closed: string[] = [];

		const a = grouper.sessionFor('a', START);
		const b = grouper.sessionFor('b', START);

		grouper.closeAll(sessionId => closed.push(sessionId));

		assert.deepStrictEqual(closed.sort(), [a, b].sort());
		assert.notStrictEqual(grouper.sessionFor('a', START + 1), a);
	});
});
