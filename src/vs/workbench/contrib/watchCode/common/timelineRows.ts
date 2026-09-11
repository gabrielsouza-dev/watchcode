/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { ChangeEvent, ChangeEventAttribution, ChangeLineRange } from '../../../../platform/changeLedger/common/changeEvent.js';

/**
 * Linha pronta para desenhar.
 *
 * Nao guarda servico nem DOM: e o que a lista mostra de um evento, ja resolvido,
 * para que a decisao de como escrever cada trecho fique testavel fora da view.
 */
export interface TimelineRow {
	readonly id: string;
	readonly fileUri: string;
	/** Ultimo segmento do caminho. */
	readonly fileName: string;
	/** Caminho ate o arquivo, sem o nome; vazio quando o arquivo esta na raiz. */
	readonly folderPath: string;
	/** '12', '12-14' ou varios intervalos separados por virgula; vazio quando nao ha. */
	readonly lines: string;
	/** Hora local, no formato HH:MM. */
	readonly clock: string;
	/** Data e hora locais, no formato YYYY-MM-DD HH:MM: e o que o tooltip mostra. */
	readonly fullTime: string;
	/** Como o evento foi obtido: e a "origem" mostrada na linha. */
	readonly attribution: ChangeEventAttribution;
}

/** Converte os eventos do ledger nas linhas da lista, na ordem em que chegaram. */
export function buildTimelineRows(events: readonly ChangeEvent[]): TimelineRow[] {
	return events.map(event => {
		const { fileName, folderPath } = splitFilePath(event.fileUri);

		return {
			id: event.id,
			fileUri: event.fileUri,
			fileName,
			folderPath,
			lines: formatLineRanges(event.linesChanged),
			clock: formatClockTime(event.timestamp),
			fullTime: formatFullTime(event.timestamp),
			attribution: event.attribution
		};
	});
}

/** Separa o nome do arquivo do caminho que leva ate ele. */
export function splitFilePath(fileUri: string): { fileName: string; folderPath: string } {
	// O caminho do evento ja vem com '/', mas normalizar aqui evita depender disso.
	const normalized = fileUri.trim().replace(/\\/g, '/').replace(/^\.\//, '');
	const lastSeparator = normalized.lastIndexOf('/');

	if (lastSeparator < 0) {
		return { fileName: normalized, folderPath: '' };
	}

	return { fileName: normalized.substring(lastSeparator + 1), folderPath: normalized.substring(0, lastSeparator) };
}

/** Escreve os intervalos de linha: '12', '12-14' ou '12-14, 20, 30-31'. */
export function formatLineRanges(linesChanged?: readonly ChangeLineRange[]): string {
	if (!linesChanged || linesChanged.length === 0) {
		return '';
	}

	return linesChanged.map(range => range[0] === range[1] ? String(range[0]) : range[0] + '-' + range[1]).join(', ');
}

/** Hora local, no formato HH:MM. */
export function formatClockTime(timestamp: number): string {
	const date = new Date(timestamp);

	return padTwo(date.getHours()) + ':' + padTwo(date.getMinutes());
}

/**
 * Data e hora locais, no formato YYYY-MM-DD HH:MM.
 *
 * Formato proprio em vez do do sistema: a saida precisa ser a mesma em qualquer
 * maquina, sem depender de locale nem de fuso.
 */
export function formatFullTime(timestamp: number): string {
	const date = new Date(timestamp);
	const day = date.getFullYear() + '-' + padTwo(date.getMonth() + 1) + '-' + padTwo(date.getDate());

	return day + ' ' + padTwo(date.getHours()) + ':' + padTwo(date.getMinutes());
}

/** Dois digitos, com zero a esquerda. */
function padTwo(value: number): string {
	return value < 10 ? '0' + value : String(value);
}
