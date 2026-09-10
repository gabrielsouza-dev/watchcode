/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../workspace/common/workspace.js';
import { BaselineProvider, ReadFromHead } from './baseline.js';
import { ChangeEvent, ChangeEventAttribution } from './changeEvent.js';
import { IChangeLedgerService } from './changeLedgerService.js';
import { createLedgerStorageLayout, ILedgerStorageLayout } from './ledgerStorage.js';
import { ShadowStore } from './shadowStore.js';

export const IChangeRecorderService = createDecorator<IChangeRecorderService>('changeRecorderService');

/**
 * Alteração externa já detectada, à espera de registro.
 *
 * Quem detecta é o watcher (E1-T4); quem resolve o "antes" e grava é o recorder.
 */
export interface IObservedChange {
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Sessão de observação a que a alteração pertence. */
	readonly sessionId: string;
	readonly attribution: ChangeEventAttribution;
	/** Epoch em milissegundos. */
	readonly timestamp: number;
}

/**
 * Registra no ledger uma alteração externa.
 *
 * É o ponto ativo da captura: resolve o "antes", guarda o "depois" e grava o
 * evento. Não observa o disco, não abre sessão e não agrupa nada.
 */
export interface IChangeRecorderService {
	readonly _serviceBrand: undefined;

	/**
	 * Registra uma alteração e devolve o evento gravado.
	 *
	 * Rejeita quando o arquivo não pode ser lido: sem conteúdo atual não há
	 * "depois", e um evento sem "depois" não representa alteração nenhuma.
	 */
	recordChange(change: IObservedChange): Promise<ChangeEvent>;
}

/**
 * Lê o "antes" de um arquivo no repositório git do workspace.
 *
 * Injetado, e não importado: o serviço de git roda em outro processo, e manter
 * a leitura atrás de uma função deixa o recorder testável sem repositório real.
 */
export type WorkspaceHeadReader = ReadFromHead;

/** Sem leitor de git: todo baseline cai para a sombra. */
const noHeadReader: WorkspaceHeadReader = () => Promise.resolve(undefined);

/** Implementação sobre o ledger, os snapshots e o baseline do workspace. */
export class ChangeRecorderService implements IChangeRecorderService {

	readonly _serviceBrand: undefined;

	private readonly layout: ILedgerStorageLayout;
	private readonly shadowStore: ShadowStore;
	private readonly baselineProvider: BaselineProvider;

	constructor(
		@IChangeLedgerService private readonly ledger: IChangeLedgerService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		readFromHead: WorkspaceHeadReader = noHeadReader
	) {
		this.layout = createLedgerStorageLayout(environmentService.workspaceStorageHome, workspaceContextService.getWorkspace().id);
		this.shadowStore = new ShadowStore(this.layout, this.ledger.snapshots, fileService);
		this.baselineProvider = new BaselineProvider(readFromHead, this.shadowStore);
	}

	async recordChange(change: IObservedChange): Promise<ChangeEvent> {
		const content = await this.readFile(change.fileUri);
		const afterHash = await this.ledger.recordSnapshot(content);
		const baseline = await this.baselineProvider.resolve(change.fileUri);

		const { event } = await this.ledger.record({
			id: generateUuid(),
			sessionId: change.sessionId,
			source: 'agent',
			attribution: change.attribution,
			fileUri: change.fileUri,
			// Sem baseline o evento nasce parcial: o "antes" é desconhecido.
			beforeHash: baseline.contentHash,
			afterHash,
			timestamp: change.timestamp,
			status: 'current'
		});

		await this.shadowStore.put(change.fileUri, content, change.timestamp);

		return event;
	}

	/** Lê o conteúdo atual do arquivo observado. */
	private async readFile(fileUri: string): Promise<VSBuffer> {
		const content = await this.fileService.readFile(this.resolveResource(fileUri));

		return content.value;
	}

	/** Converte o caminho relativo do evento no recurso do arquivo. */
	private resolveResource(fileUri: string): URI {
		const folder = this.workspaceContextService.getWorkspace().folders[0];

		return folder ? URI.joinPath(folder.uri, fileUri) : URI.file(fileUri);
	}
}
