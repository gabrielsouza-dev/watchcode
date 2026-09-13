/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { ChangeEvent } from './changeEvent.js';

/** O que a linha do tempo tem, e quanto disso ainda não foi visto. */
export interface ITimelineSummary {
	/** Todas as alterações da lista. */
	readonly changes: number;
	/** Alterações que o desenvolvedor ainda não viu. */
	readonly unviewedChanges: number;
	/** Sessões (lotes) presentes na lista. */
	readonly sessions: number;
	/** Sessões com pelo menos uma alteração não vista. */
	readonly unviewedSessions: number;
}

/** Diz se a alteração ainda não foi vista. */
export function isUnviewed(event: ChangeEvent): boolean {
	return event.viewedAt === undefined;
}

/**
 * Resume a lista de eventos em ordem cronológica.
 *
 * O lote é **derivado**, e não guardado: ele é o conjunto das alterações que
 * compartilham o sessionId, e só deixa de ser novo quando **todas** as alterações
 * dele tiverem sido vistas. Lista vazia devolve tudo zerado.
 */
export function summarizeTimeline(events: readonly ChangeEvent[]): ITimelineSummary {
	/** Por sessão: alguma alteração dela ainda não foi vista? */
	const pendingPerSession = new Map<string, boolean>();
	let unviewedChanges = 0;

	for (const event of events) {
		const unviewed = isUnviewed(event);

		if (unviewed) {
			unviewedChanges++;
		}

		// Basta uma pendente para o lote inteiro continuar devendo leitura.
		pendingPerSession.set(event.sessionId, pendingPerSession.get(event.sessionId) === true || unviewed);
	}

	let unviewedSessions = 0;

	for (const pending of pendingPerSession.values()) {
		if (pending) {
			unviewedSessions++;
		}
	}

	return { changes: events.length, unviewedChanges, sessions: pendingPerSession.size, unviewedSessions };
}
