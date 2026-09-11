/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

/** Diz se o salto centraliza a alteracao na tela, em vez de rolar so o necessario. */
export const CENTER_ON_REVEAL_SETTING = 'watchCode.timeline.centerOnReveal';

/**
 * O no de configuracao do produto.
 *
 * Fica em modulo proprio, e nao no registro da view, porque a view precisa ler a
 * chave: morando la, a view importaria o modulo que importa a view — ciclo com a
 * classe ainda por avaliar no topo do modulo.
 */
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'watchCode',
	title: localize('watchCode.configurationTitle', "Watch Code"),
	type: 'object',
	properties: {
		[CENTER_ON_REVEAL_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('watchCode.timeline.centerOnRevealDescription', "Center the change on the screen when jumping to it. When off, the editor only scrolls if the changed lines are outside the visible area.")
		}
	}
});
