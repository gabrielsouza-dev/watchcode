/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { FilePermission, FileSystemProviderCapabilities, hasFileReadStreamCapability, hasReadWriteCapability, hasReadonlyCapability, IFileSystemProvider, IFileWriteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IWorkspaceContextService } from '../../../workspace/common/workspace.js';
import { ChangeDocumentSide, CHANGE_DOCUMENT_SCHEMES, changeDocumentResource } from '../../common/changeDocument.js';
import { ChangeDocumentProvider } from '../../common/changeDocumentProvider.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../common/changeLedgerService.js';

/** Armazenamento em memória, isolado por teste — nada toca o disco real. */
const storageRoot = URI.from({ scheme: Schemas.inMemory, path: '/storage' });

function environmentService(): IEnvironmentService {
	return { workspaceStorageHome: storageRoot } as unknown as IEnvironmentService;
}

function workspaceContextService(workspaceId: string): IWorkspaceContextService {
	return { getWorkspace: () => ({ id: workspaceId, folders: [] }) } as unknown as IWorkspaceContextService;
}

/** Arquivo do workspace que os documentos representam. */
const ARQUIVO = URI.file('/workspace/src/regra.ts');

suite('watchCode changeDocumentProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let ledger: IChangeLedgerService;
	let provider: ChangeDocumentProvider;

	/** Cada teste tem o próprio workspace, e portanto o próprio store de snapshots. */
	let workspaces = 0;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		ledger = disposables.add(new ChangeLedgerService(fileService, environmentService(), workspaceContextService('workspace-' + ++workspaces)));

		provider = disposables.add(new ChangeDocumentProvider(ledger));

		for (const scheme of CHANGE_DOCUMENT_SCHEMES) {
			disposables.add(fileService.registerProvider(scheme, provider));
		}
	});

	/** Guarda o conteúdo no store e devolve o hash — o que o gravador faz ao observar. */
	async function guardar(conteudo: string): Promise<string> {
		return ledger.recordSnapshot(VSBuffer.fromString(conteudo));
	}

	/** Documento de um lado, apontando para um hash. */
	function documento(side: ChangeDocumentSide, hash: string): URI {
		return changeDocumentResource(side, ARQUIVO, hash);
	}

	/** O provedor visto como o serviço de arquivos o vê. */
	function comoProvedor(): IFileSystemProvider {
		return provider;
	}

	/** Diz se a ação falhou. */
	async function recusa(acao: () => Promise<unknown>): Promise<boolean> {
		try {
			await acao();

			return false;
		} catch {
			return true;
		}
	}

	/** Código do erro de um provedor, ou 'nenhum' quando nada falhou. */
	async function codigoDe(acao: () => Promise<unknown>): Promise<string> {
		try {
			await acao();

			return 'nenhum';
		} catch (error) {
			const codigo = (error as { code?: unknown }).code;

			return typeof codigo === 'string' ? codigo : 'sem codigo';
		}
	}

	test('ler o documento do antes devolve o conteúdo guardado', async () => {
		const hash = await guardar('const a = 1;\nconst b = 2;\n');

		assert.deepStrictEqual(
			(await fileService.readFile(documento('before', hash))).value.toString(),
			'const a = 1;\nconst b = 2;\n');
	});

	test('ler o documento do depois devolve o conteúdo guardado', async () => {
		const hash = await guardar('const a = 3;\n');

		assert.deepStrictEqual(
			(await fileService.readFile(documento('after', hash))).value.toString(),
			'const a = 3;\n');
	});

	test('o mesmo hash nos dois esquemas devolve o mesmo conteúdo', async () => {
		const hash = await guardar('mesmo conteúdo\n');

		assert.deepStrictEqual(
			[
				(await fileService.readFile(documento('before', hash))).value.toString(),
				(await fileService.readFile(documento('after', hash))).value.toString()
			],
			['mesmo conteúdo\n', 'mesmo conteúdo\n']);
	});

	test('o conteúdo volta cru, com fim de linha do Windows e quebra final', async () => {
		const conteudo = 'linha um\r\nlinha dois\r\n\r\n';
		const hash = await guardar(conteudo);
		const lido = await fileService.readFile(documento('after', hash));

		assert.deepStrictEqual(
			{ texto: lido.value.toString(), bytes: lido.value.byteLength },
			{ texto: conteudo, bytes: VSBuffer.fromString(conteudo).byteLength });
	});

	test('snapshot vazio abre com conteúdo vazio', async () => {
		const hash = await guardar('');
		const lido = await fileService.readFile(documento('before', hash));

		assert.deepStrictEqual({ texto: lido.value.toString(), bytes: lido.value.byteLength }, { texto: '', bytes: 0 });
	});

	test('o stat do documento é de arquivo, com o tamanho real e somente leitura', async () => {
		const conteudo = 'const a = 1;\n';
		const hash = await guardar(conteudo);
		const stat = await fileService.resolve(documento('before', hash), { resolveMetadata: true });

		assert.deepStrictEqual(
			{ arquivo: stat.isFile, pasta: stat.isDirectory, tamanho: stat.size, soLeitura: stat.readonly },
			{ arquivo: true, pasta: false, tamanho: VSBuffer.fromString(conteudo).byteLength, soLeitura: true });
	});

	test('hash bem formado fora do store falha como arquivo inexistente', async () => {
		const ausente = documento('before', 'c'.repeat(40));

		assert.deepStrictEqual(
			{ provedor: await codigoDe(() => provider.stat(ausente)), servico: await recusa(() => fileService.readFile(ausente)) },
			{ provedor: 'EntryNotFound', servico: true });
	});

	test('hash malformado falha como arquivo inexistente', async () => {
		const malformado = URI.from({ scheme: 'aih-before', path: ARQUIVO.path, query: 'hash=abc' });

		assert.deepStrictEqual(
			{ provedor: await codigoDe(() => provider.stat(malformado)), servico: await recusa(() => fileService.readFile(malformado)) },
			{ provedor: 'EntryNotFound', servico: true });
	});

	test('recurso sem consulta falha como arquivo inexistente', async () => {
		const semConsulta = URI.from({ scheme: 'aih-after', path: ARQUIVO.path });

		assert.deepStrictEqual(
			{ provedor: await codigoDe(() => provider.stat(semConsulta)), servico: await recusa(() => fileService.readFile(semConsulta)) },
			{ provedor: 'EntryNotFound', servico: true });
	});

	test('o provedor se declara somente leitura e sem capacidade de escrita', async () => {
		assert.deepStrictEqual(
			{
				soLeitura: hasReadonlyCapability(provider),
				leitura: hasFileReadStreamCapability(provider),
				escrita: hasReadWriteCapability(provider),
				abreEFecha: !!(provider.capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose),
				soAsTresCapacidades: provider.capabilities === (FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadStream)
			},
			{ soLeitura: true, leitura: true, escrita: false, abreEFecha: false, soAsTresCapacidades: true });
	});

	test('gravar no documento é recusado, e o conteúdo continua o mesmo', async () => {
		const conteudo = 'const a = 1;\n';
		const hash = await guardar(conteudo);
		const alvo = documento('after', hash);

		assert.deepStrictEqual(
			{
				servico: await recusa(() => fileService.writeFile(alvo, VSBuffer.fromString('outro'))),
				provedor: await codigoDe(() => comoProvedor().writeFile(alvo, VSBuffer.fromString('outro').buffer, {} as IFileWriteOptions)),
				conteudo: (await fileService.readFile(alvo)).value.toString()
			},
			{ servico: true, provedor: 'NoPermissions', conteudo });
	});

	test('o esquema não tem pasta e não observa mudança', async () => {
		const hash = await guardar('const a = 1;\n');
		const alvo = documento('before', hash);

		assert.deepStrictEqual(
			{
				entradas: await comoProvedor().readdir(URI.from({ scheme: 'aih-before', path: '/' })),
				observa: comoProvedor().watch(alvo, { recursive: false, excludes: [] }) === Disposable.None
			},
			{ entradas: [], observa: true });
	});

	test('a mensagem de somente leitura diz que é um snapshot do produto', async () => {
		assert.deepStrictEqual(
			{ temMensagem: (provider.readOnlyMessage.value.length > 0), permissao: (await provider.stat(documento('before', await guardar('a\n')))).permissions },
			{ temMensagem: true, permissao: FilePermission.Readonly });
	});
});
