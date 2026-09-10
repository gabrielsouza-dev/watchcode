/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { IFileService } from '../../files/common/files.js';
import { ILedgerStorageLayout, shadowResource } from './ledgerStorage.js';
import { computeContentHash } from './snapshotHash.js';
import { ISnapshotStore } from './snapshotStore.js';

/** Sombra de um arquivo: o último conteúdo observado. */
export interface IShadowEntry {
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Endereço do conteúdo no store de snapshots. */
	readonly contentHash: string;
	/** Epoch em milissegundos em que a sombra foi gravada. */
	readonly recordedAt: number;
}

/**
 * Sombra: o "antes" de um arquivo quando o git não pode responder.
 *
 * Guarda apenas o ponteiro para o conteúdo, que fica no store endereçado por
 * hash. É sempre a **última** observação de cada arquivo — não é histórico — e
 * por isso ocupa uma entrada por arquivo, não uma por alteração.
 */
export interface IShadowStore {
	/** Guarda o conteúdo como sombra do arquivo e devolve o seu hash. */
	put(fileUri: string, content: VSBuffer, recordedAt: number): Promise<string>;
	/** Sombra do arquivo, ou `undefined` quando nunca foi observado. */
	get(fileUri: string): Promise<IShadowEntry | undefined>;
	/** Conteúdo da sombra do arquivo, ou `undefined` quando não há. */
	read(fileUri: string): Promise<VSBuffer | undefined>;
}

/** Implementação da sombra sobre o serviço de arquivos do editor. */
export class ShadowStore implements IShadowStore {

	constructor(
		private readonly layout: ILedgerStorageLayout,
		private readonly snapshots: ISnapshotStore,
		@IFileService private readonly fileService: IFileService
	) { }

	async put(fileUri: string, content: VSBuffer, recordedAt: number): Promise<string> {
		const contentHash = await this.snapshots.put(content);
		const entry: IShadowEntry = { fileUri, contentHash, recordedAt };

		await this.fileService.createFolder(this.layout.shadowDir);
		await this.fileService.writeFile(
			shadowResource(this.layout, fileUri),
			VSBuffer.fromString(JSON.stringify(entry, undefined, '\t'))
		);

		return contentHash;
	}

	async get(fileUri: string): Promise<IShadowEntry | undefined> {
		try {
			const content = await this.fileService.readFile(shadowResource(this.layout, fileUri));
			const entry = JSON.parse(content.value.toString()) as IShadowEntry;

			return await this.isUsable(entry) ? entry : undefined;
		} catch {
			// Ausente ou ilegível: para quem pergunta é o mesmo que não existir.
			return undefined;
		}
	}

	async read(fileUri: string): Promise<VSBuffer | undefined> {
		const entry = await this.get(fileUri);

		return entry ? this.snapshots.get(entry.contentHash) : undefined;
	}

	/** A sombra só serve se apontar para um conteúdo que ainda está guardado. */
	private async isUsable(entry: IShadowEntry): Promise<boolean> {
		return typeof entry?.contentHash === 'string' && await this.snapshots.has(entry.contentHash);
	}
}

/** Exportado para que o baseline possa comparar hashes sem tocar em disco. */
export { computeContentHash };
