/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file -- comentarios em portugues usam acentuacao.

import { ChangeLedgerService, IChangeLedgerService } from '../../../../platform/changeLedger/common/changeLedgerService.js';
import { ChangeRecorderService, IChangeRecorderService } from '../../../../platform/changeLedger/common/changeRecorderService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { GitHeadReader } from './gitHeadReader.js';

// O ledger é passivo: grava e lê. O recorder é quem resolve o "antes" e registra
// a alteração que o watcher (E1-T4) vai detectar.
registerSingleton(IChangeLedgerService, ChangeLedgerService, InstantiationType.Delayed);

// A leitura do "antes" no git depende de um passo de descoberta da raiz do
// repositório, que não é um serviço: por isso o recorder é montado por fábrica.
registerSingleton(IChangeRecorderService, new SyncDescriptor(
	ChangeRecorderService,
	[(accessor: ServicesAccessor) => accessor.get(IInstantiationService).createInstance(GitHeadReader).read],
	false
));
