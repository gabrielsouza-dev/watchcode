/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewDescriptor, IViewsRegistry } from '../../../common/views.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { WatchCodeTimelineView } from './timelineView.js';

/** Id da view da linha do tempo, exposto para o registro e para os testes. */
export const TIMELINE_VIEW_ID = 'watchCode.timeline';

/**
 * A lista da linha do tempo, dentro do container do Explorer.
 *
 * Fica abaixo da arvore de arquivos, recolhida: o Explorer continua sendo o
 * lugar dos arquivos e a lista entra como a faixa do que mudou. Recolher,
 * expandir, ocultar e mover sao os comandos do proprio VS Code, entao nao ha
 * codigo para isso aqui.
 */
class WatchCodeTimelineDescriptor implements IViewDescriptor {

	readonly id = TIMELINE_VIEW_ID;
	readonly name = localize2('watchCode.timeline', "Timeline");
	readonly containerIcon = Codicon.history;
	readonly ctorDescriptor = new SyncDescriptor(WatchCodeTimelineView);
	readonly order = 3;
	readonly weight = 40;
	readonly collapsed = true;
	readonly canToggleVisibility = true;
	readonly canMoveView = true;
	readonly hideByDefault = false;
}

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new WatchCodeTimelineDescriptor()], VIEW_CONTAINER);
