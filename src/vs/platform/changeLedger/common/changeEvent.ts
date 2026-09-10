/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

/** Versão do schema do anúncio aceita por esta versão do produto. */
export const CHANGE_ANNOUNCEMENT_SCHEMA_VERSION = 1;

/** Quem produziu a alteração. */
export type ChangeSource = 'agent' | 'developer';

/** Como o evento foi obtido. */
export type ChangeEventAttribution = 'hook' | 'observed';

/**
 * Estado da entrada na linha do tempo.
 *
 * É 'current' enquanto o hash do arquivo no disco for igual ao 'afterHash';
 * qualquer alteração posterior transforma a entrada em 'history'.
 */
export type ChangeEventStatus = 'current' | 'history';

/** Intervalo de linhas 1-based, inclusivo nas duas pontas. */
export type ChangeLineRange = readonly [startLine: number, endLine: number];

/**
 * Anúncio do hook: identidade e intenção, sem conteúdo.
 *
 * É o payload de uma linha do `.aih/events.jsonl`. Opcional por natureza:
 * existe só para enriquecer o evento que a IDE monta a partir do disco.
 */
export interface ChangeAnnouncement {
	readonly schemaVersion: number;
	readonly id: string;
	readonly sessionId: string;
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Epoch em milissegundos. */
	readonly timestamp: number;
}

/**
 * Evento na linha do tempo.
 *
 * Hashes, linhas alteradas e status são calculados pela IDE a partir do disco
 * (com o baseline), nunca enviados pelo agente.
 */
export interface ChangeEvent {
	readonly id: string;
	/** Do anúncio quando existe; do agrupamento por pausa quando não existe. */
	readonly sessionId: string;
	readonly source: ChangeSource;
	readonly attribution: ChangeEventAttribution;
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Ausente quando não houve baseline: o evento é parcial. */
	readonly beforeHash?: string;
	readonly afterHash: string;
	/** Presente quando conhecido; o diff é recalculado de qualquer forma. */
	readonly linesChanged?: readonly ChangeLineRange[];
	/** Epoch em milissegundos. */
	readonly timestamp: number;
	readonly status: ChangeEventStatus;
}
