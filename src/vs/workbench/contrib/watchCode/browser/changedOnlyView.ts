/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import './media/changedOnlyView.css';
import { $, append, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { ChangeEvent } from '../../../../platform/changeLedger/common/changeEvent.js';
import { ITimelineService } from '../../../../platform/changeLedger/common/timelineService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { buildChangedTree, ChangedFileNode, ChangedTreeNode } from '../common/changedFiles.js';
import { resourcesOf } from '../common/timelineFileDecoration.js';
import { formatFullTime } from '../common/timelineRows.js';
import { ChangeOpener } from './changeOpener.js';

/** Altura de cada linha: uma faixa de texto. */
const CHANGED_ROW_HEIGHT = 22;

/** Texto do estado sem nenhuma alteracao observada. */
const EMPTY_MESSAGE = localize('watchCode.changedOnly.empty', "No changes were observed yet.");

/** Texto do estado em que a leitura do ledger falhou. */
const ERROR_MESSAGE = localize('watchCode.changedOnly.error', "The changed files could not be read.");

/** Texto do arquivo que tem alteracao que o desenvolvedor ainda nao viu. */
const NEW_CHANGE_LABEL = localize('watchCode.changedOnly.unviewed', "Not viewed yet");

/** Texto do arquivo cuja alteracao mais recente foi a remocao. */
const REMOVED_LABEL = localize('watchCode.changedOnly.removed', "Removed by the change");

/** O icone da linha: pasta, arquivo, ou o arquivo que a alteracao removeu. */
function iconOf(element: ChangedTreeNode): ThemeIcon {
	if (element.kind === 'folder') {
		return Codicon.folder;
	}

	return element.removed ? Codicon.trash : Codicon.file;
}

/** A arvore do workbench espera o elemento embrulhado, com os filhos e o estado aberto. */
function toTreeElements(nodes: readonly ChangedTreeNode[]): IObjectTreeElement<ChangedTreeNode>[] {
	return nodes.map(node => node.kind === 'folder'
		? { element: node, collapsible: true, collapsed: false, children: toTreeElements(node.children) }
		: { element: node, collapsible: false });
}

interface IChangedRowTemplate {
	readonly hover: IManagedHover;
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
	readonly badge: HTMLElement;
}

/** Desenha um arquivo ou uma pasta da arvore, com o ponto do nao visto. */
class ChangedRowRenderer implements ITreeRenderer<ChangedTreeNode, void, IChangedRowTemplate> {

	static readonly ID = 'watchCodeChangedRow';

	readonly templateId = ChangedRowRenderer.ID;

	constructor(
		private readonly hoverService: IHoverService,
		private readonly describe: (node: ChangedTreeNode) => string
	) { }

	renderTemplate(container: HTMLElement): IChangedRowTemplate {
		const row = append(container, $('.watch-code-changed-row'));
		const icon = append(row, $('span.icon'));
		const name = append(row, $('span.name'));
		const badge = append(row, $('span.badge'));

		// O hover e criado com a linha e so troca de conteudo a cada no.
		const hover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), row, '');

		return { hover, icon, name, badge };
	}

	renderElement(node: ITreeNode<ChangedTreeNode, void>, _index: number, templateData: IChangedRowTemplate): void {
		const element = node.element;

		templateData.icon.className = 'icon ' + ThemeIcon.asClassName(iconOf(element));
		templateData.name.textContent = element.name;
		// O ponto e escondido sem sair do layout: assim os icones ficam alinhados
		// entre os arquivos vistos e os novos.
		templateData.badge.className = 'badge ' + ThemeIcon.asClassName(Codicon.circleFilled) + (element.kind === 'file' && element.unviewed ? '' : ' hidden');
		templateData.hover.update(this.describe(element));
	}

	disposeTemplate(templateData: IChangedRowTemplate): void {
		templateData.hover.dispose();
	}
}

/** Altura fixa: a arvore virtualizada nao precisa medir nada. */
class ChangedTreeDelegate implements IListVirtualDelegate<ChangedTreeNode> {

	getHeight(): number {
		return CHANGED_ROW_HEIGHT;
	}

	getTemplateId(): string {
		return ChangedRowRenderer.ID;
	}
}

class ChangedAccessibilityProvider implements IListAccessibilityProvider<ChangedTreeNode> {

