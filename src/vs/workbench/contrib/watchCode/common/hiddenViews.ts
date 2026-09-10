/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Listas declarativas das views nativas que o produto Watch Code nao usa.
 *
 * Os modulos continuam no codigo-fonte; eles apenas deixam de aparecer na
 * interface. Esconder em vez de remover evita a refatoracao profunda que os
 * modulos de alto acoplamento exigiriam.
 */

/**
 * Ids dos view containers desregistrados na inicializacao.
 *
 * Sao ids de CONTAINER, nao de view: desregistrar um id de view nao tem efeito
 * nenhum. Um id que nao resolve e ignorado em silencio, porque a lista e
 * declarativa e nao pode impedir a inicializacao do workbench.
 */
export const HIDDEN_VIEW_CONTAINER_IDS: readonly string[] = [
	// Agente
	'workbench.panel.chat',                            // ChatViewContainerId
	'workbench.view.extension.copilot-chat',           // container do chat da extensao
	'workbench.view.voiceEventStreamContainer',
	'workbench.view.voiceTranscriptsContainer',
	'agentic.workbench.view.sessionsContainer',

	// Escrever, executar, depurar e testar
	'workbench.view.debug',
	'workbench.panel.repl',                            // DEBUG_PANEL_ID
	'workbench.view.extension.test',                   // Testing.ViewletId
	'workbench.panel.testResults',                     // Testing.ResultsPanelId

	// Conta, nuvem e remote
	'workbench.view.extensions',
	'workbench.view.remote',
	'workbench.view.sync',                             // SYNC_VIEW_CONTAINER_ID
	'~remote.forwardedPortsContainer',                 // TUNNEL_VIEW_CONTAINER_ID

	// Diagnostico de escrita
	'workbench.panel.markers',                         // MARKERS_CONTAINER_ID
	'workbench.panel.comments',
];

/**
 * Valores padrao de configuracao do produto.
 *
 * Ficam como default, entao o usuario ainda pode sobrescrever. Cobrem as
 * superficies de IA que nao sao view container, como a sugestao inline.
 */
export const PRODUCT_SETTING_DEFAULTS: Readonly<Record<string, unknown>> = {
	'chat.disableAIFeatures': true,

	// O welcomeGettingStarted continua no codigo, mas nao abre sozinho
	'workbench.startupEditor': 'none',
};
