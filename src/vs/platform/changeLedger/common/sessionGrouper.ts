/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { generateUuid } from '../../../base/common/uuid.js';

/** Pausa que separa duas sessões de observação, em milissegundos. */
export const DEFAULT_PAUSE_MS = 1500;

/** Sessão aberta de uma pasta, com o instante da última escrita vista. */
interface IOpenSession {
	readonly sessionId: string;
	lastWriteAt: number;
}

/**
 * Decide o sessionId de uma escrita, agrupando as que estão próximas no tempo.
 *
 * Não observa nada e não conhece o disco: recebe o instante de cada escrita e
 * devolve a que sessão ela pertence. É o que permite testar o agrupamento sem
 * watcher nem arquivo real.
 */
export class SessionGrouper {

	private readonly openSessions = new Map<string, IOpenSession>();

	constructor(private readonly pauseMs: number = DEFAULT_PAUSE_MS) { }

	/**
	 * Devolve o id da sessão de uma escrita da pasta.
	 *
	 * Uma escrita dentro da pausa continua a sessão aberta; uma escrita depois
	 * dela abre outra, e a anterior deixa de ser considerada atual.
	 */
	sessionFor(folderKey: string, timestamp: number): string {
		const open = this.openSessions.get(folderKey);

		if (open && timestamp - open.lastWriteAt < this.pauseMs) {
			open.lastWriteAt = timestamp;

			return open.sessionId;
		}

		const sessionId = generateUuid();

		this.openSessions.set(folderKey, { sessionId, lastWriteAt: timestamp });

		return sessionId;
	}

	/** Fecha as sessões cuja pausa já venceu. */
	closeExpired(timestamp: number, closeSession: (sessionId: string) => void): void {
		for (const [folderKey, open] of this.openSessions) {
			if (timestamp - open.lastWriteAt >= this.pauseMs) {
				this.openSessions.delete(folderKey);
				closeSession(open.sessionId);
			}
		}
	}

	/** Fecha tudo, no stop. */
	closeAll(closeSession: (sessionId: string) => void): void {
		for (const open of this.openSessions.values()) {
			closeSession(open.sessionId);
		}

		this.openSessions.clear();
	}
}
