/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

/** Para onde o evento ativo anda. */
export type NavigationDirection = 'next' | 'previous';

/**
 * O id que passa a ser o evento ativo.
 *
 * Sem evento ativo — ou com um id que já não está na lista — o passo entra pela
 * ponta: "próximo" começa no primeiro e "anterior" no último. Nas pontas o passo
 * para, sem dar a volta, e só a lista vazia devolve `undefined`.
 */
export function stepActiveId(ids: readonly string[], activeId: string | undefined, direction: NavigationDirection): string | undefined {
	if (ids.length === 0) {
		return undefined;
	}

	const current = activeId === undefined ? -1 : ids.indexOf(activeId);

	// Id desconhecido vale como nenhum: a proxima parada e a ponta.
	if (current < 0) {
		return direction === 'next' ? ids[0] : ids[ids.length - 1];
	}

	const step = direction === 'next' ? 1 : -1;

	return ids[Math.min(Math.max(current + step, 0), ids.length - 1)];
}
