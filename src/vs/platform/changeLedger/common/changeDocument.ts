/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { URI } from '../../../base/common/uri.js';
import { ChangeEvent } from './changeEvent.js';
import { isContentHash } from './snapshotHash.js';

/** Lado da alteracao que um documento virtual mostra. */
export type ChangeDocumentSide = 'before' | 'after';

/** Esquema do documento com o conteudo de antes da alteracao. */
export const BEFORE_DOCUMENT_SCHEME = 'aih-before';

/** Esquema do documento com o conteudo de depois da alteracao. */
export const AFTER_DOCUMENT_SCHEME = 'aih-after';

/** Os dois esquemas, como o produto os registra. */
export const CHANGE_DOCUMENT_SCHEMES: readonly string[] = [BEFORE_DOCUMENT_SCHEME, AFTER_DOCUMENT_SCHEME];

/** Nome do parametro da consulta que carrega o hash do conteudo. */
export const CHANGE_DOCUMENT_HASH_PARAM = 'hash';

/** O que um recurso de documento pede: o lado e o hash do conteudo. */
export interface IChangeDocumentRequest {
	readonly side: ChangeDocumentSide;
	readonly contentHash: string;
}

/** Esquema de um lado da alteracao. */
function schemeOf(side: ChangeDocumentSide): string {
	return side === 'before' ? BEFORE_DOCUMENT_SCHEME : AFTER_DOCUMENT_SCHEME;
}

/** Lado de um esquema, ou `undefined` quando o esquema nao e do produto. */
function sideOf(scheme: string): ChangeDocumentSide | undefined {
	if (scheme === BEFORE_DOCUMENT_SCHEME) {
		return 'before';
	}

	return scheme === AFTER_DOCUMENT_SCHEME ? 'after' : undefined;
}

/**
 * Documento de um lado da alteracao, para o arquivo informado.
 *
 * O caminho e o do arquivo real — da idioma ao editor e nome a aba — e a consulta
 * carrega o hash, que e o que o provedor le. Autoridade e fragmento do recurso de
 * origem nao entram: o documento e do arquivo local, e a posicao `#L42` e do
 * arquivo, nao do snapshot.
 */
export function changeDocumentResource(side: ChangeDocumentSide, file: URI, contentHash: string): URI {
	return URI.from({
		scheme: schemeOf(side),
		path: file.path,
		query: `${CHANGE_DOCUMENT_HASH_PARAM}=${contentHash}`
	});
}

/**
 * O que o recurso pede, ou `undefined` quando nao e documento do produto.
 *
 * A consulta tem de ser exatamente o par esperado: um hash de trinta e nove
 * caracteres, em maiusculas ou acompanhado de outro parametro e erro de quem
 * montou o URI, e responder "nenhum documento" e mais honesto do que adivinhar.
 */
export function parseChangeDocument(resource: URI): IChangeDocumentRequest | undefined {
	const side = sideOf(resource.scheme);

	if (side === undefined) {
		return undefined;
	}

	const prefix = `${CHANGE_DOCUMENT_HASH_PARAM}=`;

	if (!resource.query.startsWith(prefix)) {
		return undefined;
	}

	const contentHash = resource.query.slice(prefix.length);

	return isContentHash(contentHash) ? { side, contentHash } : undefined;
}

/**
 * Documento de um evento, ou `undefined` quando aquele lado nao existe.
 *
 * Evento parcial nao tem "antes" e remocao nao tem "depois": nos dois casos nao ha
 * conteudo guardado, e documento nenhum e a resposta certa.
 */
export function changeDocumentOf(event: ChangeEvent, side: ChangeDocumentSide, file: URI): URI | undefined {
	const contentHash = side === 'before' ? event.beforeHash : event.afterHash;

	return contentHash ? changeDocumentResource(side, file, contentHash) : undefined;
}
