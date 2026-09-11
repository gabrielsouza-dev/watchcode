/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IWorkspaceContextService } from '../../../workspace/common/workspace.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../common/changeLedgerService.js';
import { ChangeEvent } from '../../common/changeEvent.js';
import { ChangeRecorderService, IChangeRecorderService, ObservedChangeKind, WorkspaceHeadReader, WorkspacePathKindReader } from '../../common/changeRecorderService.js';
import { computeContentHash } from '../../common/snapshotHash.js';

const WORKSPACE_FOLDER = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
const FILE_URI = 'src/vs/base/a.ts';
const TIMESTAMP = 1767225600000;

/** Lê o conteúdo do arquivo dentro do workspace em memória. */
function resource(fileUri: string): URI {
	return URI.joinPath(WORKSPACE_FOLDER, fileUri);
}

/**
 * O evento que o recorder gravou.
 *
 * Os testes de alteração de arquivo exigem que ele exista: `undefined` é a
 * resposta para o caminho que não é arquivo, e nenhum deles testa esse caso.
 */
async function recordedEvent(change: Promise<ChangeEvent | undefined>): Promise<ChangeEvent> {
	const event = await change;

	if (!event) {
		throw new Error('o recorder nao gravou evento nenhum');
	}

	return event;
}

suite('changeRecorderService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let ledger: IChangeLedgerService;

	function createRecorder(readFromHead?: WorkspaceHeadReader, readPathKind?: WorkspacePathKindReader): IChangeRecorderService {
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }] }),
		} as unknown as IWorkspaceContextService;

		return new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService, readFromHead, readPathKind);
	}

	function observedChange(overrides: Partial<{ fileUri: string; attribution: 'hook' | 'observed'; kind: ObservedChangeKind; folderUri: URI; timestamp: number }> = {}) {
		return {
			fileUri: FILE_URI,
			sessionId: 'S-0001',
			attribution: 'observed' as const,
			kind: 'updated' as const,
			timestamp: TIMESTAMP,
			...overrides,
		};
	}

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }] }),
		} as unknown as IWorkspaceContextService;

		ledger = disposables.add(new ChangeLedgerService(fileService, environmentService, workspaceContextService));
	});

	test('registra a alteração com o "antes" vindo do git', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const before = VSBuffer.fromString('antes');

		const event = await recordedEvent(createRecorder(() => Promise.resolve(before)).recordChange(observedChange()));

		assert.deepStrictEqual({
			source: event.source,
			attribution: event.attribution,
			fileUri: event.fileUri,
			sessionId: event.sessionId,
			timestamp: event.timestamp,
			status: event.status,
			beforeHash: event.beforeHash,
			afterHash: event.afterHash,
		}, {
			source: 'agent',
			attribution: 'observed',
			fileUri: FILE_URI,
			sessionId: 'S-0001',
			timestamp: TIMESTAMP,
			status: 'current',
			beforeHash: await computeContentHash(before),
			afterHash: await computeContentHash(VSBuffer.fromString('depois')),
		});
	});

	test('o "antes" vindo do git fica guardado no store de snapshots', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const before = VSBuffer.fromString('antes');

		const event = await recordedEvent(createRecorder(() => Promise.resolve(before)).recordChange(observedChange()));
		const stored = event.beforeHash ? await ledger.readSnapshot(event.beforeHash) : undefined;

		assert.deepStrictEqual({
			stored: stored?.toString(),
			hashIsTheRealOne: event.beforeHash === await computeContentHash(before),
		}, {
			stored: 'antes',
			hashIsTheRealOne: true,
		});
	});

	test('sem baseline algum o evento é gravado sem "antes"', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange()));

		assert.strictEqual(event.beforeHash, undefined);
		assert.strictEqual(event.afterHash, await computeContentHash(VSBuffer.fromString('depois')));
	});

	test('a segunda alteração usa como "antes" o conteúdo da primeira', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		await recorder.recordChange(observedChange());

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('segundo'));
		const second = await recordedEvent(recorder.recordChange(observedChange()));

		assert.deepStrictEqual({
			beforeHash: second.beforeHash,
			afterHash: second.afterHash,
		}, {
			beforeHash: await computeContentHash(VSBuffer.fromString('primeiro')),
			afterHash: await computeContentHash(VSBuffer.fromString('segundo')),
		});
	});

	test('a atribuição do anúncio é preservada no evento', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange({ attribution: 'hook' })));

		assert.strictEqual(event.attribution, 'hook');
	});

	test('o evento gravado entra no ledger como atual', async () => {
		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		const event = await recordedEvent(createRecorder().recordChange(observedChange()));
		const stored = await ledger.readByFile(FILE_URI);

		assert.strictEqual(stored.length, 1);
		assert.deepStrictEqual(stored[0], event);
	});

	test('a pasta não é arquivo e não vira evento', async () => {
		const pasta = 'pasta';

		await fileService.createFolder(resource(pasta));

		const event = await createRecorder().recordChange(observedChange({ fileUri: pasta }));

		assert.deepStrictEqual({
			event,
			eventos: (await ledger.readByFile(pasta)).length,
		}, {
			event: undefined,
			eventos: 0,
		});
	});

	test('a pasta não atrapalha o arquivo que nasce no mesmo caminho', async () => {
		const recorder = createRecorder();
		const caminho = 'alvo';

		await fileService.createFolder(resource(caminho));
		const pasta = await recorder.recordChange(observedChange({ fileUri: caminho }));

		// A pasta sai e um arquivo ocupa o mesmo caminho: sem nada memorizado para a
		// pasta, o arquivo tem de virar evento normalmente.
		await fileService.del(resource(caminho), { recursive: true });
		await fileService.writeFile(resource(caminho), VSBuffer.fromString('agora e arquivo'));
		const arquivo = await recorder.recordChange(observedChange({ fileUri: caminho }));

		assert.deepStrictEqual({
			pasta,
			arquivo: arquivo?.afterHash,
			eventos: (await ledger.readByFile(caminho)).length,
		}, {
			pasta: undefined,
			arquivo: await computeContentHash(VSBuffer.fromString('agora e arquivo')),
			eventos: 1,
		});
	});

	test('a pasta removida não vira evento', async () => {
		const recorder = createRecorder();
		const pasta = 'pasta';

		// A pasta nasce e é lida: é assim que a observação aprende que ela é pasta.
		await fileService.createFolder(resource(pasta));
		const criacao = await recorder.recordChange(observedChange({ fileUri: pasta }));

		// A remoção não lê o disco: a prova tem de vir do que já foi visto.
		await fileService.del(resource(pasta), { recursive: true });
		const remocao = await recorder.recordChange(observedChange({ fileUri: pasta, kind: 'deleted' }));

		assert.deepStrictEqual({
			criacao,
			remocao,
			eventos: (await ledger.readByFile(pasta)).length,
		}, {
			criacao: undefined,
			remocao: undefined,
			eventos: 0,
		});
	});

	test('a pasta com arquivo dentro é reconhecida sem consultar o git', async () => {
		const consultados: string[] = [];
		const recorder = createRecorder(undefined, async fileUri => {
			consultados.push(fileUri);

			return 'unknown';
		});
		const pasta = 'pasta';
		const arquivo = 'pasta/regra.ts';

		// O arquivo dentro da pasta prova que ela é pasta, e a prova fica guardada.
		await fileService.writeFile(resource(arquivo), VSBuffer.fromString('dentro'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: arquivo })));

		await fileService.del(resource(pasta), { recursive: true });
		const remocao = await recorder.recordChange(observedChange({ fileUri: pasta, kind: 'deleted', timestamp: TIMESTAMP + 1 }));
		const eventos = await ledger.readByFile(arquivo);

		assert.deepStrictEqual({
			remocao,
			consultados,
			eventos: eventos.length,
			afterHash: eventos[eventos.length - 1]?.afterHash,
		}, {
			remocao: undefined,
			consultados: [],
			// A pasta não vira evento, e o arquivo que ela levou ganha o da remoção.
			eventos: 2,
			afterHash: undefined,
		});
	});

	test('o git reconhece a pasta que já existia', async () => {
		const consultados: string[] = [];
		const recorder = createRecorder(undefined, async fileUri => {
			consultados.push(fileUri);

			return 'directory';
		});

		const remocao = await recorder.recordChange(observedChange({ fileUri: 'pasta-antiga', kind: 'deleted' }));

		assert.deepStrictEqual({
			remocao,
			consultados,
			eventos: (await ledger.readByFile('pasta-antiga')).length,
		}, {
			remocao: undefined,
			consultados: ['pasta-antiga'],
			eventos: 0,
		});
	});

	test('o git dizendo arquivo mantém a remoção', async () => {
		const recorder = createRecorder(undefined, async () => 'file');
		const caminho = 'apagado.ts';

		const remocao = await recordedEvent(recorder.recordChange(observedChange({ fileUri: caminho, kind: 'deleted' })));

		assert.deepStrictEqual({
			fileUri: remocao.fileUri,
			afterHash: remocao.afterHash,
			eventos: (await ledger.readByFile(caminho)).length,
		}, {
			fileUri: caminho,
			afterHash: undefined,
			eventos: 1,
		});
	});

	test('sem prova nenhuma a remoção continua sendo gravada', async () => {
		const recorder = createRecorder(undefined, async () => 'unknown');

		const remocao = await recordedEvent(recorder.recordChange(observedChange({ fileUri: 'nunca-visto.ts', kind: 'deleted' })));

		assert.deepStrictEqual({
			afterHash: remocao.afterHash,
			beforeHash: remocao.beforeHash,
		}, {
			afterHash: undefined,
			beforeHash: undefined,
		});
	});

	test('o arquivo que nasce no lugar da pasta removida vira evento', async () => {
		const recorder = createRecorder();
		const caminho = 'alvo';

		await fileService.createFolder(resource(caminho));
		await recorder.recordChange(observedChange({ fileUri: caminho }));

		// A pasta sai e um arquivo ocupa o lugar: a marca de pasta do caminho cai na
		// leitura, e o evento do arquivo nasce normalmente.
		await fileService.del(resource(caminho), { recursive: true });
		await recorder.recordChange(observedChange({ fileUri: caminho, kind: 'deleted' }));

		await fileService.writeFile(resource(caminho), VSBuffer.fromString('agora e arquivo'));
		const arquivo = await recordedEvent(recorder.recordChange(observedChange({ fileUri: caminho })));

		assert.deepStrictEqual({
			arquivo: arquivo.afterHash,
			eventos: (await ledger.readByFile(caminho)).length,
		}, {
			arquivo: await computeContentHash(VSBuffer.fromString('agora e arquivo')),
			eventos: 1,
		});
	});

	test('a pasta removida fecha o arquivo que ela levou', async () => {
		const recorder = createRecorder();
		const pasta = 'pasta';
		const arquivo = 'pasta/regra.ts';
		const conteudo = VSBuffer.fromString('dentro da pasta');

		// A pasta nasce, o arquivo nasce dentro dela e a observação lê os dois.
		await fileService.createFolder(resource(pasta));
		await recorder.recordChange(observedChange({ fileUri: pasta }));
		await fileService.writeFile(resource(arquivo), conteudo);
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: arquivo })));

		// A pasta some com o arquivo dentro: o watcher do core só avisa da pasta, e a
		// remoção chega depois da criação do arquivo.
		await fileService.del(resource(pasta), { recursive: true });
		const remocaoDaPasta = await recorder.recordChange(observedChange({ fileUri: pasta, kind: 'deleted', timestamp: TIMESTAMP + 1 }));

		const eventos = await ledger.readByFile(arquivo);
		const remocao = eventos[eventos.length - 1];

		assert.deepStrictEqual({
			remocaoDaPasta,
			eventos: eventos.length,
			afterHash: remocao.afterHash,
			beforeHash: remocao.beforeHash,
			sessionId: remocao.sessionId,
			timestamp: remocao.timestamp,
			daPasta: (await ledger.readByFile(pasta)).length,
		}, {
			remocaoDaPasta: undefined,
			eventos: 2,
			afterHash: undefined,
			beforeHash: await computeContentHash(conteudo),
			sessionId: 'S-0001',
			timestamp: TIMESTAMP + 1,
			daPasta: 0,
		});
	});

	test('a pasta removida fecha o arquivo que a sessão anterior conheceu', async () => {
		const arquivo = 'pasta/regra.ts';

		// A primeira observação lê o arquivo; a segunda nasce sem memória nenhuma, e
		// o git não sabe do caminho. Quem responde é o ledger.
		await fileService.writeFile(resource(arquivo), VSBuffer.fromString('veio de antes'));
		await recordedEvent(createRecorder().recordChange(observedChange({ fileUri: arquivo })));

		const recorder = createRecorder(undefined, async () => 'unknown');

		await fileService.del(resource('pasta'), { recursive: true });
		const remocaoDaPasta = await recorder.recordChange(observedChange({ fileUri: 'pasta', kind: 'deleted', timestamp: TIMESTAMP + 1 }));

		const eventos = await ledger.readByFile(arquivo);

		assert.deepStrictEqual({
			remocaoDaPasta,
			eventos: eventos.length,
			afterHash: eventos[eventos.length - 1]?.afterHash,
			daPasta: (await ledger.readByFile('pasta')).length,
		}, {
			remocaoDaPasta: undefined,
			eventos: 2,
			afterHash: undefined,
			daPasta: 0,
		});
	});

	test('o arquivo que já tinha sido removido não é fechado de novo', async () => {
		const recorder = createRecorder();
		const arquivo = 'pasta/regra.ts';

		await fileService.writeFile(resource(arquivo), VSBuffer.fromString('dentro'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: arquivo })));

		// A remoção do próprio arquivo chega antes da remoção da pasta: o arquivo já
		// saiu, e fechá-lo outra vez seria um evento a mais para a mesma coisa.
		await fileService.del(resource(arquivo));
		await recorder.recordChange(observedChange({ fileUri: arquivo, kind: 'deleted' }));

		await fileService.del(resource('pasta'), { recursive: true });
		await recorder.recordChange(observedChange({ fileUri: 'pasta', kind: 'deleted' }));

		assert.strictEqual((await ledger.readByFile(arquivo)).length, 2);
	});

	test('o vizinho com o mesmo prefixo não é tocado', async () => {
		const recorder = createRecorder();
		const vizinho = 'pasta2/regra.ts';

		await fileService.writeFile(resource('pasta/regra.ts'), VSBuffer.fromString('dentro'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: 'pasta/regra.ts' })));
		await fileService.writeFile(resource(vizinho), VSBuffer.fromString('vizinho'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: vizinho })));

		await fileService.del(resource('pasta'), { recursive: true });
		await recorder.recordChange(observedChange({ fileUri: 'pasta', kind: 'deleted' }));

		assert.deepStrictEqual({
			doVizinho: (await ledger.readByFile(vizinho)).map(event => event.afterHash !== undefined),
			daPasta: (await ledger.readByFile('pasta')).length,
		}, {
			doVizinho: [true],
			daPasta: 0,
		});
	});

	test('o arquivo que a observação nunca viu sob a pasta não vira evento', async () => {
		const remocao = await createRecorder(undefined, async () => 'directory')
			.recordChange(observedChange({ fileUri: 'pasta-antiga', kind: 'deleted' }));

		assert.deepStrictEqual({
			remocao,
			eventos: (await ledger.readAll()).length,
		}, {
			remocao: undefined,
			eventos: 0,
		});
	});

	test('o arquivo sob a subpasta também é fechado', async () => {
		const recorder = createRecorder();
		const aninhado = 'pasta/sub/antigo.ts';

		await fileService.writeFile(resource(aninhado), VSBuffer.fromString('no fundo'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: aninhado })));

		await fileService.del(resource('pasta'), { recursive: true });
		await recorder.recordChange(observedChange({ fileUri: 'pasta', kind: 'deleted', timestamp: TIMESTAMP + 1 }));

		const eventos = await ledger.readByFile(aninhado);

		assert.deepStrictEqual({
			eventos: eventos.length,
			afterHash: eventos[eventos.length - 1]?.afterHash,
			daPasta: (await ledger.readByFile('pasta')).length,
		}, {
			eventos: 2,
			afterHash: undefined,
			daPasta: 0,
		});
	});

	test('a prova direta vence o filho antigo do ledger', async () => {
		const recorder = createRecorder(undefined, async () => 'unknown');
		const caminho = 'alvo';
		const filho = 'alvo/antigo.ts';

		// O caminho já foi pasta, e o ledger ainda guarda o filho que existia lá.
		await fileService.writeFile(resource(filho), VSBuffer.fromString('de dentro'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: filho })));

		// Agora o caminho é um arquivo, lido nesta observação: é a prova direta, e ela
		// não pode ser engolida pelo registro antigo do filho.
		await fileService.del(resource(caminho), { recursive: true });
		await fileService.writeFile(resource(caminho), VSBuffer.fromString('agora e arquivo'));
		await recordedEvent(recorder.recordChange(observedChange({ fileUri: caminho })));

		await fileService.del(resource(caminho));
		const remocao = await recordedEvent(recorder.recordChange(observedChange({ fileUri: caminho, kind: 'deleted' })));

		assert.deepStrictEqual({
			fileUri: remocao.fileUri,
			afterHash: remocao.afterHash,
			doFilho: (await ledger.readByFile(filho)).length,
		}, {
			fileUri: caminho,
			afterHash: undefined,
			doFilho: 1,
		});
	});

	test('arquivo ilegível não vira evento', async () => {
		const recorder = createRecorder();

		await assert.rejects(() => recorder.recordChange(observedChange()));
		assert.deepStrictEqual(await ledger.readByFile(FILE_URI), []);
	});

	test('duas alterações do mesmo arquivo rebaixam a primeira para histórico', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('primeiro'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('segundo'));
		await recorder.recordChange(observedChange());

		const stored = await ledger.readByFile(FILE_URI);

		assert.deepStrictEqual({
			total: stored.length,
			firstStatus: stored.find(e => e.id === first.id)?.status,
			currentCount: stored.filter(e => e.status === 'current').length,
		}, {
			total: 2,
			firstStatus: 'history',
			currentCount: 1,
		});
	});

	test('a entrega repetida da mesma escrita não vira um segundo evento', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));
		// A raiz do workspace é observada por mais de um pedido: a mesma escrita
		// chega uma segunda vez, e essa repetição não é uma alteração nova.
		const repeated = await recordedEvent(recorder.recordChange(observedChange()));

		assert.deepStrictEqual({
			total: (await ledger.readByFile(FILE_URI)).length,
			repeatedIsTheSameEvent: repeated.id === first.id,
		}, {
			total: 1,
			repeatedIsTheSameEvent: true,
		});
	});

	test('duas entregas simultâneas da mesma escrita não viram dois eventos', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('depois'));

		// As duas entregas chegam quase juntas: nenhuma delas pode gravar antes de a
		// outra olhar o que já foi registrado.
		const [first, second] = await Promise.all([
			recordedEvent(recorder.recordChange(observedChange())),
			recordedEvent(recorder.recordChange(observedChange())),
		]);

		assert.deepStrictEqual({
			total: (await ledger.readByFile(FILE_URI)).length,
			sameEvent: first.id === second.id,
		}, {
			total: 1,
			sameEvent: true,
		});
	});

	test('a remoção repetida não vira um segundo evento', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await recorder.recordChange(observedChange());

		await fileService.del(resource(FILE_URI));
		await recorder.recordChange(observedChange({ kind: 'deleted' }));
		await recorder.recordChange(observedChange({ kind: 'deleted' }));

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 2);
	});

	test('cada alteração recebe um id próprio', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('um'));
		const first = await recordedEvent(recorder.recordChange(observedChange()));

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('dois'));
		const second = await recordedEvent(recorder.recordChange(observedChange()));

		assert.notStrictEqual(first.id, second.id);
	});

	test('a remoção é gravada sem "depois", usando a última sombra como "antes"', async () => {
		const recorder = createRecorder();

		await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString('antes'));
		await recorder.recordChange(observedChange());

		await fileService.del(resource(FILE_URI));
		const removal = await recordedEvent(recorder.recordChange(observedChange({ kind: 'deleted' })));

		assert.deepStrictEqual({
			afterHash: removal.afterHash,
			beforeHash: removal.beforeHash,
		}, {
			afterHash: undefined,
			beforeHash: await computeContentHash(VSBuffer.fromString('antes')),
		});
	});

	test('a remoção de um arquivo que nunca existiu não rejeita', async () => {
		const removal = await recordedEvent(createRecorder().recordChange(observedChange({ kind: 'deleted' })));

		assert.deepStrictEqual({
			afterHash: removal.afterHash,
			beforeHash: removal.beforeHash,
		}, {
			afterHash: undefined,
			beforeHash: undefined,
		});
	});

	test('conteúdo que volta a ser o de antes vira evento', async () => {
		const recorder = createRecorder();

		for (const content of ['a', 'b', 'a']) {
			await fileService.writeFile(resource(FILE_URI), VSBuffer.fromString(content));
			await recorder.recordChange(observedChange());
		}

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 3);
	});

	test('o mesmo caminho em pastas diferentes não é confundido', async () => {
		const secondFolder = URI.from({ scheme: Schemas.inMemory, path: '/outra' });
		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }, { uri: secondFolder }] }),
		} as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);

		for (const folder of [WORKSPACE_FOLDER, secondFolder]) {
			await fileService.writeFile(URI.joinPath(folder, FILE_URI), VSBuffer.fromString('igual'));
			await recorder.recordChange(observedChange({ folderUri: folder }));
		}

		assert.strictEqual((await ledger.readByFile(FILE_URI)).length, 2);
	});

	test('a pasta recebida define onde o caminho relativo é resolvido', async () => {
		const secondFolder = URI.from({ scheme: Schemas.inMemory, path: '/outra' });
		await fileService.writeFile(URI.joinPath(secondFolder, FILE_URI), VSBuffer.fromString('na segunda pasta'));

		const environmentService = { workspaceStorageHome: URI.from({ scheme: Schemas.inMemory, path: '/storage' }) } as unknown as IEnvironmentService;
		const workspaceContextService = {
			getWorkspace: () => ({ id: 'workspace-1', folders: [{ uri: WORKSPACE_FOLDER }, { uri: secondFolder }] }),
		} as unknown as IWorkspaceContextService;
		const recorder = new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService);

		const event = await recordedEvent(recorder.recordChange(observedChange({ folderUri: secondFolder })));

		assert.strictEqual(event.afterHash, await computeContentHash(VSBuffer.fromString('na segunda pasta')));
	});
});