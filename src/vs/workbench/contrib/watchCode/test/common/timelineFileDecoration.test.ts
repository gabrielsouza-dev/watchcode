/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.
import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChangeEvent } from '../../../../../platform/changeLedger/common/changeEvent.js';
import { indexTouchedFiles, resourcesOf } from '../../common/timelineFileDecoration.js';

/** Pasta do workspace dos testes, na forma com que o VS Code escreve a URI. */
const WORKSPACE_FOLDER = URI.parse('file:///c%3A/ws');

/** Segunda pasta, para o caso de workspace com mais de uma raiz. */
const SECOND_FOLDER = URI.parse('file:///c%3A/outro');

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
		timestamp: 1767225600000,
		status: 'current',
		...overrides
	};
}

suite('watchCode timelineFileDecoration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('sem evento nenhum o indice sai vazio', () => {
		assert.deepStrictEqual(indexTouchedFiles([], [WORKSPACE_FOLDER]), new Map());
	});

	test('alteracao nao vista deixa o arquivo pendente', () => {
		assert.deepStrictEqual(indexTouchedFiles([changeEvent()], [WORKSPACE_FOLDER]), new Map([
			['file:///c%3A/ws/src/vs/base/a.ts', 'unviewed']
		]));
	});

	test('alteracao vista deixa o arquivo so com o rastro', () => {
		assert.deepStrictEqual(indexTouchedFiles([changeEvent({ viewedAt: 1767225600001 })], [WORKSPACE_FOLDER]), new Map([
			['file:///c%3A/ws/src/vs/base/a.ts', 'viewed']
		]));
	});

	test('uma alteracao pendente basta para o arquivo continuar pendente', () => {
		const events = [
			changeEvent({ id: 'event-1', viewedAt: 1767225600001 }),
			changeEvent({ id: 'event-2', viewedAt: 1767225600002 }),
			changeEvent({ id: 'event-3' })
		];

		assert.deepStrictEqual(indexTouchedFiles(events, [WORKSPACE_FOLDER]), new Map([
			['file:///c%3A/ws/src/vs/base/a.ts', 'unviewed']
		]));
	});

	test('com todas as alteracoes vistas o arquivo perde a pendencia', () => {
		const events = [
			changeEvent({ id: 'event-1', viewedAt: 1767225600001 }),
			changeEvent({ id: 'event-2', viewedAt: 1767225600002 })
		];

		assert.deepStrictEqual(indexTouchedFiles(events, [WORKSPACE_FOLDER]), new Map([
			['file:///c%3A/ws/src/vs/base/a.ts', 'viewed']
		]));
	});

	test('cada arquivo tocado tem o proprio estado', () => {
		const events = [
			changeEvent({ id: 'event-1', viewedAt: 1767225600001 }),
			changeEvent({ id: 'event-2', fileUri: 'src/vs/base/b.ts' })
		];

		assert.deepStrictEqual(indexTouchedFiles(events, [WORKSPACE_FOLDER]), new Map([
			['file:///c%3A/ws/src/vs/base/a.ts', 'viewed'],
			['file:///c%3A/ws/src/vs/base/b.ts', 'unviewed']
		]));
	});

	test('sem pasta de workspace nao ha chave para decorar', () => {
		assert.deepStrictEqual(indexTouchedFiles([changeEvent()], []), new Map());
	});

	test('um caminho vira um recurso por pasta, normalizado', () => {
		const resources = resourcesOf([WORKSPACE_FOLDER, SECOND_FOLDER], '.\\src\\vs\\base\\a.ts');

		assert.deepStrictEqual(resources.map(uri => uri.toString()), [
			'file:///c%3A/ws/src/vs/base/a.ts',
			'file:///c%3A/outro/src/vs/base/a.ts'
		]);
	});
});
