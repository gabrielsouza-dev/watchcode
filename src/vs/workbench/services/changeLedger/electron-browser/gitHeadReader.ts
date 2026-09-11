/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { WorkspaceHeadReader, WorkspacePathKind, WorkspacePathKindReader } from '../../../../platform/changeLedger/common/changeRecorderService.js';

/**
 * Liga o baseline ao git de verdade.
 *
 * A raiz do repositório é descoberta uma única vez e reaproveitada, para não
 * pagar uma consulta ao git a cada alteração observada.
 */
export class GitHeadReader {

	private rootPath: string | undefined;
	private resolving: Promise<string | undefined> | undefined;

	constructor(
		@ILocalGitService private readonly localGitService: ILocalGitService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService
	) { }

	/** Leitor pronto para ser injetado no recorder. */
	readonly read: WorkspaceHeadReader = async fileUri => this.readFromHead(fileUri);

	/** Leitor do tipo do caminho pronto para ser injetado no recorder. */
	readonly readKind: WorkspacePathKindReader = async fileUri => this.readKindFromHead(fileUri);

	private async readFromHead(fileUri: string): Promise<VSBuffer | undefined> {
		const rootPath = await this.resolveRootPath();

		if (!rootPath) {
			return undefined;
		}

		const filePath = fileUri.replace(/\\/g, '/');
		const content = await this.localGitService.show(rootPath, filePath);

		return content === undefined ? undefined : VSBuffer.fromString(content);
	}

	/**
	 * O tipo do caminho no `HEAD`.
	 *
	 * É o que responde quando a pasta já não está no disco: a árvore é pasta, o blob
	 * é arquivo, e o resto é caminho que o git não conhece.
	 */
	private async readKindFromHead(fileUri: string): Promise<WorkspacePathKind> {
		const rootPath = await this.resolveRootPath();

		if (!rootPath) {
			return 'unknown';
		}

		const type = await this.localGitService.catFileType(rootPath, fileUri.replace(/\\/g, '/'));

		if (type === 'tree') {
			return 'directory';
		}

		return type === 'blob' ? 'file' : 'unknown';
	}

	/** Raiz do repositório que contém o workspace, descoberta uma única vez. */
	private async resolveRootPath(): Promise<string | undefined> {
		if (this.rootPath) {
			return this.rootPath;
		}

		this.resolving ??= this.findRootPath();

		try {
			this.rootPath = await this.resolving;
		} finally {
			this.resolving = undefined;
		}

		return this.rootPath;
	}

	private async findRootPath(): Promise<string | undefined> {
		const folder = this.workspaceContextService.getWorkspace().folders[0];

		if (!folder) {
			return undefined;
		}

		try {
			return await this.localGitService.findRepositoryRoot(folder.uri.fsPath);
		} catch (error) {
			// Sem repositório o produto continua: a captura por disco não depende do git.
			this.logService.trace('[GitHeadReader] No git repository for the workspace folder.', error);

			return undefined;
		}
	}
}
