/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import './media/timelineView.css';
import { $, append } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ChangeEvent, ChangeEventAttribution } from '../../../../platform/changeLedger/common/changeEvent.js';
import { ITimelineService } from '../../../../platform/changeLedger/common/timelineService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { NavigationDirection, stepActiveId } from '../common/timelineNavigation.js';
import { buildTimelineRows, TimelineRow } from '../common/timelineRows.js';

/** Altura de cada linha: duas faixas de texto. */
const TIMELINE_ROW_HEIGHT = 44;

/** Texto do estado sem nenhuma alteracao observada. */
const EMPTY_MESSAGE = localize('watchCode.timeline.empty', "No changes were observed yet.");

/** Texto do estado em que a leitura da linha do tempo falhou. */
const ERROR_MESSAGE = localize('watchCode.timeline.error', "The timeline could not be read.");

/** Separador dos trechos da segunda faixa da linha. */
const DETAIL_SEPARATOR = ' \u00b7 ';

/**
 * Diz se ha alteracoes na linha do tempo.
 *
 * Comanda a visibilidade dos botoes de navegacao e a validade das teclas. Fica no
 * contexto global — e nao no escopado da view — para a tecla valer com o foco no
 * editor.
 */
export const TIMELINE_HAS_EVENTS = new RawContextKey<boolean>('watchCodeTimeline.hasEvents', false);

/** Como o evento foi obtido, escrito para quem le a lista. */
function originLabel(attribution: ChangeEventAttribution): string {
	return attribution === 'hook'
		? localize('watchCode.timeline.originHook', "Hook")
		: localize('watchCode.timeline.originDisk', "Disk");
}

/** Segunda faixa da linha: so os trechos que existem, sem separador solto. */
function describeRow(row: TimelineRow): string {
	return [row.folderPath, row.lines, row.clock, originLabel(row.attribution)].filter(part => part.length > 0).join(DETAIL_SEPARATOR);
}

/** O que nao cabe na linha: o caminho inteiro e o instante completo. */
function tooltipFor(row: TimelineRow): string {
	const parts = [row.fileUri, row.fullTime];

	if (row.lines) {
		parts.push(localize('watchCode.timeline.tooltipLines', "Lines {0}", row.lines));
	}

	parts.push(originLabel(row.attribution));

	return parts.join('\n');
}

interface ITimelineRowTemplate {
	readonly hover: IManagedHover;
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
	readonly detail: HTMLElement;
}

/** Desenha uma alteracao: arquivo em cima, o resto embaixo. */
class TimelineRowRenderer implements IListRenderer<TimelineRow, ITimelineRowTemplate> {

	static readonly ID = 'watchCodeTimelineRow';

	readonly templateId = TimelineRowRenderer.ID;

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): ITimelineRowTemplate {
		const row = append(container, $('.watch-code-timeline-row'));
		const top = append(row, $('.top'));
		const icon = append(top, $('span.icon'));
		const name = append(top, $('span.name'));
		const detail = append(row, $('.detail'));

		// O hover e criado com a linha e so troca de conteudo a cada evento.
		const hover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), row, '');

		return { hover, icon, name, detail };
	}

	renderElement(element: TimelineRow, _index: number, templateData: ITimelineRowTemplate): void {
		templateData.icon.className = 'icon ' + ThemeIcon.asClassName(Codicon.file);
		templateData.name.textContent = element.fileName;
		templateData.detail.textContent = describeRow(element);
		templateData.hover.update(tooltipFor(element));
	}

	disposeTemplate(templateData: ITimelineRowTemplate): void {
		templateData.hover.dispose();
	}
}

/** Altura fixa: a lista virtualizada nao precisa medir nada. */
class TimelineVirtualDelegate implements IListVirtualDelegate<TimelineRow> {

	getHeight(): number {
		return TIMELINE_ROW_HEIGHT;
	}

	getTemplateId(): string {
		return TimelineRowRenderer.ID;
	}
}

class TimelineAccessibilityProvider implements IListAccessibilityProvider<TimelineRow> {

	getWidgetAriaLabel(): string {
		return localize('watchCode.timelineAriaLabel', "Watch Code timeline");
	}

