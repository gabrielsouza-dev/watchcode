/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ILocalGitService = createDecorator<ILocalGitService>('localGitService');

export interface IGitPullOptions {
	readonly allowHardResetOnDivergence?: boolean;
}

/**
 * Low-level service for executing git commands on the local machine.
 * Used in the shared process where Node.js APIs are available.
 * All path arguments are native file-system paths.
 */
export interface ILocalGitService {
	readonly _serviceBrand: undefined;

	clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string): Promise<void>;
	pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean>;
	checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void>;
	checkoutCommit(operationId: string, repoPath: string, commit: string): Promise<void>;
	revParse(repoPath: string, ref: string): Promise<string>;
	/**
	 * Conteúdo de um arquivo no `HEAD`, ou `undefined` quando não há versão
	 * anterior: arquivo novo, repositório sem commits ou caminho fora do repositório.
	 *
	 * `repoPath` é um caminho nativo; `filePath` é relativo à raiz, com `/`.
	 */
	show(repoPath: string, filePath: string): Promise<string | undefined>;
	/**
	 * Raiz do repositório que contém um caminho, ou `undefined` quando ele não
	 * está dentro de repositório nenhum.
	 *
	 * `path` é um caminho nativo, dentro ou abaixo da raiz procurada.
	 */
	findRepositoryRoot(path: string): Promise<string | undefined>;
	fetch(operationId: string, repoPath: string): Promise<void>;
	revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number>;
	cancel(operationId: string): Promise<void>;
}
