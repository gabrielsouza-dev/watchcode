/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createFileSystemProviderError, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileSystemProviderWithFileReadStreamCapability, IStat } from '../../files/common/files.js';
import { parseChangeDocument } from './changeDocument.js';
import { IChangeLedgerService } from './changeLedgerService.js';

/** Erro de um snapshot que nao existe mais, ou de um recurso que nao pede snapshot nenhum. */
function fileNotFound(): Error {
	return createFileSystemProviderError(localize('watchCode.document.missing', "The snapshot of this change is not kept anymore."), FileSystemProviderErrorCode.FileNotFound);
}

/** Erro de quem tenta escrever num documento do produto. */
function readOnly(): Error {
	return createFileSystemProviderError(localize('watchCode.document.write', "The snapshot of a change cannot be written."), FileSystemProviderErrorCode.NoPermissions);
}

/**
 * Serve os snapshots do ledger como documentos somente leitura.
 *
 * O conteudo vem do hash que a consulta carrega; o caminho do recurso e identidade,
 * nunca conteudo. O provedor nao tem capacidade de escrita — quem recusa a gravacao
 * e o proprio servico de arquivos, antes de chegar aqui —, e o `Readonly` e o que faz
 * o editor abrir travado, com a mensagem do produto.
 */
export class ChangeDocumentProvider extends Disposable implements IFileSystemProviderWithFileReadStreamCapability {

	readonly capabilities = FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileReadStream;

	readonly readOnlyMessage: IMarkdownString = { value: localize('watchCode.document.readOnly', "This is the snapshot Watch Code kept of this change. The product only reads.") };

	/** O conteudo de um hash nunca muda: nao ha mudanca para anunciar. */
	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(@IChangeLedgerService private readonly ledger: IChangeLedgerService) {
		super();
	}

	async stat(resource: URI): Promise<IStat> {
		const content = await this.content(resource);

		// Sem instante de modificacao: conteudo enderecado por hash nao tem um.
		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: content.byteLength,
			permissions: FilePermission.Readonly
		};
	}

	/** O esquema so tem arquivos: um diretorio dele esta sempre vazio. */
	readdir(): Promise<[string, FileType][]> {
		return Promise.resolve([]);
	}

	readFileStream(resource: URI): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(chunks => VSBuffer.concat(chunks.map(chunk => VSBuffer.wrap(chunk))).buffer);

		// O conteudo sai inteiro, num pedaco so: o snapshot ja esta na memoria.
		this.content(resource).then(content => stream.end(content), error => stream.error(error));

		return stream;
	}

	async mkdir(): Promise<void> {
		throw readOnly();
	}

	async delete(): Promise<void> {
		throw readOnly();
	}

	async rename(): Promise<void> {
		throw readOnly();
	}

	async writeFile(): Promise<void> {
		throw readOnly();
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	/** Bytes do snapshot que o recurso pede, ou o erro de um documento que nao existe. */
	private async content(resource: URI): Promise<Uint8Array> {
		const request = parseChangeDocument(resource);

		if (!request) {
			throw fileNotFound();
		}

		const content = await this.ledger.readSnapshot(request.contentHash);

		if (!content) {
			throw fileNotFound();
		}

		return content.buffer;
	}
}
