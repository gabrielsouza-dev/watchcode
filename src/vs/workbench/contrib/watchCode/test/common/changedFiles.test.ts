/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.
import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChangeEvent } from '../../../../../platform/changeLedger/common/changeEvent.js';
import { buildChangedTree, ChangedFolderNode } from '../../common/changedFiles.js';

/** Pasta do workspace dos testes, na forma com que o VS Code escreve a URI. */
const WORKSPACE_FOLDER = URI.parse('file:///c%3A/ws');

/** Segunda pasta, para o caso de workspace com mais de uma raiz. */
const SECOND_FOLDER = URI.parse('file:///c%3A/outro');

/** Evento com o que o teste precisa, sem repetir o resto. */
function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
	return {
		id: 'event-1',
		sessionId: 'session-1',
		source: 'agent',
		attribution: 'observed',
		fileUri: 'a.ts',
		beforeHash: 'hash-antes',
		afterHash: 'hash-depois',
		timestamp: 1767225600000,
		status: 'current',
		...overrides
	};
}

/** A arvore de uma pasta so, que e o caso da maioria dos testes. */
function treeOf(events: readonly ChangeEvent[]): readonly ChangedFolderNode[] {
	return buildChangedTree(events, [WORKSPACE_FOLDER]);
}

/** O no de arquivo, com o que o teste confere. */
function fileNode(id: string, name: string, eventId: string, extra: Partial<{ unviewed: boolean; removed: boolean }> = {}) {
	return {
		kind: 'file',
		id: 'file:///c%3A/ws/' + id,
		name,
		fileUri: id,
		folderIndex: 0,
		eventId,
		unviewed: true,
		removed: false,
		...extra
	};
}

suite('watchCode changedFiles', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('um arquivo na raiz vira filho do no da pasta do workspace', () => {
		assert.deepStrictEqual(treeOf([changeEvent()]), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [fileNode('a.ts', 'a.ts', 'event-1')]
		}]);
	});

	test('dois arquivos na mesma pasta aparecem sob uma pasta so, em ordem', () => {
		const events = [
			changeEvent({ id: 'event-b', fileUri: 'pasta/b.ts' }),
			changeEvent({ id: 'event-a', fileUri: 'pasta/a.ts', timestamp: 1767225600001 })
		];

		assert.deepStrictEqual(treeOf(events), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [{
				kind: 'folder',
				id: 'file:///c%3A/ws/pasta',
				name: 'pasta',
				children: [
					fileNode('pasta/a.ts', 'a.ts', 'event-a'),
					fileNode('pasta/b.ts', 'b.ts', 'event-b')
				]
			}]
		}]);
	});

	test('pastas aninhadas viram nos aninhados, na ordem do caminho', () => {
		assert.deepStrictEqual(treeOf([changeEvent({ fileUri: 'pasta/sub/c.ts' })]), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [{
				kind: 'folder',
				id: 'file:///c%3A/ws/pasta',
				name: 'pasta',
				children: [{
					kind: 'folder',
					id: 'file:///c%3A/ws/pasta/sub',
					name: 'sub',
					children: [fileNode('pasta/sub/c.ts', 'c.ts', 'event-1')]
				}]
			}]
		}]);
	});

	test('pastas vem antes de arquivos, e cada grupo pelo nome', () => {
		const events = [
			changeEvent({ id: 'event-alfa', fileUri: 'alfa.ts' }),
			changeEvent({ id: 'event-gama', fileUri: 'gama/x.ts', timestamp: 1767225600001 }),
			changeEvent({ id: 'event-beta', fileUri: 'beta/y.ts', timestamp: 1767225600002 })
		];

		const [raiz] = treeOf(events);

		assert.deepStrictEqual(raiz.children.map(no => no.name), ['beta', 'gama', 'alfa.ts']);
	});

	test('duas alteracoes no mesmo arquivo viram um no, com a mais recente', () => {
		const events = [
			changeEvent({ id: 'event-novo', timestamp: 1767225600002 }),
			changeEvent({ id: 'event-antigo', timestamp: 1767225600001 })
		];

		assert.deepStrictEqual(treeOf(events), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [fileNode('a.ts', 'a.ts', 'event-novo')]
		}]);
	});

	test('uma alteracao nao vista basta para o arquivo continuar pendente', () => {
		const events = [
			changeEvent({ id: 'event-visto', viewedAt: 1767225600001 }),
			changeEvent({ id: 'event-pendente', timestamp: 1767225600002 })
		];

		assert.deepStrictEqual(treeOf(events), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [fileNode('a.ts', 'a.ts', 'event-pendente')]
		}]);
	});

	test('a remocao mais recente marca o arquivo como removido', () => {
		const events = [
			changeEvent({ id: 'event-escrita', timestamp: 1767225600001 }),
			changeEvent({ id: 'event-remocao', timestamp: 1767225600002, afterHash: undefined })
		];

		assert.deepStrictEqual(treeOf(events), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [fileNode('a.ts', 'a.ts', 'event-remocao', { removed: true })]
		}]);
	});

	test('arquivo removido e recriado nao fica marcado como removido', () => {
		const events = [
			changeEvent({ id: 'event-remocao', timestamp: 1767225600001, afterHash: undefined }),
			changeEvent({ id: 'event-criacao', timestamp: 1767225600002 })
		];

		assert.deepStrictEqual(treeOf(events), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [fileNode('a.ts', 'a.ts', 'event-criacao')]
		}]);
	});

	test('pasta do workspace sem alteracao nenhuma nao aparece', () => {
		assert.deepStrictEqual(buildChangedTree([], [WORKSPACE_FOLDER, SECOND_FOLDER]), []);
	});

	test('sem evento nenhum a arvore sai vazia', () => {
		assert.deepStrictEqual(treeOf([]), []);
	});

	test('o mesmo caminho aparece em cada pasta do workspace, com o indice dela', () => {
		const nos = buildChangedTree([changeEvent({ fileUri: 'pasta/a.ts' })], [WORKSPACE_FOLDER, SECOND_FOLDER]);

		assert.deepStrictEqual(nos, [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [{
				kind: 'folder',
				id: 'file:///c%3A/ws/pasta',
				name: 'pasta',
				children: [fileNode('pasta/a.ts', 'a.ts', 'event-1')]
			}]
		}, {
			kind: 'folder',
			id: 'file:///c%3A/outro',
			name: 'outro',
			children: [{
				kind: 'folder',
				id: 'file:///c%3A/outro/pasta',
				name: 'pasta',
				children: [{ ...fileNode('pasta/a.ts', 'a.ts', 'event-1'), id: 'file:///c%3A/outro/pasta/a.ts', folderIndex: 1 }]
			}]
		}]);
	});

	test('barra invertida e prefixo de pasta atual sao normalizados', () => {
		assert.deepStrictEqual(treeOf([changeEvent({ fileUri: '.\\pasta\\a.ts' })]), [{
			kind: 'folder',
			id: 'file:///c%3A/ws',
			name: 'ws',
			children: [{
				kind: 'folder',
				id: 'file:///c%3A/ws/pasta',
				name: 'pasta',
				children: [fileNode('pasta/a.ts', 'a.ts', 'event-1')]
			}]
		}]);
	});

	test('evento sem caminho nao vira no', () => {
		assert.deepStrictEqual(treeOf([changeEvent({ fileUri: '   ' })]), []);
	});
});
