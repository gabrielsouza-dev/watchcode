/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { IFileService } from '../../files/common/files.js';
import { ILedgerStorageLayout, snapshotResource } from './ledgerStorage.js';
import { computeContentHash, isContentHash } from './snapshotHash.js';

/**
 * Store de conteúdo endereçado por hash.
 *
 * Ele não interpreta o conteúdo: apenas guarda bytes sob o endereço que o
 * próprio conteúdo determina. Conteúdo idêntico ocupa um lugar só.
 */
export interface ISnapshotStore {
	/** Grava o conteúdo e devolve o seu hash. Conteúdo já guardado não é reescrito. */
	put(content: VSBuffer): Promise<string>;
	/** Conteúdo guardado sob um hash, ou `undefined` quando não existe. */
	get(hash: string): Promise<VSBuffer | undefined>;
	/** Informa se o conteúdo de um hash já está guardado. */
	has(hash: string): Promise<boolean>;
}

/** Implementação do store sobre o serviço de arquivos do editor. */
export class SnapshotStore implements ISnapshotStore {

	constructor(
		private readonly layout: ILedgerStorageLayout,
		@IFileService private readonly fileService: IFileService
	) { }

	async put(content: VSBuffer): Promise<string> {
		const contentHash = await computeContentHash(content);
		const resource = snapshotResource(this.layout, contentHash);

		// Conteúdo idêntico já está no lugar certo: reescrever seria trabalho perdido.
		if (!await this.has(contentHash)) {
			await this.fileService.createFolder(this.layout.snapshotsDir);
			await this.fileService.writeFile(resource, content);
		}

		return contentHash;
	}

	async get(hash: string): Promise<VSBuffer | undefined> {
		if (!isContentHash(hash)) {
			return undefined;
		}

		try {
			const content = await this.fileService.readFile(snapshotResource(this.layout, hash));

			return content.value;
		} catch {
			// Hash ausente ou arquivo ilegível: para o chamador é o mesmo que não existir.
			return undefined;
		}
	}

	async has(hash: string): Promise<boolean> {
		if (!isContentHash(hash)) {
			return false;
		}

		return this.fileService.exists(snapshotResource(this.layout, hash));
	}
}
