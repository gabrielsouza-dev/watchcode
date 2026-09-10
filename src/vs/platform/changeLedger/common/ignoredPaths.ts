/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

/**
 * Segmentos de caminho que nunca entram na observação.
 *
 * São artefatos de controle de versão, dependências e saída de build: mudam
 * o tempo todo, mas não são alterações que o desenvolvedor precise revisar.
 */
const IGNORED_SEGMENTS: readonly string[] = [
	'.git',
	'.hg',
	'.svn',
	'node_modules',
	'out',
	'dist',
	'.build',
	'build',
	'.aih'
];

/**
 * Diz se um caminho relativo deve ficar fora da observação.
 *
 * A comparação é por segmento, não por prefixo de texto: o nome precisa ser o
 * segmento inteiro. Assim `.git` casa em qualquer profundidade, `.gitignore`
 * não casa, e `src/git/x.ts` continua sendo observado.
 */
export function isIgnoredPath(fileUri: string): boolean {
	return splitSegments(fileUri).some(segment => IGNORED_SEGMENTS.includes(segment));
}

/** Quebra o caminho em segmentos, aceitando os dois separadores. */
function splitSegments(fileUri: string): string[] {
	return fileUri.split(/[\\/]+/).filter(segment => segment.length > 0);
}
