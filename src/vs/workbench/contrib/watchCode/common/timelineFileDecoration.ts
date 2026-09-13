/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ChangeEvent } from '../../../../platform/changeLedger/common/changeEvent.js';
import { normalizeFileUri } from '../../../../platform/changeLedger/common/filePath.js';
import { isUnviewed } from '../../../../platform/changeLedger/common/timelineSummary.js';

/** Estado de um arquivo que o agente tocou, do ponto de vista da árvore de arquivos. */
export type TouchedFileState = 'viewed' | 'unviewed';

/**
 * Índice dos arquivos tocados, pela chave do recurso (`uri.toString()`).
 *
 * Estar no índice é "o agente tocou neste arquivo"; o valor diz se ainda há
 * alteração não vista. Um arquivo com várias alterações fica pendente enquanto
 * **uma** delas estiver pendente. Sem pasta de workspace o índice sai vazio.
 */
export function indexTouchedFiles(events: readonly ChangeEvent[], folders: readonly URI[]): Map<string, TouchedFileState> {
	const index = new Map<string, TouchedFileState>();

	for (const event of events) {
		const state: TouchedFileState = isUnviewed(event) ? 'unviewed' : 'viewed';

		for (const resource of resourcesOf(folders, event.fileUri)) {
			const key = resource.toString();

			// Pendente ganha de visto: uma alteração não olhada basta para o arquivo estar pendente.
			if (state === 'unviewed' || !index.has(key)) {
				index.set(key, state);
			}
		}
	}

	return index;
}

/**
 * Recursos de um caminho relativo do ledger, um por pasta do workspace.
 *
 * A chave é a do próprio VS Code — `uri.toString()` —, e não o caminho relativo,
 * porque é por essa forma que o Explorer pergunta pela decoração: o `joinPath`
 * codifica o que precisa, e o caminho com espaço casa dos dois lados.
 */
export function resourcesOf(folders: readonly URI[], fileUri: string): URI[] {
	const relative = normalizeFileUri(fileUri);

	return folders.map(folder => joinPath(folder, relative));
}
