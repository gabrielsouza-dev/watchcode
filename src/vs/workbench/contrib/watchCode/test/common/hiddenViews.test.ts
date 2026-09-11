/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { HIDDEN_COMMAND_IDS, HIDDEN_VIEW_CONTAINER_IDS, PRODUCT_SETTING_DEFAULTS } from '../../common/hiddenViews.js';

suite('watchCode hiddenViews', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('nao repete ids de container', () => {
		const unicos = new Set(HIDDEN_VIEW_CONTAINER_IDS);
		assert.strictEqual(unicos.size, HIDDEN_VIEW_CONTAINER_IDS.length, 'a lista tem id duplicado');
	});

	test('nao tem id vazio', () => {
		for (const id of HIDDEN_VIEW_CONTAINER_IDS) {
			assert.ok(id.trim().length > 0, 'id vazio na lista');
		}
	});

	test('todo id parece um id de view container', () => {
		for (const id of HIDDEN_VIEW_CONTAINER_IDS) {
			assert.ok(id.includes('.') || id.startsWith('~'), `id suspeito: ${id}`);
		}
	});

	test('esconde as superficies de agente, escrita e conta', () => {
		for (const esperado of [
			'workbench.panel.chat',
			'workbench.view.debug',
			'workbench.view.extension.test',
			'workbench.view.extensions',
			'workbench.view.remote',
			'workbench.view.sync',
		]) {
			assert.ok(HIDDEN_VIEW_CONTAINER_IDS.includes(esperado), `faltou esconder ${esperado}`);
		}
	});

	test('preserva as views que o produto usa', () => {
		for (const preservado of [
			'workbench.view.explorer',
			'workbench.view.scm',
			'workbench.panel.output',
			'terminal',
		]) {
			assert.ok(!HIDDEN_VIEW_CONTAINER_IDS.includes(preservado), `nao deveria esconder ${preservado}`);
		}
	});

	test('nao repete ids de comando', () => {
		const unicos = new Set(HIDDEN_COMMAND_IDS);
		assert.strictEqual(unicos.size, HIDDEN_COMMAND_IDS.length, 'a lista tem id duplicado');
	});

	test('esconde os comandos que escrevem', () => {
		for (const esperado of [
			'typescript.sortImports',
			'javascript.sortImports',
			'typescript.removeUnusedImports',
			'javascript.removeUnusedImports',
			'typescript.selectTypeScriptVersion',
		]) {
			assert.ok(HIDDEN_COMMAND_IDS.includes(esperado), `faltou esconder ${esperado}`);
		}
	});

	test('preserva os comandos que leem', () => {
		for (const preservado of [
			'typescript.goToSourceDefinition',
			'typescript.findAllFileReferences',
			'typescript.restartTsServer',
		]) {
			assert.ok(!HIDDEN_COMMAND_IDS.includes(preservado), `nao deveria esconder ${preservado}`);
		}
	});

	test('desliga as superficies de IA por padrao', () => {
		assert.strictEqual(PRODUCT_SETTING_DEFAULTS['chat.disableAIFeatures'], true);
	});

	test('desliga a escrita do TypeScript por padrao', () => {
		assert.deepStrictEqual({
			validate: PRODUCT_SETTING_DEFAULTS['typescript.validate.enable'],
			validateJs: PRODUCT_SETTING_DEFAULTS['javascript.validate.enable'],
			suggest: PRODUCT_SETTING_DEFAULTS['typescript.suggest.enabled'],
			suggestJs: PRODUCT_SETTING_DEFAULTS['javascript.suggest.enabled'],
			format: PRODUCT_SETTING_DEFAULTS['typescript.format.enable'],
			formatJs: PRODUCT_SETTING_DEFAULTS['javascript.format.enable'],
			typeAcquisition: PRODUCT_SETTING_DEFAULTS['typescript.disableAutomaticTypeAcquisition'],
			syntaxServer: PRODUCT_SETTING_DEFAULTS['typescript.tsserver.useSyntaxServer'],
			wordBasedSuggestions: PRODUCT_SETTING_DEFAULTS['editor.wordBasedSuggestions'],
			lightbulb: PRODUCT_SETTING_DEFAULTS['editor.lightbulb.enabled'],
		}, {
			validate: false,
			validateJs: false,
			suggest: false,
			suggestJs: false,
			format: false,
			formatJs: false,
			typeAcquisition: true,
			syntaxServer: 'never',
			wordBasedSuggestions: 'off',
			lightbulb: 'off',
		});
	});
});
