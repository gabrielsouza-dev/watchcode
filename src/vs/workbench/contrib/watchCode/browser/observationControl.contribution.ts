/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IWorkspaceWatcherService } from '../../../../platform/changeLedger/common/workspaceWatcherService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';

/** Id do comando de alternância, exposto para o indicador e para os testes. */
export const TOGGLE_OBSERVATION_COMMAND_ID = 'watchCode.toggleObservation';

/** Id do item na barra de status. */
const STATUS_ENTRY_ID = 'watchCode.observation';

/** Prioridade do item dentro do grupo da direita. */
const STATUS_ENTRY_PRIORITY = 100;

/** Indicador da barra de status com a observação ligada. */
const ACTIVE_ENTRY: IStatusbarEntry = {
	name: localize('watchCode.observation.name', "Observation"),
	text: '$(eye) Watch Code',
	ariaLabel: localize('watchCode.observation.activeAriaLabel', "Watch Code: observation is on. Click to turn it off."),
	tooltip: localize('watchCode.observation.activeTooltip', "Watch Code is observing the workspace. Click to turn observation off."),
	command: TOGGLE_OBSERVATION_COMMAND_ID
};

/** Indicador da barra de status com a observação desligada. */
const INACTIVE_ENTRY: IStatusbarEntry = {
	name: localize('watchCode.observation.name', "Observation"),
	text: '$(eye-closed) Watch Code',
	ariaLabel: localize('watchCode.observation.inactiveAriaLabel', "Watch Code: observation is off. Click to turn it on."),
	tooltip: localize('watchCode.observation.inactiveTooltip', "Watch Code is not observing the workspace. Click to turn observation on."),
	command: TOGGLE_OBSERVATION_COMMAND_ID
};

/**
 * Comando e indicador do estado da observação.
 *
 * O estado é do watcher, e não da interface: esta contribuição só oferece os dois
 * caminhos para invertê-lo — a Paleta de Comandos e o clique no indicador — e
 * desenha o resultado. Como não guarda cópia do estado, não tem como divergir
 * dele.
 */
class ObservationControlContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.watchCode.observationControl';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IWorkspaceWatcherService private readonly workspaceWatcherService: IWorkspaceWatcherService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(
			TOGGLE_OBSERVATION_COMMAND_ID,
			() => this.workspaceWatcherService.toggle()
		));

		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: TOGGLE_OBSERVATION_COMMAND_ID,
				category: localize('watchCode', "Watch Code"),
				title: localize('watchCode.toggleObservation', "Turn Observation On/Off")
			}
		});

		// Ler o estado agora e escutar daqui em diante cobre as duas ordens
		// possíveis: esta contribuição pode subir antes ou depois do watcher.
		this.render(this.workspaceWatcherService.isActive);
		this._register(this.workspaceWatcherService.onDidChangeActive(active => this.render(active)));
	}

	/** Desenha o indicador, criando o item na primeira vez. */
	private render(active: boolean): void {
		const entry = active ? ACTIVE_ENTRY : INACTIVE_ENTRY;

		if (this.entry.value) {
			this.entry.value.update(entry);
		} else {
			this.entry.value = this.statusbarService.addEntry(entry, STATUS_ENTRY_ID, StatusbarAlignment.RIGHT, STATUS_ENTRY_PRIORITY);
		}
	}
}

registerWorkbenchContribution2(ObservationControlContribution.ID, ObservationControlContribution, WorkbenchPhase.AfterRestored);
