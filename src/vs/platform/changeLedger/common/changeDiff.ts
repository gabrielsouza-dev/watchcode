/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { IDiffChange, ISequence, LcsDiff } from '../../../base/common/diff/diff.js';
import { ChangeLineRange } from './changeEvent.js';

/**
 * Acima deste numero de linhas por lado o diff deixa de ser fino.
 *
 * O diff de verdade e O(ND): o custo vem do **numero de diferencas**, nao do
 * tamanho do arquivo. Medido no pior caso (conteudo inteiramente diferente), 4000
 * linhas custam cerca de 460 ms e 12000 custam cerca de 3 s — tempo demais para o
 * caminho da observacao, que roda na janela. Acima do limite o diff e um bloco so,
 * pelo recorte de prefixo e sufixo: para um arquivo reescrito por inteiro o
 * resultado e o mesmo, e um arquivo grande com uma alteracao local nao perde nada.
 */
export const MAX_DIFF_LINES = 4000;

/** O que a alteracao consumiu de um lado e produziu do outro. */
export interface IChangeHunk {
	/** Linhas do arquivo antes que a alteracao consumiu; ausente na insercao pura. */
	readonly before?: ChangeLineRange;
	/** Linhas do arquivo depois que a alteracao produziu; ausente na remocao pura. */
	readonly after?: ChangeLineRange;
	/**
	 * Linha do arquivo depois onde a remocao pura caiu, 1-based.
	 *
	 * E a linha que o salto abre e que a linha do tempo mostra quando nada entrou
	 * no lugar do que saiu. Ausente quando ha lado de depois — a faixa ja diz onde
	 * ele esta — e quando o arquivo depois nao tem linha nenhuma.
	 */
	readonly afterLine?: number;
}

/** O diff entre os dois conteudos de um evento. */
export interface IChangeDiff {
	/** Em ordem de leitura; vazio quando nada mudou. */
	readonly hunks: readonly IChangeHunk[];
	/** Linhas somadas; a linha trocada conta uma somada e uma removida. */
	readonly addedLines: number;
	/** Linhas removidas. */
	readonly removedLines: number;
	/** O diff nao e fino: veio do limite de tamanho ou do corte do proprio algoritmo. */
	readonly coarse: boolean;
}

/**
 * Diff de linhas entre os dois conteudos de um evento.
 *
 * Ausente e conteudo vazio: o arquivo novo tem o arquivo inteiro como um hunk, e o
 * arquivo removido tem o que havia nele. A comparacao e por linha exata, com a
 * quebra final e o fim de linha do sistema normalizados — as duas coisas mudam
 * sozinhas no disco e nao sao alteracao do agente.
 */
export function computeChangeDiff(before: VSBuffer | undefined, after: VSBuffer | undefined): IChangeDiff {
	const beforeLines = toLines(before);
	const afterLines = toLines(after);

	// Arquivo grande nao entra no diff fino: o bloco unico responde o que ele responderia.
	if (beforeLines.length > MAX_DIFF_LINES || afterLines.length > MAX_DIFF_LINES) {
		return summarize(boundingHunks(beforeLines, afterLines), true);
	}

	const result = new LcsDiff(new LineSequence(beforeLines), new LineSequence(afterLines)).ComputeDiff(true);

	return summarize(result.changes.map(change => hunkOf(change, afterLines.length)), result.quitEarly);
}

/**
 * Faixas do arquivo depois, para o salto e para a linha do tempo.
 *
 * Uma faixa por hunk, na ordem em que eles aparecem: o lado de depois quando o hunk
 * produziu linha, e a linha onde a remocao caiu quando ele so removeu. Arquivo
 * depois sem linha nenhuma nao tem onde apontar.
 */
