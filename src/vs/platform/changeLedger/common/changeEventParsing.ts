/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { isObject } from '../../../base/common/types.js';
import { CHANGE_ANNOUNCEMENT_SCHEMA_VERSION, type ChangeAnnouncement, type ChangeEventAttribution, type ChangeEventStatus, type ChangeLineRange, type ChangeSource } from './changeEvent.js';

/** Nome de campo usado quando o problema é a linha inteira. */
const ANNOUNCEMENT_FIELD = '(announcement)';

/** Motivo da rejeição de uma linha do `events.jsonl`. */
export type ChangeAnnouncementParseErrorCode =
	| 'not-an-object'
	| 'unsupported-schema'
	| 'missing-field'
	| 'invalid-field';

export interface IChangeAnnouncementParseError {
	readonly field: string;
	readonly code: ChangeAnnouncementParseErrorCode;
	readonly message: string;
}

export type ChangeAnnouncementParseResult =
	| { readonly ok: true; readonly announcement: ChangeAnnouncement }
	| { readonly ok: false; readonly errors: readonly IChangeAnnouncementParseError[] };

export function isChangeSource(value: unknown): value is ChangeSource {
	return value === 'agent' || value === 'developer';
}

export function isChangeEventAttribution(value: unknown): value is ChangeEventAttribution {
	return value === 'hook' || value === 'observed';
}

export function isChangeEventStatus(value: unknown): value is ChangeEventStatus {
	return value === 'current' || value === 'history';
}

export function isChangeLineRange(value: unknown): value is ChangeLineRange {
	if (!Array.isArray(value) || value.length !== 2) {
		return false;
	}

	const [startLine, endLine] = value as [unknown, unknown];

	return typeof startLine === 'number' && typeof endLine === 'number'
		&& Number.isInteger(startLine) && Number.isInteger(endLine)
		&& startLine >= 1 && startLine <= endLine;
}

/**
 * Converte uma linha desserializada do `events.jsonl` no anúncio tipado.
 * Dados ruins nunca lançam exceção: viram uma lista de erros por campo.
 */
export function parseChangeAnnouncement(value: unknown): ChangeAnnouncementParseResult {
	if (!isObject(value)) {
		return {
			ok: false,
			errors: [{ field: ANNOUNCEMENT_FIELD, code: 'not-an-object', message: 'The announcement must be a JSON object.' }],
		};
	}

	const source = value as Record<string, unknown>;

	// A versão é checada antes de tudo: sem ela o resto da linha não é interpretável.
	if (source.schemaVersion !== CHANGE_ANNOUNCEMENT_SCHEMA_VERSION) {
		return {
			ok: false,
			errors: [{
				field: 'schemaVersion',
				code: 'unsupported-schema',
				message: `Unsupported schema version: expected ${CHANGE_ANNOUNCEMENT_SCHEMA_VERSION}.`,
			}],
		};
	}

	const errors: IChangeAnnouncementParseError[] = [];

	const id = readRequiredString(source, 'id', errors);
	const sessionId = readRequiredString(source, 'sessionId', errors);
	const fileUri = readRequiredString(source, 'fileUri', errors);

	if (fileUri.length > 0 && !isWorkspaceRelativePath(fileUri)) {
		errors.push({
			field: 'fileUri',
			code: 'invalid-field',
			message: 'Field \'fileUri\' must be a workspace-relative path without parent segments.',
		});
	}

	let timestamp = 0;
	if (source.timestamp === undefined) {
		errors.push({ field: 'timestamp', code: 'missing-field', message: 'Missing required field \'timestamp\'.' });
	} else if (typeof source.timestamp !== 'number' || !Number.isInteger(source.timestamp) || source.timestamp <= 0) {
		errors.push({ field: 'timestamp', code: 'invalid-field', message: 'Field \'timestamp\' must be a positive integer in milliseconds.' });
	} else {
		timestamp = source.timestamp;
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true, announcement: { schemaVersion: CHANGE_ANNOUNCEMENT_SCHEMA_VERSION, id, sessionId, fileUri, timestamp } };
}

function readRequiredString(source: Record<string, unknown>, field: string, errors: IChangeAnnouncementParseError[]): string {
	const value = source[field];

	if (value === undefined) {
		errors.push({ field, code: 'missing-field', message: `Missing required field '${field}'.` });
		return '';
	}

	if (typeof value !== 'string' || value.trim().length === 0) {
		errors.push({ field, code: 'invalid-field', message: `Field '${field}' must be a non-empty string.` });
		return '';
	}

	return value;
}

/** Caminho relativo à raiz do workspace: nem absoluto (POSIX ou Windows), nem com '..'. */
function isWorkspaceRelativePath(path: string): boolean {
	if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(path)) {
		return false;
	}

	return !path.split(/[\\/]/).includes('..');
}
