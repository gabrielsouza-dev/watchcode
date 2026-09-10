/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import type { ChangeSource } from './changeEvent.js';

/** Execução de um agente (ou surto de edições do desenvolvedor). */
export interface ChangeSession {
	readonly id: string;
	readonly source: ChangeSource;
	/** Epoch em milissegundos. */
	readonly startedAt: number;
	readonly endedAt?: number;
}
