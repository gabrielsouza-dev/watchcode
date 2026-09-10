/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { VSBuffer } from '../../../base/common/buffer.js';
import { computeContentHash } from './snapshotHash.js';
import { IShadowStore } from './shadowStore.js';

/**
 * De onde veio o "antes" de uma alteração.
 *
 * A ordem importa: o git é a fonte mais confiável, a sombra cobre o que o git
 * não tem, e a ausência é honesta sobre não haver "antes" nenhum.
 */
export type BaselineOrigin = 'git' | 'shadow' | 'none';

/** Estado anterior de um arquivo, quando conhecido. */
export interface IBaseline {
	/** Conteúdo anterior; ausente quando a origem é 'none'. */
	readonly content?: VSBuffer;
	/** Hash do conteúdo anterior; ausente quando a origem é 'none'. */
	readonly contentHash?: string;
	readonly origin: BaselineOrigin;
}

/** Baseline ausente: quem recebe marca o evento como parcial. */
export const EMPTY_BASELINE: IBaseline = { origin: 'none' };

/** Lê o conteúdo de um arquivo no `HEAD` do repositório; pode rejeitar. */
export type ReadFromHead = (fileUri: string) => Promise<VSBuffer | undefined>;

/** Resolve o estado anterior de um arquivo do workspace. */
export interface IBaselineProvider {
	/** Nunca rejeita: sem "antes" a resposta é `EMPTY_BASELINE`. */
	resolve(fileUri: string): Promise<IBaseline>;
}

/** Busca o "antes" no git e, quando ele não responde, na sombra. */
export class BaselineProvider implements IBaselineProvider {

	constructor(
		private readonly readFromHead: ReadFromHead,
		private readonly shadowStore: IShadowStore
	) { }

	async resolve(fileUri: string): Promise<IBaseline> {
		const fromGit = await this.readFromGit(fileUri);

		if (fromGit) {
			return this.asBaseline(fromGit, 'git');
		}

		const fromShadow = await this.shadowStore.read(fileUri);

		if (fromShadow) {
			return this.asBaseline(fromShadow, 'shadow');
		}

		return EMPTY_BASELINE;
	}

	/**
	 * O git é uma conveniência, não um pré-requisito: sem repositório, sem
	 * binário ou diante de um erro qualquer, a captura por disco continua.
	 */
	private async readFromGit(fileUri: string): Promise<VSBuffer | undefined> {
		try {
			return await this.readFromHead(fileUri);
		} catch {
			return undefined;
		}
	}

	private async asBaseline(content: VSBuffer, origin: BaselineOrigin): Promise<IBaseline> {
		return { content, contentHash: await computeContentHash(content), origin };
	}
}