	getAriaLabel(element: TimelineRow): string {
		return localize('watchCode.timelineRowAriaLabel', "{0}, {1}, {2}", element.fileUri, element.fullTime, originLabel(element.attribution));
	}
}

/**
 * A lista da linha do tempo, dentro do Explorer.
 *
 * A view so pergunta ao servico da timeline: nao le disco, nao ordena e nao
 * deriva status. A lista e montada uma vez e cresce por acrescimo, porque reler
 * o ledger a cada alteracao seria o custo dominante de quem fica aberto o dia
 * inteiro.
 */
export class WatchCodeTimelineView extends ViewPane {

	private rows: TimelineRow[] = [];

	/** Evento por id: o evento ativo precisa dele inteiro, e nao so da linha. */
	private readonly events = new Map<string, ChangeEvent>();

	/** Eventos gravados antes de a lista carregar: aplicados logo depois dela. */
	private readonly pending: ChangeEvent[] = [];

	/** Id do evento ativo; ausente enquanto o usuario nao parou em nenhum. */
	private activeId: string | undefined;

	/** Escrita na selecao em andamento: o aviso da lista nao volta como acao do usuario. */
	private syncing = false;

	private readonly _onDidChangeActive = this._register(new Emitter<ChangeEvent | undefined>());

	/** Avisa quem observa quando o evento ativo muda. */
	readonly onDidChangeActive: Event<ChangeEvent | undefined> = this._onDidChangeActive.event;

	private readonly hasEvents: IContextKey<boolean>;

	private loaded = false;
	private loading: Promise<void> | undefined;
	private list: WorkbenchList<TimelineRow> | undefined;
	private listContainer: HTMLElement | undefined;
	private message: HTMLElement | undefined;
	private messageText: HTMLElement | undefined;
	private readonly retry = this._register(new MutableDisposable<Button>());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ITimelineService private readonly timelineService: ITimelineService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// A escuta nasce aqui, e nao no corpo: evento gravado antes de a view ser
		// desenhada nao pode se perder.
		this._register(this.timelineService.onDidChange(change => this.onDidRecord(change.added)));

		this.hasEvents = TIMELINE_HAS_EVENTS.bindTo(contextKeyService);
		this._register(toDisposable(() => this.hasEvents.reset()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const body = append(container, $('.watch-code-timeline'));

		this.listContainer = append(body, $('.watch-code-timeline-list'));

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList,
			'WatchCodeTimeline',
			this.listContainer,
			new TimelineVirtualDelegate(),
			[new TimelineRowRenderer(this.hoverService)],
			{
				identityProvider: { getId: (row: TimelineRow) => row.id },
				accessibilityProvider: new TimelineAccessibilityProvider(),
				// Um evento ativo por vez: com selecao multipla o conceito se perde.
				multipleSelectionSupport: false,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		) as WorkbenchList<TimelineRow>);

		this._register(this.list.onDidChangeSelection(event => this.onDidSelect(event.elements[0])));

		this.message = append(body, $('.watch-code-timeline-message'));
		this.messageText = append(this.message, $('span'));

		// A lista pode ter sido lida antes de este corpo existir: navegar com a view
		// recolhida carrega a linha do tempo sem desenhar nada.
		this.list.splice(0, 0, this.rows);
		this.renderState();
		this.syncSelection();

		void this.load();
	}

