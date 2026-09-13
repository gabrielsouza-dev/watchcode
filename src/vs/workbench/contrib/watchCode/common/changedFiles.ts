/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { compareFileNames } from '../../../../base/common/comparers.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ChangeEvent } from '../../../../platform/changeLedger/common/changeEvent.js';
import { normalizeFileUri } from '../../../../platform/changeLedger/common/filePath.js';
import { isUnviewed } from '../../../../platform/changeLedger/common/timelineSummary.js';
import { resourcesOf } from './timelineFileDecoration.js';

/** Um arquivo que o agente tocou: um nó só, com a alteração mais recente. */
export interface ChangedFileNode {
	readonly kind: 'file';
	/** Chave do nó na árvore: o recurso em `toString()`, como na decoração da E2-T7. */
	readonly id: string;
	/** Último segmento do caminho. */
	readonly name: string;
	/** Caminho relativo, como o ledger grava. */
	readonly fileUri: string;
	/** Qual pasta do workspace este nó representa (índice em `folders`). */
	readonly folderIndex: number;
	/** Alteração mais recente do arquivo: é ela que o salto abre. */
	readonly eventId: string;
	/** Há alteração não vista neste arquivo. */
	readonly unviewed: boolean;
	/** A alteração mais recente foi a remoção do arquivo. */
	readonly removed: boolean;
}

/** Uma pasta da árvore: a do workspace, ou a que existe porque tem alteração embaixo. */
export interface ChangedFolderNode {
	readonly kind: 'folder';
	readonly id: string;
	readonly name: string;
	readonly children: readonly ChangedTreeNode[];
}

export type ChangedTreeNode = ChangedFolderNode | ChangedFileNode;

/** O que se sabe de um arquivo depois de percorrer as alterações dele. */
interface TouchedFile {
	readonly id: string;
	readonly relative: string;
	readonly segments: readonly string[];
	readonly folderIndex: number;
	event: ChangeEvent;
	unviewed: boolean;
}

/** Pasta em construção: os filhos ainda vão sendo acrescentados. */
interface BuildingFolder {
	readonly folders: Map<string, BuildingFolder>;
	readonly files: TouchedFile[];
}

/**
 * A árvore do "só o que mudou": uma raiz por pasta do workspace, e embaixo dela
 * apenas os arquivos que o agente tocou.
 *
 * A pasta existe porque tem alteração embaixo — nada é lido do disco, senão a
 * árvore traria de volta justamente o que ela esconde.
 */
export function buildChangedTree(events: readonly ChangeEvent[], folders: readonly URI[]): ChangedFolderNode[] {
	const touched = [...rememberFiles(events, folders).values()];

	return folders
		.map((folder, folderIndex) => createRoot(folder, touched.filter(file => file.folderIndex === folderIndex)))
		.filter(root => root.children.length > 0);
}

/** A raiz de uma pasta do workspace, com as pastas e arquivos que existem embaixo dela. */
function createRoot(folder: URI, files: readonly TouchedFile[]): ChangedFolderNode {
	const building: BuildingFolder = { folders: new Map(), files: [] };

	for (const file of files) {
		fill(building, file);
	}

	return { kind: 'folder', id: folder.toString(), name: basename(folder), children: toNodes(building, folder, []) };
}

/** Pendura o arquivo na árvore em construção, criando as pastas do caminho que faltarem. */
function fill(root: BuildingFolder, file: TouchedFile): void {
	let current = root;

	for (const segment of file.segments.slice(0, -1)) {
		let next = current.folders.get(segment);

		if (next === undefined) {
			next = { folders: new Map(), files: [] };
			current.folders.set(segment, next);
		}

		current = next;
	}

	current.files.push(file);
}

/** Converte a árvore em construção nos nós que a view desenha, já ordenados. */
function toNodes(building: BuildingFolder, folder: URI, path: readonly string[]): readonly ChangedTreeNode[] {
	const pastas: ChangedFolderNode[] = [];

	for (const [name, child] of building.folders) {
		const segments = [...path, name];

		pastas.push({
			kind: 'folder',
			id: resourceOf(folder, segments),
			name,
			children: toNodes(child, folder, segments)
		});
	}

	return [...pastas.sort(byName), ...building.files.map(toFileNode).sort(byName)];
}

/** O nó do arquivo, com o que a view precisa para desenhar e para abrir. */
function toFileNode(file: TouchedFile): ChangedFileNode {
	return {
		kind: 'file',
		id: file.id,
		name: file.segments[file.segments.length - 1],
		fileUri: file.relative,
		folderIndex: file.folderIndex,
		eventId: file.event.id,
		unviewed: file.unviewed,
		removed: file.event.afterHash === undefined
	};
}

/**
 * Guarda, por arquivo e por pasta do workspace, o que a árvore precisa saber.
 *
 * A alteração mais recente manda no salto e no estado de remoção; o ponto, ao
 * contrário, é de qualquer alteração que ainda não foi vista.
 */
function rememberFiles(events: readonly ChangeEvent[], folders: readonly URI[]): Map<string, TouchedFile> {
	const files = new Map<string, TouchedFile>();

	for (const event of events) {
		const relative = normalizeFileUri(event.fileUri);

		// Caminho vazio não vira nó: não há arquivo para mostrar.
		if (relative.length === 0) {
			continue;
		}

		const segments = relative.split('/');

		resourcesOf(folders, relative).forEach((resource, folderIndex) => {
			const key = folderIndex + ':' + relative;
			const known = files.get(key);

			if (known === undefined) {
				files.set(key, { id: resource.toString(), relative, segments, folderIndex, event, unviewed: isUnviewed(event) });

				return;
			}

			known.unviewed = known.unviewed || isUnviewed(event);

			if (event.timestamp >= known.event.timestamp) {
				known.event = event;
			}
		});
	}

	return files;
}

/** Recurso de uma pasta da árvore: o mesmo `joinPath` que `resourcesOf` usa para os arquivos. */
function resourceOf(folder: URI, segments: readonly string[]): string {
	return joinPath(folder, segments.join('/')).toString();
}

/** A ordem do Explorer: pastas antes de arquivos, e cada grupo pelo nome. */
function byName(one: { readonly name: string }, other: { readonly name: string }): number {
	return compareFileNames(one.name, other.name);
}
