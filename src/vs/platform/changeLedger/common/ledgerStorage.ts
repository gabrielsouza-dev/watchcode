/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { hash } from '../../../base/common/hash.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { isContentHash } from './snapshotHash.js';

/** Nome da pasta que guarda os dados do ledger dentro do armazenamento do workspace. */
const LEDGER_FOLDER = 'changeLedger';

/** Subpastas do ledger. */
const EVENTS_FOLDER = 'events';
const INDEX_FOLDER = 'index';
const SNAPSHOTS_FOLDER = 'snapshots';
const SHADOW_FOLDER = 'shadow';

/**
 * Layout de diretórios do ledger.
 *
 * O ledger mora no armazenamento por workspace do próprio editor, e não dentro
 * do workspace observado: isso mantém o repositório do desenvolvedor limpo e
 * impede que o observador reaja às escritas do próprio ledger.
 */
export interface ILedgerStorageLayout {
	/** Um arquivo JSON por evento — é a fonte da verdade do histórico. */
	readonly eventsDir: URI;
	/** Índice por arquivo, derivado dos eventos: qual entrada está atual. */
	readonly indexDir: URI;
	/** Conteúdo dos arquivos, endereçado por hash. */
	readonly snapshotsDir: URI;
	/** Sombra: o último conteúdo observado de cada arquivo. */
	readonly shadowDir: URI;
}

/** Monta o layout do ledger para um workspace. */
export function createLedgerStorageLayout(workspaceStorageRoot: URI, workspaceId: string): ILedgerStorageLayout {
	const root = joinPath(workspaceStorageRoot, workspaceId, LEDGER_FOLDER);

	return {
		eventsDir: joinPath(root, EVENTS_FOLDER),
		indexDir: joinPath(root, INDEX_FOLDER),
		snapshotsDir: joinPath(root, SNAPSHOTS_FOLDER),
		shadowDir: joinPath(root, SHADOW_FOLDER)
	};
}

/** Caminho do arquivo de um evento. */
export function eventResource(layout: ILedgerStorageLayout, eventId: string): URI {
	return joinPath(layout.eventsDir, `${eventId}.json`);
}

/**
 * Caminho do índice de atualidade de um arquivo do workspace.
 *
 * O nome do arquivo é derivado do caminho, e não o próprio caminho: caminhos
 * contêm separadores e ':' que são inválidos em nome de arquivo no Windows.
 */
export function fileIndexResource(layout: ILedgerStorageLayout, fileUri: string): URI {
	return joinPath(layout.indexDir, `${fileKey(fileUri)}.json`);
}

/** Caminho de um snapshot. */
export function snapshotResource(layout: ILedgerStorageLayout, contentHash: string): URI {
	return joinPath(layout.snapshotsDir, contentHash);
}

/**
 * Caminho da sombra de um arquivo do workspace.
 *
 * Como no índice, o nome vem do caminho e não é o próprio caminho.
 */
export function shadowResource(layout: ILedgerStorageLayout, fileUri: string): URI {
	return joinPath(layout.shadowDir, `${fileKey(fileUri)}.json`);
}

/**
 * Converte o caminho relativo de um arquivo do workspace em uma chave estável.
 *
 * Dois caminhos que só diferem no separador (`a/b` e `a\\b`) produzem a mesma
 * chave, e dois arquivos distintos nunca colidem.
 */
export function fileKey(fileUri: string): string {
	return (hash(normalizeFilePath(fileUri)) >>> 0).toString(16).padStart(8, '0');
}

/** Normaliza o caminho: separadores uniformes e sem prefixo relativo. */
function normalizeFilePath(fileUri: string): string {
	let normalized = fileUri.trim().replace(/\\/g, '/');

	while (normalized.startsWith('./')) {
		normalized = normalized.slice(2);
	}

	return normalized;
}

/** Reexportado para os consumidores do layout não precisarem do módulo de hash. */
export { isContentHash };
