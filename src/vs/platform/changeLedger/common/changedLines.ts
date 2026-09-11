/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { ChangeLineRange } from './changeEvent.js';

/**
 * Faixa de linhas alteradas entre dois conteudos.
 *
 * Compara as pontas: acha a primeira linha diferente pelo comeco e a ultima pelo
 * fim, e o que sobra no meio e a faixa — referida ao arquivo **depois**, que e a
 * versao que o salto abre.
 *
 * E a versao minima e honesta do diff: nao separa hunks, nao conta linhas
 * removidas e nao conhece deslocamento de bloco, o que a E3-T1 faz. Serve para a
 * linha do tempo dizer onde a alteracao caiu e para o salto ter onde parar.
 */
export function changedLineRange(before: VSBuffer | undefined, after: VSBuffer | undefined): ChangeLineRange | undefined {
	// Sem arquivo depois nao ha linha para apontar: a alteracao foi uma remocao.
	if (!after) {
		return undefined;
	}

	const antes = toLines(before);
	const depois = toLines(after);

	let inicio = 0;
	while (inicio < antes.length && inicio < depois.length && antes[inicio] === depois[inicio]) {
		inicio++;
	}

	let fimAntes = antes.length - 1;
	let fimDepois = depois.length - 1;
	while (fimDepois >= inicio && fimAntes >= inicio && antes[fimAntes] === depois[fimDepois]) {
		fimAntes--;
		fimDepois--;
	}

	if (fimDepois < inicio) {
		// O que sobrou e todo igual: ou nada mudou, ou o trecho saiu do arquivo.
		if (inicio >= antes.length || depois.length === 0) {
			return undefined;
		}

		// Remocao pura: a alteracao fica onde o trecho saiu.
		const linha = Math.min(inicio, depois.length - 1) + 1;

		return [linha, linha];
	}

	return [inicio + 1, fimDepois + 1];
}

/** Linhas de um conteudo, sem a quebra final e sem depender do fim de linha do sistema. */
function toLines(content: VSBuffer | undefined): string[] {
	if (!content) {
		return [];
	}

	const linhas = content.toString().replace(/\r\n/g, '\n').split('\n');

	if (linhas.length > 0 && linhas[linhas.length - 1] === '') {
		linhas.pop();
	}

	return linhas;
}
