/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

/**
 * Normaliza o caminho relativo de um arquivo do workspace.
 *
 * Separador `/`, sem o prefixo `./` e sem espaço nas pontas: é a forma com que o
 * ledger grava o caminho e com que o resto do produto compara arquivo.
 */
export function normalizeFileUri(fileUri: string): string {
	return fileUri.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
