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

/** O que aconteceu com o arquivo no disco. */
export type ObservedChangeKind = 'added' | 'updated' | 'deleted';

/**
 * Alteração externa já detectada, à espera de registro.
 *
 * Quem detecta é o watcher (E1-T4); quem resolve o "antes" e grava é o recorder.
 */
export interface IObservedChange {
	/** Caminho relativo à pasta de origem. */
	readonly fileUri: string;
	/** Sessão de observação a que a alteração pertence. */
	readonly sessionId: string;
	readonly attribution: ChangeEventAttribution;
	/** Epoch em milissegundos. */
	readonly timestamp: number;
	/**
	 * Pasta do workspace a que o caminho pertence.
	 *
	 * É o que faz o caminho relativo apontar para o lugar certo em workspace
	 * com mais de uma pasta; sem ela, vale a primeira.
	 */
	readonly folderUri?: URI;
	/** O que aconteceu no disco. */
	readonly kind: ObservedChangeKind;
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
	 * Registra uma alteração e devolve o evento que representa o estado atual.
	 *
	 * Só grava quando o conteúdo do arquivo é diferente do último evento gravado
	 * para ele: o sistema de arquivos entrega a mesma escrita mais de uma vez, e
	 * uma entrega repetida não é uma alteração nova. Nesse caso devolve o evento
	 * anterior, sem tocar no ledger.
	 *
	 * Rejeita quando um arquivo que deveria existir não pode ser lido: sem
	 * conteúdo atual não há "depois", e um evento sem "depois" só representa
	 * remoção. Por isso uma remoção é gravada sem ler o disco, com o "depois"
	 * ausente.
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

	/** Último evento gravado por arquivo observado, para reconhecer a escrita repetida. */
	private readonly lastEvents = new Map<string, ChangeEvent>();

	/** Registro em andamento por arquivo: as entregas da mesma escrita não podem se cruzar. */
	private readonly recording = new Map<string, Promise<ChangeEvent>>();

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
		const resource = this.resolveResource(change);
		const key = resource.toString();

		// As entregas da mesma escrita chegam quase juntas, e cada registro passa por
		// leituras assíncronas: sem a fila por arquivo a segunda decidiria antes de a
		// primeira gravar, e as duas entrariam na linha do tempo.
		const previous = this.recording.get(key) ?? Promise.resolve();
		const recording = previous.catch(() => undefined).then(() => this.record(resource, change));

		this.recording.set(key, recording);

		try {
			return await recording;
		} finally {
			if (this.recording.get(key) === recording) {
				this.recording.delete(key);
			}
		}
	}

	/** Grava a alteração, se ela for diferente do último evento do mesmo arquivo. */
	private async record(resource: URI, change: IObservedChange): Promise<ChangeEvent> {
		const key = resource.toString();
		// Numa remoção não há o que ler: o evento registra que o arquivo saiu.
		const content = change.kind === 'deleted' ? undefined : await this.readFile(resource);
		const afterHash = content ? await this.ledger.recordSnapshot(content) : undefined;
		const previous = this.lastEvents.get(key);

		// A raiz do workspace é observada por mais de um pedido, e a mesma escrita
		// chega em lotes separados. Registrar os dois poria duas entradas na linha do
		// tempo para uma alteração só — e uma delas já nasceria como histórico.
		if (previous && previous.afterHash === afterHash) {
			return previous;
		}

		const baseline = await this.baselineProvider.resolve(change.fileUri);

		if (baseline.content) {
			// O "antes" também entra no store: o evento aponta para o hash dele, e sem o
			// conteúdo guardado o diff não teria de onde ler o outro lado da alteração.
			await this.ledger.recordSnapshot(baseline.content);
		}

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

		if (content) {
			// A sombra guarda o último conteúdo visto, e é dela que sai o "antes"
			// se o arquivo voltar. Numa remoção ela fica como estava.
			await this.shadowStore.put(change.fileUri, content, change.timestamp);
		}

		this.lastEvents.set(key, event);

		return event;
	}

	/** Lê o conteúdo atual do arquivo observado. */
	private async readFile(resource: URI): Promise<VSBuffer> {
		const content = await this.fileService.readFile(resource);

		return content.value;
	}

	/** Converte o caminho relativo do evento no recurso do arquivo. */
	private resolveResource(change: IObservedChange): URI {
		const folder = change.folderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;

		return folder ? URI.joinPath(folder, change.fileUri) : URI.file(change.fileUri);
	}
}
