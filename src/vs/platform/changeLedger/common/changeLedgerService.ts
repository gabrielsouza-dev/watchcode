/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../workspace/common/workspace.js';
import { ChangeEvent } from './changeEvent.js';
import { eventResource, fileIndexResource, ILedgerStorageLayout, createLedgerStorageLayout } from './ledgerStorage.js';
import { SnapshotStore, ISnapshotStore } from './snapshotStore.js';

export const IChangeLedgerService = createDecorator<IChangeLedgerService>('changeLedgerService');

/** Conteúdo do índice de atualidade de um arquivo. */
interface IFileIndex {
	readonly fileUri: string;
	/** Todos os eventos do arquivo, em ordem cronológica crescente. */
	readonly eventIds: string[];
	/** Evento que representa o estado atual do arquivo. */
	readonly currentEventId?: string;
}

/** Resultado da gravação de um evento. */
export interface IRecordEventResult {
	/** O evento efetivamente gravado, com o status atribuído pelo ledger. */
	readonly event: ChangeEvent;
	/** Id do evento rebaixado para 'history', quando houve algum. */
	readonly supersededEventId?: string;
}

/**
 * Armazenamento da linha do tempo.
 *
 * O ledger é passivo: ele grava e lê. Quem decide que houve uma alteração é o
 * watcher (E1-T4) e quem decide qual era o estado anterior é o baseline (E1-T3).
 */
export interface IChangeLedgerService {
	readonly _serviceBrand: undefined;

	/** Store de conteúdo deste workspace. */
	readonly snapshots: ISnapshotStore;

	/**
	 * Grava um evento e aplica a regra de atualidade: o evento anterior do mesmo
	 * arquivo passa a 'history' e o novo fica 'current'.
	 */
	record(event: ChangeEvent): Promise<IRecordEventResult>;

	/** Todos os eventos do workspace, em ordem cronológica crescente. */
	readAll(): Promise<readonly ChangeEvent[]>;

	/** Eventos de um arquivo do workspace, em ordem cronológica crescente. */
	readByFile(fileUri: string): Promise<readonly ChangeEvent[]>;

	/** Evento de um id, ou `undefined`. */
	readById(eventId: string): Promise<ChangeEvent | undefined>;

	/** Guarda o conteúdo de um arquivo e devolve o hash. */
	recordSnapshot(content: VSBuffer): Promise<string>;

	/** Conteúdo guardado sob um hash, ou `undefined`. */
	readSnapshot(hash: string): Promise<VSBuffer | undefined>;
}

/** Implementação do ledger sobre o serviço de arquivos do editor. */
export class ChangeLedgerService implements IChangeLedgerService {

	readonly _serviceBrand: undefined;

	private readonly layout: ILedgerStorageLayout;

	readonly snapshots: ISnapshotStore;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		this.layout = createLedgerStorageLayout(environmentService.workspaceStorageHome, workspaceContextService.getWorkspace().id);
		this.snapshots = new SnapshotStore(this.layout, fileService);
	}

	async record(event: ChangeEvent): Promise<IRecordEventResult> {
		const index = await this.readIndex(event.fileUri);
		const supersededEventId = index?.currentEventId;

		// O status é do ledger, não do chamador: o evento nasce sempre 'current'.
		// Campos indefinidos saem do objeto: é o que a gravação em JSON faria com eles.
		const stored = withoutUndefined({ ...event, status: 'current' });

		await this.writeEvent(stored);
		await this.writeIndex(event.fileUri, {
			fileUri: event.fileUri,
			eventIds: [...index?.eventIds ?? [], stored.id],
			currentEventId: stored.id
		});

		// Só depois de o novo 'current' estar garantido o anterior é rebaixado.
		if (supersededEventId) {
			await this.demote(supersededEventId);
		}

		return { event: stored, supersededEventId };
	}

	async readAll(): Promise<readonly ChangeEvent[]> {
		const events = await this.readAllEvents();

		return events.sort(compareEvents);
	}

	async readByFile(fileUri: string): Promise<readonly ChangeEvent[]> {
		const index = await this.readIndex(fileUri);

		if (!index) {
			// O índice é derivado: sem ele, os eventos do arquivo ainda são recuperáveis.
			const events = await this.readAllEvents();

			return events.filter(event => event.fileUri === fileUri).sort(compareEvents);
		}

		const events: ChangeEvent[] = [];

		for (const eventId of index.eventIds) {
			const event = await this.readById(eventId);

			if (event) {
				events.push(event);
			}
		}

		return events.sort(compareEvents);
	}

	async readById(eventId: string): Promise<ChangeEvent | undefined> {
		try {
			const content = await this.fileService.readFile(eventResource(this.layout, eventId));

			return JSON.parse(content.value.toString()) as ChangeEvent;
		} catch {
			return undefined;
		}
	}

	recordSnapshot(content: VSBuffer): Promise<string> {
		return this.snapshots.put(content);
	}

	readSnapshot(hash: string): Promise<VSBuffer | undefined> {
		return this.snapshots.get(hash);
	}

	/** Lê todos os eventos gravados, ignorando os ilegíveis. */
	private async readAllEvents(): Promise<ChangeEvent[]> {
		let children;

		try {
			children = await this.fileService.resolve(this.layout.eventsDir);
		} catch {
			// Sem diretório não há histórico: é o estado inicial, não um erro.
			return [];
		}

		const events: ChangeEvent[] = [];

		for (const child of children.children ?? []) {
			if (child.isDirectory) {
				continue;
			}

			const event = await this.readById(child.name.replace(/\.json$/, ''));

			if (event) {
				events.push(event);
			}
		}

		return events;
	}

	private async demote(eventId: string): Promise<void> {
		const previous = await this.readById(eventId);

		if (!previous || previous.status === 'history') {
			return;
		}

		await this.writeEvent({ ...previous, status: 'history' });
	}

	private async writeEvent(event: ChangeEvent): Promise<void> {
		await this.fileService.createFolder(this.layout.eventsDir);
		await this.fileService.writeFile(eventResource(this.layout, event.id), VSBuffer.fromString(serializeEvent(event)));
	}

	private async readIndex(fileUri: string): Promise<IFileIndex | undefined> {
		try {
			const content = await this.fileService.readFile(fileIndexResource(this.layout, fileUri));

			return JSON.parse(content.value.toString()) as IFileIndex;
		} catch {
			return undefined;
		}
	}

	private async writeIndex(fileUri: string, index: IFileIndex): Promise<void> {
		await this.fileService.createFolder(this.layout.indexDir);
		await this.fileService.writeFile(fileIndexResource(this.layout, fileUri), VSBuffer.fromString(JSON.stringify(index, undefined, '\t')));
	}
}

/**
 * Serializa o evento para disco.
 *
 * Chaves `undefined` — como o `beforeHash` de um evento parcial — somem no
 * `JSON.stringify`. Removê-las também do objeto devolvido garante que o evento
 * em memória seja idêntico ao que ficou gravado.
 */
function serializeEvent(event: ChangeEvent): string {
	return JSON.stringify(withoutUndefined(event), undefined, '\t');
}

/** Remove as chaves indefinidas, que o JSON descartaria de qualquer forma. */
function withoutUndefined(event: ChangeEvent): ChangeEvent {
	return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)) as ChangeEvent;
}

/** Ordem cronológica, com o id como desempate estável. */
function compareEvents(a: ChangeEvent, b: ChangeEvent): number {
	return a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
