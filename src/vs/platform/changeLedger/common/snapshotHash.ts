/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { hashAsync } from '../../../base/common/hash.js';

/** Tamanho, em caracteres, de um SHA-1 em hexadecimal. */
export const CONTENT_HASH_LENGTH = 40;

/** Formato aceito de um hash de conteúdo: SHA-1 em hex minúsculo. */
const CONTENT_HASH_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Calcula o endereço de um conteúdo no store de snapshots.
 *
 * O mesmo conteúdo sempre produz o mesmo hash, o que permite guardar
 * conteúdo idêntico uma única vez e recuperá-lo por esse endereço.
 */
export async function computeContentHash(content: VSBuffer): Promise<string> {
	return hashAsync(content);
}

/** Verifica se o valor é um hash de conteúdo bem formado. */
export function isContentHash(value: unknown): value is string {
	return typeof value === 'string' && CONTENT_HASH_PATTERN.test(value);
}