	getWidgetAriaLabel(): string {
		return localize('watchCode.changedOnlyAriaLabel', "Files the agent changed");
	}

	getAriaLabel(element: ChangedTreeNode): string {
		const parts = [element.name];

		if (element.kind === 'file') {
			if (element.fileUri !== element.name) {
				parts.push(element.fileUri);
			}

			if (element.removed) {
				parts.push(REMOVED_LABEL);
			}

			if (element.unviewed) {
				parts.push(NEW_CHANGE_LABEL);
			}
		}

		return parts.join(', ');
	}
}

/**
 * A arvore do "so o que mudou", dentro do Explorer.
 *
 * A view so pergunta ao servico da timeline, e nunca ao disco: a arvore e
 * derivada dos eventos, entao uma pasta aparece porque tem alteracao embaixo, e
 * nao porque existe. A reconstrucao acontece a cada aviso, e o desenho preserva
 * o que estava aberto — e o `identityProvider` da arvore do workbench que garante
 * isso, casando os nos pelo id.
 */
export class WatchCodeChangedOnlyView extends ViewPane {

	/** Evento por id: o no carrega o id, e o salto precisa do evento inteiro. */
	private readonly events = new Map<string, ChangeEvent>();

	private readonly opener: ChangeOpener;

	private loaded = false;
	private loading: Promise<void> | undefined;
	private rootCount = 0;
	private tree: WorkbenchObjectTree<ChangedTreeNode, void> | undefined;
	private treeContainer: HTMLElement | undefined;
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
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITimelineService private readonly timelineService: ITimelineService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.opener = this.instantiationService.createInstance(ChangeOpener);

		// A escuta nasce aqui, e nao no corpo: alteracao gravada antes de a view ser
		// desenhada nao pode se perder, e a view nasce recolhida.
		this._register(this.timelineService.onDidChange(change => this.onDidRecord(change.added)));
		this._register(this.timelineService.onDidMarkViewed(event => this.onDidRecord(event)));

		void this.load();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const body = append(container, $('.watch-code-changed-only'));