	/** A lista virtualizada so desenha o que cabe na altura que ela recebe. */
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list?.layout(height, width);
	}

	/** Le a linha do tempo uma vez; depois disso a lista so cresce. */
	private load(): Promise<void> {
		if (this.loaded) {
			return Promise.resolve();
		}

		// Carga em andamento e compartilhada: quem chega no meio espera a mesma leitura,
		// em vez de navegar sobre uma lista que ainda vai chegar.
		return this.loading ??= this.doLoad();
	}

	private async doLoad(): Promise<void> {
		try {
			const events = await this.timelineService.getEvents();

			this.events.clear();
			this.remember(events);
			this.rows = buildTimelineRows(events);
			this.list?.splice(0, this.list.length, this.rows);
			this.applyPending();
			this.loaded = true;
			this.renderState();
			this.syncSelection();
		} catch {
			// A proxima tentativa volta ao disco: o servico limpa o estado de carga
			// quando a leitura falha (E2-T1), entao tentar de novo e so perguntar.
			this.showMessage(ERROR_MESSAGE, true);
		} finally {
			this.loading = undefined;
		}
	}

	/** Aplica o que chegou durante a carga, sem duplicar. */
	private applyPending(): void {
		this.append(this.pending.splice(0));
	}

	private onDidRecord(event: ChangeEvent): void {
		if (!this.loaded) {
			this.pending.push(event);

			return;
		}

		this.append([event]);
	}

	/** Acrescenta os eventos que ainda nao estao na lista. */
	private append(events: readonly ChangeEvent[]): void {
		const missing = events.filter(event => !this.events.has(event.id));

		if (missing.length === 0) {
			return;
		}

		this.remember(missing);

		const rows = buildTimelineRows(missing);

		this.rows.push(...rows);
		this.list?.splice(this.list.length, 0, rows);
		this.renderState();
	}

	/** Guarda o evento inteiro por id: a linha e derivada dele, nao o substitui. */
	private remember(events: readonly ChangeEvent[]): void {
		for (const event of events) {
			this.events.set(event.id, event);
		}
	}

	/** Ponto de entrada dos comandos: garante a carga e move o evento ativo. */
	async navigate(direction: NavigationDirection): Promise<void> {
		await this.load();

		this.moveActive(direction);
	}

	/** O evento ativo, quando existe. */
	get activeEvent(): ChangeEvent | undefined {
		return this.activeId === undefined ? undefined : this.events.get(this.activeId);
	}

	/** Anda uma casa na lista, com as regras de borda do modulo puro. */
	private moveActive(direction: NavigationDirection): void {
		const next = stepActiveId(this.rows.map(row => row.id), this.activeId, direction);

		if (next === undefined || next === this.activeId) {
			return;
		}

		this.activeId = next;
		this.syncSelection();
		this._onDidChangeActive.fire(this.events.get(next));
	}

	/** O clique e as setas da lista tambem definem o evento ativo. */
	private onDidSelect(row: TimelineRow | undefined): void {
		if (this.syncing || row === undefined || row.id === this.activeId) {
			return;
		}

		this.activeId = row.id;
		this._onDidChangeActive.fire(this.events.get(row.id));
	}

	/** Poe a selecao da lista no evento ativo, sem que a lista responda de volta. */
	private syncSelection(): void {
		const index = this.rows.findIndex(row => row.id === this.activeId);

		if (!this.list || index < 0) {
			return;
		}

		this.syncing = true;

		try {
			this.list.setSelection([index]);
			this.list.reveal(index);
		} finally {
			this.syncing = false;
		}
	}

	/** Lista com conteudo, ou a mensagem de que ainda nao houve alteracao. */
	private renderState(): void {
		const empty = this.rows.length === 0;

		this.showMessage(empty ? EMPTY_MESSAGE : undefined, false);
		this.hasEvents.set(!empty);
	}

	/** Troca a mensagem do corpo e, quando for o caso, o botao de tentar de novo. */
	private showMessage(text: string | undefined, retry: boolean): void {
		if (!this.message || !this.messageText) {
			return;
		}

		this.messageText.textContent = text ?? '';
		this.message.classList.toggle('hidden', text === undefined);

		// Mensagem e lista nao dividem o espaco: a altura que o corpo passa para a
		// lista vale so quando ela e a unica coisa ali dentro.
		this.listContainer?.classList.toggle('hidden', text !== undefined);
		this.renderRetry(retry);
	}

	private renderRetry(visible: boolean): void {
		if (!visible) {
			this.retry.clear();

			return;
		}

		if (!this.message || this.retry.value) {
			return;
		}

		const button = new Button(this.message, { secondary: true, title: localize('watchCode.timeline.tryAgain', "Try Again") });

		button.label = localize('watchCode.timeline.tryAgain', "Try Again");
		// O clique so libera uma nova carga; quem some com o botao e o sucesso dela,
		// que redesenha a mensagem. Assim o botao nao e descartado no meio do
		// proprio evento de clique.
		button.onDidClick(() => {
			this.loaded = false;
			void this.load();
		});

		this.retry.value = button;
	}
}
