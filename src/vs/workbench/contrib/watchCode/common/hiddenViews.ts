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
 * Ids das views nativas que o produto nao usa.
 *
 * Aqui o alvo e a VIEW, e nao o container: o Explorer continua sendo do produto.
 * A Timeline nativa mostra o historico de commits do arquivo ativo, que nao e o
 * que esta IDE conta; o lugar dela passa a ser a lista do Watch Code.
 */
export const HIDDEN_VIEW_IDS: readonly string[] = [
	'timeline',                                        // TimelinePaneId
];

/**
 * Ids dos comandos que saem da paleta.
 *
 * O criterio e o mesmo das views: fica o que le, sai o que escreve. Sort Imports
 * reordena o arquivo do agente, e escolher a versao do TypeScript e configurar
 * a ferramenta de escrita que o produto nao oferece.
 *
 * Diferente das views, aqui o item e registrado mesmo quando o comando ainda
 * nao existe: a supressao precisa estar no lugar antes de a extensao registrar
 * o comando, senao o item implicito da paleta aparece.
 *
 * Esta lista e so metade da supressao. O item da paleta com when falso suprime
 * o item IMPLICITO, que todo comando registrado ganha; se a extensao declarar a
 * entrada em contributes.menus.commandPalette, esse item e explicito e continua
 * aparecendo. Por isso as entradas de escrita tambem sairam do package.json da
 * extensao: as duas metades juntas e que tiram o comando da paleta.
 */
export const HIDDEN_COMMAND_IDS: readonly string[] = [
	'typescript.sortImports',
	'javascript.sortImports',
	'typescript.removeUnusedImports',
	'javascript.removeUnusedImports',
	'typescript.selectTypeScriptVersion',
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

	// A inteligencia de codigo existe para LER o que o agente escreveu: o F12 leva
	// a definicao e o hover mostra a assinatura. Validar, sugerir, formatar e baixar
	// tipos sao superficies de escrita, e ficam desligadas por padrao.
	'typescript.validate.enable': false,
	'javascript.validate.enable': false,
	'typescript.suggest.enabled': false,
	'javascript.suggest.enabled': false,
	'typescript.format.enable': false,
	'javascript.format.enable': false,
	'typescript.disableAutomaticTypeAcquisition': true,

	// Com a validacao desligada o servidor nao emite evento de diagnostico, e sem
	// esse evento o cliente nunca sai do estado "carregando projeto" - o que faz
	// definicao e hover irem para o servidor sintatico, que nao tem projeto e nao
	// responde. Um servidor so elimina o roteamento e devolve o F12.
	'typescript.tsserver.useSyntaxServer': 'never',

	// A sugestao por palavra do documento e outro provedor, nao o TypeScript
	'editor.wordBasedSuggestions': 'off',

	// A lampada abre o menu de acao rapida, que e o caminho curto para editar
	'editor.lightbulb.enabled': 'off',
};
