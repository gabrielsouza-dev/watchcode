/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { isEqualOrParent, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileChangesEvent, IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../workspace/common/workspace.js';
import { IChangeRecorderService, ObservedChangeKind } from './changeRecorderService.js';
import { isIgnoredPath } from './ignoredPaths.js';
import { SessionGrouper } from './sessionGrouper.js';

export const IWorkspaceWatcherService = createDecorator<IWorkspaceWatcherService>('workspaceWatcherService');

/**
 * Observação das pastas do workspace.
 *
 * É por onde o produto começa a existir: sem observação não há evento, e sem
 * evento não há linha do tempo. O serviço liga o watcher do serviço de
 * arquivos, descarta o ruído, agrupa as escritas próximas numa sessão e
 * entrega cada alteração ao recorder. Não guarda evento nenhum: quem grava é
 * o ledger.
 */
export interface IWorkspaceWatcherService {
	readonly _serviceBrand: undefined;

	/** Liga a observação das pastas do workspace. Idempotente. */
	start(): void;

	/** Desliga a observação e fecha as sessões abertas. Idempotente. */
	stop(): void;

	/** Inverte o estado da observação. */
	toggle(): void;

	/** Observação está ativa. */
	readonly isActive: boolean;

	/** Avisa quando o estado da observação muda. */
	readonly onDidChangeActive: Event<boolean>;
}

/** Alteração do disco já atribuída à pasta de onde veio. */
interface IObservedFile {
	readonly folderUri: URI;
	/** Caminho relativo à pasta, com separador `/`. */
	readonly fileUri: string;
	readonly kind: ObservedChangeKind;
}

/** Implementação sobre o watcher do serviço de arquivos. */
export class WorkspaceWatcherService extends Disposable implements IWorkspaceWatcherService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeActive = this._register(new Emitter<boolean>());
	readonly onDidChangeActive = this._onDidChangeActive.event;

	private readonly folderWatchers = this._register(new DisposableStore());
	private readonly grouper = new SessionGrouper();
	private active = false;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IChangeRecorderService private readonly recorder: IChangeRecorderService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Uma assinatura só atende a todas as pastas: o serviço de arquivos não
		// oferece watcher correlacionado recursivo, então os eventos chegam pelo
		// fluxo compartilhado e cada um é atribuído à pasta de onde veio.
		this._register(this.fileService.onDidFilesChange(event => this.onFilesChange(event)));
	}

	get isActive(): boolean {
		return this.active;
	}

	start(): void {
		if (this.active) {
			return;
		}

		const folders = this.workspaceContextService.getWorkspace().folders;

		if (folders.length === 0) {
			return;
		}

		this.active = true;

		for (const folder of folders) {
			this.folderWatchers.add(this.fileService.watch(folder.uri, { recursive: true, excludes: [] }));
		}

		this._onDidChangeActive.fire(true);
	}

	toggle(): void {
		if (this.active) {
			this.stop();
		} else {
			this.start();
		}
	}

	stop(): void {
		if (!this.active) {
			return;
		}

		this.active = false;
		this.folderWatchers.clear();
		this.grouper.closeAll(sessionId => this.logSessionEnded(sessionId));

		this._onDidChangeActive.fire(false);
	}

	/** Descarta o ruído, agrupa e entrega cada alteração ao recorder. */
	private onFilesChange(event: FileChangesEvent): void {
		if (!this.active) {
			return;
		}

		const timestamp = Date.now();
		const folders = this.workspaceContextService.getWorkspace().folders;

		// As sessões vencidas fecham antes de a escrita atual ser classificada:
		// senão a pausa seria medida contra a própria escrita que a encerrou.
		this.grouper.closeExpired(timestamp, sessionId => this.logSessionEnded(sessionId));

		for (const file of observedFiles(event, folders)) {
			this.record(file, timestamp);
		}
	}

	/** Registra uma alteração sem deixar que a falha interrompa a observação. */
	private record(file: IObservedFile, timestamp: number): void {
		const sessionId = this.grouper.sessionFor(file.folderUri.toString(), timestamp);

		this.recorder.recordChange({
			fileUri: file.fileUri,
			sessionId,
			attribution: 'observed',
			timestamp,
			folderUri: file.folderUri,
			kind: file.kind
		}).then(event => {
			if (!event) {
				// O caminho que não é arquivo não vira evento: a pasta que nasce dentro do
				// workspace chega aqui. Não é falha — o rastro fica no trace, que só aparece
				// com o log detalhado ligado.
				this.logService.trace(`[watchCode] ignored non-file change: ${file.fileUri}`);
			}
		}).catch(error => this.logService.error(`[watchCode] failed to record ${file.fileUri}`, error));
	}

	private logSessionEnded(sessionId: string): void {
		this.logService.trace(`[watchCode] observation session closed: ${sessionId}`);
	}
}

/**
 * Precedência quando a mesma escrita chega em mais de um tipo.
 *
 * O lote não preserva a ordem, então vale o estado final: o arquivo que
 * sumiu vence o que apareceu, que vence o que apenas mudou.
 */
const KIND_PRIORITY: Record<ObservedChangeKind, number> = { deleted: 2, added: 1, updated: 0 };

/** Alterações do evento que caem nas pastas do workspace e não são ruído. */
function observedFiles(event: FileChangesEvent, folders: readonly IWorkspaceFolder[]): IObservedFile[] {
	const observed = new Map<string, IObservedFile>();

	collect(event.rawAdded, 'added', folders, observed);
	collect(event.rawUpdated, 'updated', folders, observed);
	collect(event.rawDeleted, 'deleted', folders, observed);

	return [...observed.values()];
}

/**
 * Anexa os recursos de um tipo de alteração, um por arquivo.
 *
 * Criar um arquivo chega como 'added' e 'updated' no mesmo lote; sem a
 * coalescência a mesma escrita viraria dois eventos no ledger.
 */
function collect(resources: readonly URI[], kind: ObservedChangeKind, folders: readonly IWorkspaceFolder[], observed: Map<string, IObservedFile>): void {
	for (const resource of resources) {
		const folder = folderOf(resource, folders);

		if (!folder) {
			continue;
		}

		const fileUri = relativePath(folder.uri, resource);

		if (!fileUri || isIgnoredPath(fileUri)) {
			continue;
		}

		const key = resource.toString();
		const seen = observed.get(key);

		if (!seen || KIND_PRIORITY[kind] > KIND_PRIORITY[seen.kind]) {
			observed.set(key, { folderUri: folder.uri, fileUri, kind });
		}
	}
}

/**
 * Pasta a que o recurso pertence.
 *
 * Com pastas aninhadas vale a mais específica, senão a mesma alteração entraria
 * duas vezes, com caminhos relativos diferentes.
 */
function folderOf(resource: URI, folders: readonly IWorkspaceFolder[]): IWorkspaceFolder | undefined {
	let owner: IWorkspaceFolder | undefined;

	for (const folder of folders) {
		if (!isEqualOrParent(resource, folder.uri)) {
			continue;
		}

		if (!owner || isEqualOrParent(folder.uri, owner.uri)) {
			owner = folder;
		}
	}

	return owner;
}
