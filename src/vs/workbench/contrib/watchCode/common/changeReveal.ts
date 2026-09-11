/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { ChangeEvent, ChangeLineRange } from '../../../../platform/changeLedger/common/changeEvent.js';

/** Por que nao ha o que abrir. */
export type RevealMissReason = 'removed' | 'absent';

/** O que o salto deve fazer com um evento. */
export type RevealPlan =
	| { readonly kind: 'file'; readonly range: ChangeLineRange | undefined }
	| { readonly kind: 'missing'; readonly because: RevealMissReason };

/**
 * Decide o salto, sem tocar em disco, em editor ou em servico.
 *
 * A remocao registrada tem precedencia sobre o arquivo que sumiu: o evento diz que
 * a alteracao foi remover o arquivo, e e essa a informacao que o aviso precisa dar.
 * O status do evento nao entra na conta — um evento historico salta igual a um
 * atual, porque quem avisa que o trecho mudou e a E5-T1.
 */
export function planReveal(event: ChangeEvent, fileExists: boolean): RevealPlan {
	if (event.afterHash === undefined) {
		return { kind: 'missing', because: 'removed' };
	}

	if (!fileExists) {
		return { kind: 'missing', because: 'absent' };
	}

	// Varias faixas: a primeira e a que o salto mostra; as outras sao a E3-T3.
	return { kind: 'file', range: event.linesChanged?.[0] };
}