export function changedLineRanges(diff: IChangeDiff): ChangeLineRange[] {
	const ranges: ChangeLineRange[] = [];

	for (const hunk of diff.hunks) {
		const range: ChangeLineRange | undefined = hunk.after ?? (hunk.afterLine !== undefined ? [hunk.afterLine, hunk.afterLine] : undefined);

		if (range) {
			ranges.push(range);
		}
	}

	return ranges;
}

/** Sequencia de linhas para o algoritmo de diff da base. */
class LineSequence implements ISequence {

	constructor(private readonly lines: string[]) { }

	getElements(): string[] {
		return this.lines;
	}
}

/** Hunk a partir de uma mudanca 0-based do algoritmo. */
function hunkOf(change: IDiffChange, afterLineCount: number): IChangeHunk {
	const before = rangeOf(change.originalStart, change.originalLength);
	const after = rangeOf(change.modifiedStart, change.modifiedLength);

	// Nada entrou no lugar: a unica linha para apontar e a que ficou naquele ponto.
	const afterLine = !after && afterLineCount > 0 ? Math.min(change.modifiedStart + 1, afterLineCount) : undefined;

	return { ...(before ? { before } : {}), ...(after ? { after } : {}), ...(afterLine !== undefined ? { afterLine } : {}) };
}

/** Faixa 1-based de um trecho 0-based; ausente quando o trecho nao tem linha. */
function rangeOf(start: number, length: number): ChangeLineRange | undefined {
	return length > 0 ? [start + 1, start + length] : undefined;
}

/**
 * Um hunk so, do primeiro ao ultimo ponto diferente.
 *
 * E o diff que se calcula sem custo nenhum: recorta o prefixo e o sufixo iguais e o
 * que sobra e o bloco alterado. Serve para o arquivo grande e responde certo quando
 * a alteracao e uma so.
 */
function boundingHunks(beforeLines: readonly string[], afterLines: readonly string[]): IChangeHunk[] {
	const start = commonPrefixLength(beforeLines, afterLines);
	const end = commonSuffixLength(beforeLines, afterLines, start);
	const beforeEnd = beforeLines.length - end;
	const afterEnd = afterLines.length - end;

	if (start >= beforeEnd && start >= afterEnd) {
		return [];
	}

	const hunk: { before?: ChangeLineRange; after?: ChangeLineRange; afterLine?: number } = {};

	if (beforeEnd > start) {
		hunk.before = [start + 1, beforeEnd];
	}

	if (afterEnd > start) {
		hunk.after = [start + 1, afterEnd];
	}

	if (!hunk.after && afterLines.length > 0) {
		hunk.afterLine = Math.min(start + 1, afterLines.length);
	}

	return [hunk];
}

/** Quantas linhas do comeco sao iguais nos dois lados. */
function commonPrefixLength(first: readonly string[], second: readonly string[]): number {
	let length = 0;

	while (length < first.length && length < second.length && first[length] === second[length]) {
		length++;
	}

	return length;
}

/** Quantas linhas do fim sao iguais nos dois lados, sem invadir o prefixo. */
function commonSuffixLength(first: readonly string[], second: readonly string[], prefix: number): number {
	let length = 0;

	while (first.length - length > prefix && second.length - length > prefix
		&& first[first.length - length - 1] === second[second.length - length - 1]) {
		length++;
	}

	return length;
}

/** Fecha o diff com o que se conta dos hunks. */
function summarize(hunks: readonly IChangeHunk[], coarse: boolean): IChangeDiff {
	let addedLines = 0;
	let removedLines = 0;

	for (const hunk of hunks) {
		addedLines += lineCount(hunk.after);
		removedLines += lineCount(hunk.before);
	}

	// Sem hunk nao ha o que ser grosso: a resposta "nada mudou" e exata.
	return { hunks, addedLines, removedLines, coarse: coarse && hunks.length > 0 };
}

/** Linhas de uma faixa. */
function lineCount(range: ChangeLineRange | undefined): number {
	return range ? range[1] - range[0] + 1 : 0;
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
