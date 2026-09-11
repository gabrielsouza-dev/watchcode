/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILocalizedString, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { NavigationDirection } from '../common/timelineNavigation.js';
import { TIMELINE_VIEW_ID } from './timeline.contribution.js';
import { TIMELINE_HAS_EVENTS, WatchCodeTimelineView } from './timelineView.js';

/** Id do comando de ir para a alteracao anterior, exposto para os testes. */
export const PREVIOUS_CHANGE_COMMAND_ID = 'watchCode.timeline.previous';

/** Id do comando de ir para a proxima alteracao, exposto para os testes. */
export const NEXT_CHANGE_COMMAND_ID = 'watchCode.timeline.next';

/**
 * O F5 ja tem dono no fork (a view de depuracao), entao o produto entra com peso
 * maior — o mesmo remedio que o proprio debug usa para si.
 */
const NAVIGATION_WEIGHT = KeybindingWeight.WorkbenchContrib + 10;

/** Os botoes so existem na nossa view, e so quando ha alteracoes para percorrer. */
const SHOW_WHEN = ContextKeyExpr.and(ContextKeyExpr.equals('view', TIMELINE_VIEW_ID), TIMELINE_HAS_EVENTS);

/**
 * Comandos de navegacao da linha do tempo.
 *
 * Eles nascem fora da view de proposito: a tecla precisa valer com o foco no
 * editor, e a lista pode nem estar desenhada — a view carrega sob demanda. O
 * comando so abre a view (sem roubar o foco) e entrega a direcao a ela.
 */
function registerNavigation(direction: NavigationDirection, id: string, title: ILocalizedString, icon: ThemeIcon, order: number, key: number): void {
	registerAction2(class extends Action2 {

		constructor() {
			super({
				id,
				title,
				category: localize2('watchCode', "Watch Code"),
				f1: true,
				icon,
				// Sem `when`: a tecla e do produto, e a primeira vez que ela e apertada e
				// justamente quem le a linha do tempo. Amarrar a tecla a "ha alteracoes"
				// criaria um ovo e galinha — a chave so vale depois da carga, e a carga so
				// acontece quando alguem desenha a view ou navega.
				keybinding: {
					primary: key,
					weight: NAVIGATION_WEIGHT
				},
				menu: {
					id: MenuId.ViewTitle,
					group: 'navigation',
					order,
					when: SHOW_WHEN
				}
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const viewsService = accessor.get(IViewsService);
			const view = await viewsService.openView<WatchCodeTimelineView>(TIMELINE_VIEW_ID, false);

			await view?.navigate(direction);
		}
	});
}

// Acima e o que veio antes; abaixo, o que veio depois — a mesma leitura da lista.
registerNavigation('previous', PREVIOUS_CHANGE_COMMAND_ID, localize2('watchCode.timeline.previous', "Previous Change"), Codicon.arrowUp, 10, KeyMod.Shift | KeyCode.F5);
registerNavigation('next', NEXT_CHANGE_COMMAND_ID, localize2('watchCode.timeline.next', "Next Change"), Codicon.arrowDown, 20, KeyCode.F5);