		this.treeContainer = append(body, $('.watch-code-changed-only-tree'));

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchObjectTree,
			'WatchCodeChangedOnly',
			this.treeContainer,
			new ChangedTreeDelegate(),
			[new ChangedRowRenderer(this.hoverService, node => this.tooltipFor(node))],
			{
				identityProvider: { getId: (node: ChangedTreeNode) => node.id },
				accessibilityProvider: new ChangedAccessibilityProvider(),
				// Uma linha ativa por vez: com selecao multipla o conceito se perde.
				multipleSelectionSupport: false,
				// Sem isto as setas andam com o foco e deixam a selecao para tras.
				selectionNavigation: true,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		) as WorkbenchObjectTree<ChangedTreeNode, void>);

		this._register(this.tree.onDidOpen(event => this.onDidOpen(event.element)));

		this.message = append(body, $('.watch-code-changed-only-message'));
		this.messageText = append(this.message, $('span'));

		// A arvore pode ter sido lida antes de este corpo existir: navegar com a view
		// recolhida le o ledger sem desenhar nada.
		this.renderTree();
		this.renderState();

		void this.load();
	}

	/** A arvore virtualizada so desenha o que cabe na altura que ela recebe. */
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}

	/**
	 * O gesto do F7: abre e foca; com a view em uso, recolhe e devolve o foco.
	 *
	 * Uma tecla, um sentido: a primeira vez que ela e apertada e justamente quem
	 * quer ver so o que mudou, e a segunda e quem ja viu.
	 */
	async toggle(): Promise<void> {
		if (this.hasTreeFocus()) {
			this.setExpanded(false);
			this.focusEditor();

			return;
		}

		this.setExpanded(true);
		this.focus();
	}

	override focus(): void {
		super.focus();
		this.tree?.domFocus();
	}

	/** A view esta em uso quando o foco esta na arvore dela. */
	private hasTreeFocus(): boolean {
		return !!this.tree && isAncestorOfActiveElement(this.tree.getHTMLElement());
	}

	/** Devolve o foco ao editor ativo; sem editor aberto, o foco fica onde estava. */
	private focusEditor(): void {
		getCodeEditor(this.editorService.activeTextEditorControl)?.focus();
	}

	/** Le o ledger uma vez; depois disso a arvore e reconstruida a cada aviso. */
	private load(): Promise<void> {
		if (this.loaded) {
			return Promise.resolve();
		}

		// Carga em andamento e compartilhada: quem chega no meio espera a mesma leitura.
		return this.loading ??= this.doLoad();
	}

	private async doLoad(): Promise<void> {
		try {
			this.remember(await this.timelineService.getEvents());

			this.loaded = true;
			this.renderTree();
			this.renderState();
		} catch {
			// A proxima tentativa volta ao disco: o servico limpa o estado de carga
			// quando a leitura falha (E2-T1), entao tentar de novo e so perguntar.
			this.showMessage(ERROR_MESSAGE, true);
		} finally {
			this.loading = undefined;
		}
	}

	/** O aviso do servico: o evento entra no mapa e a arvore e reconstruida. */
	private onDidRecord(event: ChangeEvent): void {
		this.remember([event]);
		this.renderTree();
		this.renderState();
	}

	/** Guarda o evento inteiro por id: o no carrega o id, nao o evento. */
	private remember(events: readonly ChangeEvent[]): void {
		for (const event of events) {
			this.events.set(event.id, event);
		}
	}

	/** Reconstroi a arvore a partir dos eventos; o desenho preserva o que estava aberto. */
	private renderTree(): void {
		const roots = buildChangedTree([...this.events.values()], this.folders);

		this.rootCount = roots.length;
		this.tree?.setChildren(null, toTreeElements(roots));
	}

	/** As pastas do workspace: uma raiz da arvore para cada uma. */
	private get folders(): readonly URI[] {
		return this.workspaceContextService.getWorkspace().folders.map(folder => folder.uri);
	}

	/** O recurso do arquivo: a mesma conta da decoracao da E2-T7, pasta por pasta. */
	private resourceOf(node: ChangedFileNode): URI {
		return resourcesOf(this.folders, node.fileUri)[node.folderIndex] ?? URI.file(node.fileUri);
	}

	/**
	 * O Enter e o duplo clique na arvore.
	 *
	 * Ir ate a alteracao e o mesmo gesto da lista: abre o arquivo na faixa alterada e
	 * grava a visita — mas so na alteracao aberta, entao o arquivo que tem outra
	 * alteracao pendente continua com o ponto.
	 */
	private onDidOpen(node: ChangedTreeNode | undefined): void {
		if (node === undefined) {
			return;
		}

		if (node.kind === 'folder') {
			this.tree?.toggleCollapsed(node);

			return;
		}

		const event = this.events.get(node.eventId);

		if (event === undefined) {
			return;
		}

		void this.opener.markViewed(node.eventId);
		void this.opener.open(event, this.resourceOf(node));
	}

	/** O que nao cabe na linha: o caminho inteiro e o instante da alteracao mais recente. */
	private tooltipFor(node: ChangedTreeNode): string {
		if (node.kind === 'folder') {
			return '';
		}

		const event = this.events.get(node.eventId);

		if (event === undefined) {
			return node.fileUri;
		}

		const parts = [node.fileUri, formatFullTime(event.timestamp)];

		if (node.removed) {
			parts.push(REMOVED_LABEL);
		}

		if (node.unviewed) {
			parts.push(NEW_CHANGE_LABEL);
		}

		return parts.join('\n');
	}

	/** Arvore com conteudo, ou a mensagem de que ainda nao houve alteracao. */
	private renderState(): void {
		this.showMessage(this.rootCount === 0 ? EMPTY_MESSAGE : undefined, false);
	}

	/** Troca a mensagem do corpo e, quando for o caso, o botao de tentar de novo. */
	private showMessage(text: string | undefined, retry: boolean): void {
		if (!this.message || !this.messageText) {
			return;
		}

		this.messageText.textContent = text ?? '';
		this.message.classList.toggle('hidden', text === undefined);

		// Mensagem e arvore nao dividem o espaco: a altura que o corpo passa para a
		// arvore vale so quando ela e a unica coisa ali dentro.
		this.treeContainer?.classList.toggle('hidden', text !== undefined);
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

		const button = new Button(this.message, { secondary: true, title: localize('watchCode.changedOnly.tryAgain', "Try Again") });

		button.label = localize('watchCode.changedOnly.tryAgain', "Try Again");
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
