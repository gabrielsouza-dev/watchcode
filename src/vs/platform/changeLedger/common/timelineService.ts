/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ChangeEvent, ChangeEventStatus } from './changeEvent.js';
import { compareEvents, IChangeLedgerService, IRecordEventResult } from './changeLedgerService.js';

export const ITimelineService = createDecorator<ITimelineService>('timelineService');

/** O que mudou na linha do tempo. */
export interface ITimelineChange {
	/** Evento gravado. */
	readonly added: ChangeEvent;
	/** Id do evento que deixou de ser o atual do arquivo, quando houve. */
	readonly demotedEventId?: string;
}

/**
 * Modelo de leitura da linha do tempo.
 *
 * O ledger grava; a timeline conta a história. É por aqui que a interface
 * pergunta o que mudou, em ordem, e o que ainda vale — sem varrer o disco a cada
 * pergunta e sem saber que existe um watcher.
 */
export interface ITimelineService {
	readonly _serviceBrand: undefined;

	/** Todos os eventos do workspace, em ordem cronológica crescente. */
	getEvents(): Promise<readonly ChangeEvent[]>;

	/** Eventos de um arquivo do workspace, em ordem cronológica crescente. */
	getEventsForFile(fileUri: string): Promise<readonly ChangeEvent[]>;

	/** Evento de um id, ou `undefined` quando não existe. */
	getEvent(eventId: string): Promise<ChangeEvent | undefined>;

	/** Avisa quando a linha do tempo muda. */
	readonly onDidChange: Event<ITimelineChange>;
}

/**
 * Implementação sobre o ledger, com a lista carregada uma vez.
 *
 * A leitura do disco acontece na primeira consulta: o ledger guarda um arquivo
 * por evento, e reler tudo a cada redesenho de lista seria o custo dominante de
 * quem mostra a linha do tempo.
 */
export class TimelineService extends Disposable implements ITimelineService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<ITimelineChange>());
	readonly onDidChange = this._onDidChange.event;

	/** Eventos do ledger, em ordem cronológica crescente. */
	private entries: ChangeEvent[] | undefined;

	/** Carga em andamento: duas consultas simultâneas leem o disco uma vez só. */
	private loading: Promise<readonly ChangeEvent[]> | undefined;

	/** Gravações que chegaram antes de a lista ser carregada. */
	private readonly recordedEarly = new Map<string, ChangeEvent>();

	constructor(@IChangeLedgerService private readonly ledger: IChangeLedgerService) {
		super();

		this._register(ledger.onDidRecord(result => this.onRecorded(result)));
	}

	async getEvents(): Promise<readonly ChangeEvent[]> {
		return withDerivedStatus(await this.load());
	}

	async getEventsForFile(fileUri: string): Promise<readonly ChangeEvent[]> {
		const key = normalizeFileUri(fileUri);

		return withDerivedStatus((await this.load()).filter(event => normalizeFileUri(event.fileUri) === key));
	}

	async getEvent(eventId: string): Promise<ChangeEvent | undefined> {
		return withDerivedStatus(await this.load()).find(event => event.id === eventId);
	}

	/** Lê o ledger na primeira consulta e mantém a lista em memória. */
	private async load(): Promise<readonly ChangeEvent[]> {
		if (this.entries) {
			return this.entries;
		}

		const loading = this.loading ?? this.ledger.readAll().then(
			events => this.cache(events),
			error => {
				// Sem carga não há lista: a próxima consulta tenta de novo.
				this.loading = undefined;

				throw error;
			}
		);

		this.loading = loading;

		return loading;
	}

	/** Junta o que veio do disco com o que foi gravado durante a leitura. */
	private cache(events: readonly ChangeEvent[]): readonly ChangeEvent[] {
		const cached = [...events];

		for (const event of this.recordedEarly.values()) {
			// A leitura pode ter começado antes da gravação e terminado depois: sem
			// esta conferência o mesmo evento entraria duas vezes.
			if (!cached.some(entry => entry.id === event.id)) {
				cached.push(event);
			}
		}

		this.recordedEarly.clear();
		this.entries = cached.sort(compareEvents);
		this.loading = undefined;

		return this.entries;
	}

	/** Põe o evento gravado na lista em memória e avisa quem observa. */
	private onRecorded(result: IRecordEventResult): void {
		const { event } = result;

		if (!this.entries) {
			this.recordedEarly.set(event.id, event);
		} else {
			this.entries.push(event);

			// A ordem é a do ledger e a gravação quase sempre é a mais recente:
			// reordenar só quando não for evita reordenar a lista a cada evento.
			const previous = this.entries[this.entries.length - 2];

			if (previous && compareEvents(previous, event) > 0) {
				this.entries.sort(compareEvents);
			}
		}

		this._onDidChange.fire({ added: event, demotedEventId: result.supersededEventId });
	}
}

/**
 * Recalcula o status de cada evento a partir do conjunto.
 *
 * O status gravado é um retrato do instante da gravação; a timeline é a
 * autoridade de leitura e responde pela regra: por arquivo, o evento mais
 * recente é o atual e os anteriores são histórico. Percorrer em ordem crescente
 * e ficar com o último de cada arquivo dá isso sem comparar datas.
 */
function withDerivedStatus(events: readonly ChangeEvent[]): readonly ChangeEvent[] {
	const currentIds = new Map<string, string>();

	for (const event of events) {
		currentIds.set(event.fileUri, event.id);
	}

	let changed = false;

	// Sem nenhuma mudança de status a própria lista é devolvida: quem já a tem
	// não vê objeto novo a cada consulta.
	const derived = events.map(event => {
		const status: ChangeEventStatus = currentIds.get(event.fileUri) === event.id ? 'current' : 'history';

		if (status === event.status) {
			return event;
		}

		changed = true;

		return { ...event, status };
	});

	return changed ? derived : events;
}

/** Normaliza o caminho relativo: separador '/' e sem o prefixo './'. */
function normalizeFileUri(fileUri: string): string {
	return fileUri.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
