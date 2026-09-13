/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewDescriptor, IViewsRegistry } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { WatchCodeChangedOnlyView } from './changedOnlyView.js';

/** Id da view do "so o que mudou", exposto para o registro, para a tecla e para os testes. */
export const CHANGED_ONLY_VIEW_ID = 'watchCode.changedOnly';

/** Id do comando do F7, exposto para os testes. */
export const TOGGLE_CHANGED_ONLY_COMMAND_ID = 'watchCode.changedOnly.toggle';

/**
 * A arvore do "so o que mudou", dentro do container do Explorer.
 *
 * Ela e uma view propria, e nao um filtro na arvore de arquivos: o Explorer
 * continua inteiro, e quem esconde e esta arvore. Fica recolhida como a lista da
 * timeline, e o F7 e quem a abre.
 */
class WatchCodeChangedOnlyDescriptor implements IViewDescriptor {

	readonly id = CHANGED_ONLY_VIEW_ID;
	readonly name = localize2('watchCode.changedOnly', "Changed Only");
	readonly containerIcon = Codicon.listFilter;
	readonly ctorDescriptor = new SyncDescriptor(WatchCodeChangedOnlyView);
	readonly order = 4;
	readonly weight = 40;
	readonly collapsed = true;
	readonly canToggleVisibility = true;
	readonly canMoveView = true;
	readonly hideByDefault = false;
}

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new WatchCodeChangedOnlyDescriptor()], VIEW_CONTAINER);

/**
 * O F7 do produto.
 *
 * A tecla nao pede contexto, e e de proposito: o produto reservou o F7 na
 * revisao da fileira de F1 a F12, e a primeira vez que ele e apertado e justamente
 * quem quer ver so o que mudou. A unica excecao e o editor de diff, onde o F7 ja
 * significa "proxima diferenca" e continua sendo do VS Code.
 */
registerAction2(class extends Action2 {

	constructor() {
		super({
			id: TOGGLE_CHANGED_ONLY_COMMAND_ID,
			title: localize2('watchCode.changedOnly.toggle', "Show Only Changed Files"),
			category: localize2('watchCode', "Watch Code"),
			f1: true,
			icon: Codicon.listFilter,
			keybinding: {
				primary: KeyCode.F7,
				weight: KeybindingWeight.WorkbenchContrib,
				when: EditorContextKeys.inDiffEditor.negate()
			}
		});
	}

	/**
	 * Abre a view sem roubar o foco e entrega o gesto a ela, que decide entre abrir e
	 * recolher — o mesmo desenho da navegacao da E2-T3.
	 */
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await viewsService.openView<WatchCodeChangedOnlyView>(CHANGED_ONLY_VIEW_ID, false);

		await view?.toggle();
	}
});
