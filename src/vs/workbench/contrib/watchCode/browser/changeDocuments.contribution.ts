/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CHANGE_DOCUMENT_SCHEMES } from '../../../../platform/changeLedger/common/changeDocument.js';
import { ChangeDocumentProvider } from '../../../../platform/changeLedger/common/changeDocumentProvider.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

/** Id da contribuicao que registra os documentos virtuais do produto. */
export const CHANGE_DOCUMENTS_ID = 'workbench.contrib.watchCode.changeDocuments';

/**
 * Os documentos virtuais do produto no servico de arquivos.
 *
 * O registro e um so, nos dois esquemas, e acontece na fase mais cedo: o documento
 * pode ser pedido na abertura da janela, e esquema sem provedor naquele instante nao
 * abre. Nada aqui le disco — quem le e o provedor, no momento em que o documento e
 * aberto.
 */
class ChangeDocumentsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = CHANGE_DOCUMENTS_ID;

	constructor(
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		const provider = this._register(instantiationService.createInstance(ChangeDocumentProvider));

		for (const scheme of CHANGE_DOCUMENT_SCHEMES) {
			this._register(fileService.registerProvider(scheme, provider));
		}
	}
}

registerWorkbenchContribution2(ChangeDocumentsContribution.ID, ChangeDocumentsContribution, WorkbenchPhase.BlockStartup);
