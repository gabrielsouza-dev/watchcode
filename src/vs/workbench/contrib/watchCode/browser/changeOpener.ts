/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { URI } from '../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { ChangeEvent, ChangeLineRange } from '../../../../platform/changeLedger/common/changeEvent.js';
import { ITimelineService } from '../../../../platform/changeLedger/common/timelineService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorControl } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { planReveal, RevealMissReason } from '../common/changeReveal.js';
import { CENTER_ON_REVEAL_SETTING } from './timelineConfiguration.contribution.js';

/** O que o gatilho do salto manda, quando manda alguma coisa. */
export interface IChangeOpenOptions {
	/** Opções de abertura vindas do gatilho; sem elas valem pré-visualização e foco onde estava. */
	readonly editorOptions?: IEditorOptions;
	/** Diz se a abertura ainda interessa: a lista cancela quando o evento ativo muda. */
	readonly shouldContinue?: () => boolean;
}

/**
 * Leva o desenvolvedor até a alteração e grava a visita.
 *
 * É o mesmo gesto em toda a superfície do produto — a lista da timeline e a
 * árvore do "só o que mudou" —, e por isso mora aqui e não dentro de uma view.
 */
export class ChangeOpener {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITimelineService private readonly timelineService: ITimelineService,
	) { }

	/**
	 * Abre o recurso do evento e revela a faixa alterada.
	 *
	 * A abertura é uma promessa, e quem chamou não espera por ela além do disco
	 * responder: `shouldContinue` é a última palavra antes de abrir.
	 */
	async open(event: ChangeEvent | undefined, resource: URI, options: IChangeOpenOptions = {}): Promise<void> {
		if (!event) {
			return;
		}

		// Sem opções vindas do gatilho, valem as do produto: pré-visualização e foco
		// onde estava. Ausente não é o mesmo que falso: sem isto o editor rouba o foco.
		const aberturas = options.editorOptions ?? { preserveFocus: true, pinned: false };
		const plan = planReveal(event, await this.fileService.exists(resource));

		if (options.shouldContinue?.() === false) {
			return;
		}

		if (plan.kind === 'missing') {
			this.warnMissing(plan.because);

			return;
		}

		const pane = await this.editorService.openEditor({
			resource,
			options: {
				...aberturas,
				revealIfOpened: true,
				ignoreError: true
			}
		});

		this.revealRange(pane?.getControl(), plan.range);
	}

	/**
	 * Grava que o desenvolvedor foi até esta alteração.
	 *
	 * A navegação não espera pelo selo nem depende dele: se a gravação falhar, a
	 * alteração continua nova e a próxima visita tenta de novo.
	 */
	async markViewed(eventId: string): Promise<void> {
		try {
			await this.timelineService.markViewed(eventId);
		} catch {
			// O selo é acessório ao salto: falhar aqui não muda o que o desenvolvedor vê.
		}
	}

	/**
	 * Põe o cursor na faixa alterada e a deixa visível.
	 *
	 * A posição é aplicada no editor, e não pedida por opção de abertura: num
	 * arquivo que já estava aberto o VS Code só reaplica as opções, e a rolagem que
	 * vem delas é suave — que não anda quando a janela não está desenhando quadros.
	 * Com a posição na mão, o salto é o mesmo nos dois casos.
	 *
	 * A faixa é limitada ao que o arquivo tem hoje: uma entrada histórica pode
	 * apontar para linhas que já não existem.
	 */
	private revealRange(control: IEditorControl | undefined, range: ChangeLineRange | undefined): void {
		if (!range) {
			return;
		}

		const editor = getCodeEditor(control);
		const model = editor?.getModel();

		if (!editor || !model) {
			return;
		}

		const ultima = Math.min(range[1], model.getLineCount());
		const primeira = Math.min(range[0], ultima);
		const selection = new Selection(primeira, 1, ultima, model.getLineMaxColumn(ultima));

		editor.setSelection(selection);

		if (this.centerOnReveal) {
			editor.revealRangeInCenter(selection, ScrollType.Immediate);
		} else {
			editor.revealRangeInCenterIfOutsideViewport(selection, ScrollType.Immediate);
		}
	}

	/** A decisão D4 da E2-T4: centralizar sempre, ou só rolar quando as linhas estão fora da vista. */
	private get centerOnReveal(): boolean {
		return this.configurationService.getValue<boolean>(CENTER_ON_REVEAL_SETTING) ?? true;
	}

	/** Diz que não há o que abrir, sem abrir editor nenhum. */
	private warnMissing(reason: RevealMissReason): void {
		const message = reason === 'removed'
			? localize('watchCode.change.removed', "This change removed the file. Nothing to open.")
			: localize('watchCode.change.missing', "The file of this change is no longer in the workspace.");

		this.notificationService.info(message);
	}
}
