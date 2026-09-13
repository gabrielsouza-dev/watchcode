/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CHANGE_DOCUMENT_SCHEMES, BEFORE_DOCUMENT_SCHEME, AFTER_DOCUMENT_SCHEME, changeDocumentOf, changeDocumentResource, parseChangeDocument } from '../../common/changeDocument.js';
import { ChangeEvent } from '../../common/changeEvent.js';

/** Hash de conteudo bem formado; um por lado, para nao confundir os dois. */
const HASH_ANTES = 'a'.repeat(40);
const HASH_DEPOIS = 'b'.repeat(40);

/** Arquivo do workspace, como quem abre o documento o resolve. */
const ARQUIVO = URI.file('/workspace/src/regra.ts');

/** Evento completo; cada teste sobrescreve só o que importa. */
function evento(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'E-0001',
		sessionId: 'S-0001',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'src/regra.ts',
		beforeHash: HASH_ANTES,
		afterHash: HASH_DEPOIS,
		linesChanged: [[2, 2]],
		timestamp: 1767225600000,
		status: 'current',
		...overrides,
	};
}

suite('watchCode changeDocument', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('o documento do antes tem o esquema do produto, o caminho do arquivo e o hash', () => {
		const documento = changeDocumentResource('before', ARQUIVO, HASH_ANTES);

		assert.deepStrictEqual(
			{ scheme: documento.scheme, path: documento.path, query: documento.query },
			{ scheme: 'aih-before', path: '/workspace/src/regra.ts', query: 'hash=' + HASH_ANTES });
	});

	test('o documento do depois troca só o esquema', () => {
		const documento = changeDocumentResource('after', ARQUIVO, HASH_DEPOIS);

		assert.deepStrictEqual(
			{ scheme: documento.scheme, path: documento.path, query: documento.query },
			{ scheme: 'aih-after', path: '/workspace/src/regra.ts', query: 'hash=' + HASH_DEPOIS });
	});

	test('autoridade e fragmento do arquivo de origem não entram no documento', () => {
		const compartilhado = URI.from({ scheme: 'file', authority: 'servidor', path: '/compartilhado/regra.ts', fragment: 'L42' });
		const documento = changeDocumentResource('after', compartilhado, HASH_DEPOIS);

		assert.deepStrictEqual(
			{ authority: documento.authority, path: documento.path, fragment: documento.fragment },
			{ authority: '', path: '/compartilhado/regra.ts', fragment: '' });
	});

	test('o leitor devolve o que o construtor montou', () => {
		assert.deepStrictEqual(
			parseChangeDocument(changeDocumentResource('before', ARQUIVO, HASH_ANTES)),
			{ side: 'before', contentHash: HASH_ANTES });
	});

	test('recurso sem consulta não é documento do produto', () => {
		assert.deepStrictEqual(
			parseChangeDocument(URI.from({ scheme: BEFORE_DOCUMENT_SCHEME, path: '/workspace/src/regra.ts' })),
			undefined);
	});

	test('hash fora do formato não é documento do produto', () => {
		const curto = URI.from({ scheme: BEFORE_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'hash=' + 'a'.repeat(39) });
		const maiusculo = URI.from({ scheme: BEFORE_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'hash=' + 'A'.repeat(40) });
		const fora = URI.from({ scheme: BEFORE_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'hash=' + 'g'.repeat(40) });
		const vazio = URI.from({ scheme: BEFORE_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'hash=' });

		assert.deepStrictEqual([curto, maiusculo, fora, vazio].map(parseChangeDocument), [undefined, undefined, undefined, undefined]);
	});

	test('consulta com parâmetro a mais não é documento do produto', () => {
		const depois = URI.from({ scheme: AFTER_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'hash=' + HASH_DEPOIS + '&outro=1' });
		const antes = URI.from({ scheme: AFTER_DOCUMENT_SCHEME, path: '/x/y.ts', query: 'outro=1&hash=' + HASH_DEPOIS });
		const semNome = URI.from({ scheme: AFTER_DOCUMENT_SCHEME, path: '/x/y.ts', query: HASH_DEPOIS });

		assert.deepStrictEqual([depois, antes, semNome].map(parseChangeDocument), [undefined, undefined, undefined]);
	});

	test('esquema alheio não é documento do produto', () => {
		const arquivo = URI.file('/x/y.ts').with({ query: 'hash=' + HASH_ANTES });
		const outro = URI.from({ scheme: 'aih-outro', path: '/x/y.ts', query: 'hash=' + HASH_ANTES });

		assert.deepStrictEqual([arquivo, outro].map(parseChangeDocument), [undefined, undefined]);
	});

	test('os dois esquemas do produto são os dois lados da alteração', () => {
		assert.deepStrictEqual(CHANGE_DOCUMENT_SCHEMES, ['aih-before', 'aih-after']);
	});

	test('evento completo devolve o documento dos dois lados, cada um com o seu hash', () => {
		const completo = evento();

		assert.deepStrictEqual(
			[changeDocumentOf(completo, 'before', ARQUIVO), changeDocumentOf(completo, 'after', ARQUIVO)].map(parseChangeDocument),
			[{ side: 'before', contentHash: HASH_ANTES }, { side: 'after', contentHash: HASH_DEPOIS }]);
	});

	test('evento sem antes não devolve documento do lado de antes', () => {
		assert.deepStrictEqual(
			changeDocumentOf(evento({ beforeHash: undefined }), 'before', ARQUIVO),
			undefined);
	});

	test('evento sem depois não devolve documento do lado de depois', () => {
		assert.deepStrictEqual(
			changeDocumentOf(evento({ afterHash: undefined }), 'after', ARQUIVO),
			undefined);
	});

	test('o documento do evento é o mesmo recurso que o construtor monta', () => {
		assert.deepStrictEqual(
			changeDocumentOf(evento(), 'before', ARQUIVO)?.toString(),
			changeDocumentResource('before', ARQUIVO, HASH_ANTES).toString());
	});
});
