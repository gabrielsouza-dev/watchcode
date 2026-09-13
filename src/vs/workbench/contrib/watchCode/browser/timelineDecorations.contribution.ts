/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ITimelineService } from '../../../../platform/changeLedger/common/timelineService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { editorInfoForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { indexTouchedFiles, resourcesOf, TouchedFileState } from '../common/timelineFileDecoration.js';

/** Id da contribuição do provedor de decoração. */
export const TIMELINE_DECORATIONS_ID = 'workbench.contrib.watchCode.timelineDecorations';

/**
 * Peso da decoração.
 *
 * O serviço de decoração ordena os provedores por peso e deixa a cor do maior
 * valer; sem peso explícito, quem vence seria a ordem de registro, que o produto
 * não controla. 1000 é o mesmo número que o chat usa nas alterações dele.
 */
const DECORATION_WEIGHT = 1000;

/** Dado do arquivo que o agente tocou e o desenvolvedor já viu. */
const TOUCHED_DECORATION: IDecorationData = {
	weight: DECORATION_WEIGHT,
	color: editorInfoForeground,
	tooltip: localize('watchCode.decoration.touched', "Changed by the agent")
};

/** Dado do arquivo que o agente tocou e o desenvolvedor ainda não viu. */
const UNVIEWED_DECORATION: IDecorationData = {
	weight: DECORATION_WEIGHT,
	color: editorInfoForeground,
	letter: Codicon.circleFilled,
	bubble: true,
	tooltip: localize('watchCode.decoration.unviewed', "Changed by the agent and not viewed yet")
};

/** Pastas do workspace, de onde saem as chaves da decoração. */
function workspaceFolders(contextService: IWorkspaceContextService): readonly URI[] {
	return contextService.getWorkspace().folders.map(folder => folder.uri);
}

/** Recursos distintos a partir das chaves do índice. */
function distinctUris(keys: readonly string[]): URI[] {
	return [...new Set(keys)].map(key => URI.parse(key));
}

/**
 * Decoração dos arquivos que o agente tocou, na própria árvore de arquivos.
 *
 * A cor diz que o agente passou pelo arquivo; o ponto, que a alteração ainda
 * não foi olhada. Quem desenha é o Explorer: aqui só se responde o que ele
 * pergunta, pelo mesmo `IDecorationsService` que o git e o chat usam — nenhum
 * código do Explorer é tocado.
 */
export class TimelineDecorationsProvider extends Disposable implements IDecorationsProvider {

	readonly label: string = localize('watchCode.decoration.label', "Watch Code");

	private readonly _onDidChange = this._register(new Emitter<readonly URI[]>());
	readonly onDidChange: Event<readonly URI[]> = this._onDidChange.event;

	/** Arquivos tocados, pela chave do recurso. */
	private index = new Map<string, TouchedFileState>();

	/** Pastas do workspace, de onde saem as chaves. */
	private folders: readonly URI[];

	constructor(
		@ITimelineService private readonly timelineService: ITimelineService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super();

		this.folders = workspaceFolders(contextService);

		// A alteração nova e a alteração visitada são os dois únicos fatos que mudam a
		// decoração: o resto do estado já está dentro do próprio evento.
		this._register(timelineService.onDidChange(change => void this.refresh(change.added.fileUri)));
		this._register(timelineService.onDidMarkViewed(event => void this.refresh(event.fileUri)));
		this._register(contextService.onDidChangeWorkspaceFolders(() => {
			this.folders = workspaceFolders(contextService);
			void this.reload();
		}));

		void this.reload();
	}

	provideDecorations(uri: URI): IDecorationData | undefined {
		const state = this.index.get(uri.toString());

		if (state === 'unviewed') {
			return UNVIEWED_DECORATION;
		}

		return state === 'viewed' ? TOUCHED_DECORATION : undefined;
	}

	/** Lê a lista e avisa tudo o que já estava desenhado na árvore. */
	private async reload(): Promise<void> {
		const previous = this.index;

		if (!await this.loadIndex()) {
			return;
		}

		this._onDidChange.fire(distinctUris([...previous.keys(), ...this.index.keys()]));
	}

	/** Lê a lista e avisa só o arquivo que mudou. */
	private async refresh(fileUri: string): Promise<void> {
		if (await this.loadIndex()) {
			this._onDidChange.fire(resourcesOf(this.folders, fileUri));
		}
	}

	/**
	 * Refaz o índice a partir do modelo de leitura.
	 *
	 * Falha de leitura não vira erro na árvore: a decoração é um sinal a mais, e a
	 * linha do tempo já trata a falha dela. Sem leitura, o índice fica como estava e
	 * ninguém é avisado. Depois do descarte a resposta tardia não avisa ninguém.
	 */
	private async loadIndex(): Promise<boolean> {
		try {
			this.index = indexTouchedFiles(await this.timelineService.getEvents(), this.folders);

			return !this._store.isDisposed;
		} catch {
			return false;
		}
	}
}

/**
 * Registra o provedor de decoração no serviço do workbench.
 *
 * A fase é a mesma do indicador da observação: a árvore já está montada quando o
 * provedor entra, e o registro do próprio serviço avisa a interface para que ela
 * pergunte de novo.
 */
class TimelineDecorationsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = TIMELINE_DECORATIONS_ID;

	constructor(
		@IDecorationsService decorationsService: IDecorationsService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._register(decorationsService.registerDecorationsProvider(
			instantiationService.createInstance(TimelineDecorationsProvider)
		));
	}
}

registerWorkbenchContribution2(TimelineDecorationsContribution.ID, TimelineDecorationsContribution, WorkbenchPhase.AfterRestored);
