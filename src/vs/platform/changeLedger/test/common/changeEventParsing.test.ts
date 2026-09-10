/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CHANGE_ANNOUNCEMENT_SCHEMA_VERSION } from '../../common/changeEvent.js';
import { isChangeEventAttribution, isChangeEventStatus, isChangeLineRange, isChangeSource, parseChangeAnnouncement, type IChangeAnnouncementParseError } from '../../common/changeEventParsing.js';

/** Anúncio mínimo válido; cada teste sobrescreve só o que quer invalidar. */
function announcement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: CHANGE_ANNOUNCEMENT_SCHEMA_VERSION,
		id: 'A-0001',
		sessionId: 'S-0001',
		fileUri: 'src/vs/base/common/strings.ts',
		timestamp: 1767225600000,
		...overrides,
	};
}

function errorsOf(value: unknown): readonly IChangeAnnouncementParseError[] {
	const result = parseChangeAnnouncement(value);
	assert.strictEqual(result.ok, false, 'expected the parse to fail');

	return result.ok ? [] : result.errors;
}

function fieldsOf(value: unknown): string[] {
	return errorsOf(value).map(error => error.field).sort();
}

suite('changeAnnouncementParsing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts a minimal valid announcement', () => {
		const result = parseChangeAnnouncement(announcement());

		assert.ok(result.ok);
		assert.deepStrictEqual(result.announcement, {
			schemaVersion: CHANGE_ANNOUNCEMENT_SCHEMA_VERSION,
			id: 'A-0001',
			sessionId: 'S-0001',
			fileUri: 'src/vs/base/common/strings.ts',
			timestamp: 1767225600000,
		});
	});

	test('ignores unknown fields', () => {
		// A CLI pode acrescentar campos no futuro; nenhum deles vira parte do contrato.
		const result = parseChangeAnnouncement(announcement({ beforeHash: 'x', afterHash: 'y', linesChanged: [[1, 2]] }));

		assert.ok(result.ok);
		assert.deepStrictEqual(Object.keys(result.announcement).sort(), ['fileUri', 'id', 'schemaVersion', 'sessionId', 'timestamp']);
	});

	test('rejects values that are not objects', () => {
		for (const value of [undefined, null, 42, 'x', true, [], () => { /* não faz nada */ }, Symbol('x')]) {
			assert.deepStrictEqual(fieldsOf(value), ['(announcement)'], `expected '${String(value)}' to be rejected`);
		}
	});

	test('rejects an unsupported schema version', () => {
		assert.deepStrictEqual(fieldsOf(announcement({ schemaVersion: CHANGE_ANNOUNCEMENT_SCHEMA_VERSION + 1 })), ['schemaVersion']);
		assert.deepStrictEqual(fieldsOf(announcement({ schemaVersion: undefined })), ['schemaVersion']);
		assert.deepStrictEqual(fieldsOf(announcement({ schemaVersion: '1' })), ['schemaVersion']);
	});

	test('reports every invalid field at once', () => {
		assert.deepStrictEqual(fieldsOf(announcement({ id: 7, fileUri: '/etc/hosts', timestamp: 0 })), ['fileUri', 'id', 'timestamp']);
	});

	test('reports missing required fields', () => {
		for (const field of ['id', 'sessionId', 'fileUri', 'timestamp']) {
			const value = announcement();
			delete value[field];

			const errors = errorsOf(value);
			assert.strictEqual(errors.length, 1, `expected a single error for '${field}'`);
			assert.strictEqual(errors[0].field, field);
			assert.strictEqual(errors[0].code, 'missing-field');
		}
	});

	test('treats blank strings as missing', () => {
		assert.deepStrictEqual(fieldsOf(announcement({ id: '   ' })), ['id']);
		assert.deepStrictEqual(fieldsOf(announcement({ sessionId: '' })), ['sessionId']);
		assert.deepStrictEqual(fieldsOf(announcement({ fileUri: ' ' })), ['fileUri']);
	});

	test('rejects paths that are not workspace relative', () => {
		for (const fileUri of ['/etc/hosts', 'C:\\\\repo\\\\a.ts', 'a/../b.ts', '..', '\\\\\\\\server\\\\share\\\\a.ts']) {
			const errors = errorsOf(announcement({ fileUri }));

			assert.strictEqual(errors.length, 1, `expected '${fileUri}' to be rejected`);
			assert.strictEqual(errors[0].field, 'fileUri');
		}
	});

	test('accepts workspace relative paths', () => {
		for (const fileUri of ['a.ts', 'src/vs/base/a.ts', 'src\\vs\\base\\a.ts', '.aih/events.jsonl']) {
			assert.ok(parseChangeAnnouncement(announcement({ fileUri })).ok, `expected '${fileUri}' to be accepted`);
		}
	});

	test('validates the timestamp', () => {
		for (const timestamp of [-1, 0, NaN, Infinity, '1767225600000', 1.5, null]) {
			assert.deepStrictEqual(fieldsOf(announcement({ timestamp })), ['timestamp'], `expected '${String(timestamp)}' to be rejected`);
		}
	});

	test('never throws', () => {
		const exotic: unknown[] = [undefined, null, Symbol('x'), () => { /* não faz nada */ }, new Date(), new Map()];

		for (const value of exotic) {
			assert.doesNotThrow(() => parseChangeAnnouncement(value));
		}
	});
});

suite('changeEventGuards', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isChangeSource', () => {
		assert.ok(isChangeSource('agent'));
		assert.ok(isChangeSource('developer'));
		assert.strictEqual(isChangeSource('robot'), false);
		assert.strictEqual(isChangeSource(undefined), false);
	});

	test('isChangeEventAttribution', () => {
		assert.ok(isChangeEventAttribution('hook'));
		assert.ok(isChangeEventAttribution('observed'));
		assert.strictEqual(isChangeEventAttribution('guess'), false);
		assert.strictEqual(isChangeEventAttribution(null), false);
	});

	test('isChangeEventStatus', () => {
		assert.ok(isChangeEventStatus('current'));
		assert.ok(isChangeEventStatus('history'));
		assert.strictEqual(isChangeEventStatus('stale'), false);
	});

	test('isChangeLineRange', () => {
		assert.ok(isChangeLineRange([1, 1]));
		assert.ok(isChangeLineRange([3, 9]));
		assert.strictEqual(isChangeLineRange([2, 1]), false);
		assert.strictEqual(isChangeLineRange([0, 1]), false);
		assert.strictEqual(isChangeLineRange([1]), false);
		assert.strictEqual(isChangeLineRange([1, 2, 3]), false);
		assert.strictEqual(isChangeLineRange('1-2'), false);
	});
});
