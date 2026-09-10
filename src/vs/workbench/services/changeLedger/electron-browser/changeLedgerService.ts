/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChangeLedgerService, IChangeLedgerService } from '../../../../platform/changeLedger/common/changeLedgerService.js';
import { ChangeRecorderService, IChangeRecorderService } from '../../../../platform/changeLedger/common/changeRecorderService.js';
import { IWorkspaceWatcherService, WorkspaceWatcherService } from '../../../../platform/changeLedger/common/workspaceWatcherService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { GitHeadReader } from './gitHeadReader.js';

// O ledger é passivo: grava e lê.
registerSingleton(IChangeLedgerService, ChangeLedgerService, InstantiationType.Delayed);

// O watcher observa as pastas do workspace e entrega cada alteração ao recorder.
registerSingleton(IWorkspaceWatcherService, WorkspaceWatcherService, InstantiationType.Delayed);

/**
 * Recorder da observação com a leitura do "antes" ligada ao git.
 *
 * O recorder da plataforma recebe o leitor do `HEAD` como função, e não como
 * serviço; quem resolve os serviços de que o leitor precisa é este adaptador.
 * A resolução não pode morar no argumento estático do `SyncDescriptor`: o
 * serviço de injeção repassa esses argumentos sem executar fábrica nenhuma, e o
 * leitor chegaria sem os serviços — o "antes" cairia para a sombra em silêncio.
 */
class WorkbenchChangeRecorderService extends ChangeRecorderService {

	constructor(
		@IChangeLedgerService ledger: IChangeLedgerService,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILocalGitService localGitService: ILocalGitService,
		@ILogService logService: ILogService
	) {
		super(ledger, fileService, workspaceContextService, environmentService, new GitHeadReader(localGitService, workspaceContextService, logService).read);
	}
}

registerSingleton(IChangeRecorderService, new SyncDescriptor(WorkbenchChangeRecorderService));

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
