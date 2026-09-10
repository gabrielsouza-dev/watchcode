/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../../../platform/changeLedger/common/changeLedgerService.js';
import { ChangeRecorderService, IChangeRecorderService } from '../../../../platform/changeLedger/common/changeRecorderService.js';
import { IWorkspaceWatcherService, WorkspaceWatcherService } from '../../../../platform/changeLedger/common/workspaceWatcherService.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { GitHeadReader } from './gitHeadReader.js';

// O ledger é passivo: grava e lê.
registerSingleton(IChangeLedgerService, ChangeLedgerService, InstantiationType.Delayed);

// O watcher observa as pastas do workspace e entrega cada alteração ao recorder.
registerSingleton(IWorkspaceWatcherService, WorkspaceWatcherService, InstantiationType.Delayed);

// A leitura do "antes" no git depende de um passo de descoberta da raiz do
// repositório, que não é um serviço: por isso o recorder é montado por fábrica.
registerSingleton(IChangeRecorderService, new SyncDescriptor(
	ChangeRecorderService,
	[(accessor: ServicesAccessor) => accessor.get(IInstantiationService).createInstance(GitHeadReader).read],
	false
));

/**
 * Liga a observação do workspace assim que a interface sobe.
 *
 * A observação nasce ligada; desligá-la pela interface é assunto da E1-T5.
 */
class WorkspaceWatcherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.watchCode.workspaceWatcher';

	constructor(@IWorkspaceWatcherService workspaceWatcherService: IWorkspaceWatcherService) {
		super();

		workspaceWatcherService.start();
	}
}

registerWorkbenchContribution2(WorkspaceWatcherContribution.ID, WorkspaceWatcherContribution, WorkbenchPhase.AfterRestored);
