/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChangeEvent } from '../../common/changeEvent.js';
import { isUnviewed, summarizeTimeline } from '../../common/timelineSummary.js';

/** Evento completo; cada teste sobrescreve só o que importa. */
function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'E-0001',
		sessionId: 'S-0001',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'src/vs/base/a.ts',
		beforeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		afterHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		timestamp: 1767225600000,
		status: 'current',
		...overrides,
	};
}

suite('timelineSummary', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('lista vazia devolve tudo zerado', () => {
		assert.deepStrictEqual(summarizeTimeline([]), { changes: 0, unviewedChanges: 0, sessions: 0, unviewedSessions: 0 });
	});

	test('alteração sem viewedAt é nova, com viewedAt é vista', () => {
		assert.deepStrictEqual([isUnviewed(changeEvent()), isUnviewed(changeEvent({ viewedAt: 1767225600001 }))], [true, false]);
	});

	test('uma alteração nova conta como um lote novo', () => {
		assert.deepStrictEqual(summarizeTimeline([changeEvent()]), { changes: 1, unviewedChanges: 1, sessions: 1, unviewedSessions: 1 });
	});

	test('o lote com todas as alterações vistas deixa de ser novo', () => {
		const events = [
			changeEvent({ id: 'E-0001', viewedAt: 1767225600001 }),
			changeEvent({ id: 'E-0002', fileUri: 'src/vs/base/b.ts', viewedAt: 1767225600002 }),
		];

		assert.deepStrictEqual(summarizeTimeline(events), { changes: 2, unviewedChanges: 0, sessions: 1, unviewedSessions: 0 });
	});

	test('uma alteração pendente mantém o lote inteiro como novo', () => {
		const events = [
			changeEvent({ id: 'E-0001', viewedAt: 1767225600001 }),
			changeEvent({ id: 'E-0002', fileUri: 'src/vs/base/b.ts' }),
		];

		assert.deepStrictEqual(summarizeTimeline(events), { changes: 2, unviewedChanges: 1, sessions: 1, unviewedSessions: 1 });
	});

	test('dois lotes: só o que tem pendência conta como novo', () => {
		const events = [
			changeEvent({ id: 'E-0001', sessionId: 'S-0001', viewedAt: 1767225600001 }),
			changeEvent({ id: 'E-0002', sessionId: 'S-0001', fileUri: 'src/vs/base/b.ts', viewedAt: 1767225600002 }),
			changeEvent({ id: 'E-0003', sessionId: 'S-0002', fileUri: 'src/vs/base/c.ts' }),
		];

		assert.deepStrictEqual(summarizeTimeline(events), { changes: 3, unviewedChanges: 1, sessions: 2, unviewedSessions: 1 });
	});

	test('lote do mesmo id em instantes distantes continua sendo o mesmo lote', () => {
		const events = [
			changeEvent({ id: 'E-0001', sessionId: 'S-0001', timestamp: 1000 }),
			changeEvent({ id: 'E-0002', sessionId: 'S-0001', fileUri: 'src/vs/base/b.ts', timestamp: 999999 }),
		];

		assert.deepStrictEqual(summarizeTimeline(events).sessions, 1);
	});
});
