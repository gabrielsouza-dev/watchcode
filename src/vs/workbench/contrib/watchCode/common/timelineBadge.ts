/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { localize } from '../../../../nls.js';

/**
 * Texto do contador do título da linha do tempo.
 *
 * Conta os **lotes** (sessões) que ainda têm alteração não vista: é o que o
 * desenvolvedor precisa saber de relance, sem abrir a lista. Zero devolve string
 * vazia, para o título ficar limpo quando não há nada pendente.
 */
export function formatUnviewedBatches(count: number): string {
	if (count <= 0) {
		return '';
	}

	return count === 1
		? localize('watchCode.timeline.oneNewBatch', "1 new batch")
		: localize('watchCode.timeline.newBatches', "{0} new batches", count);
}
