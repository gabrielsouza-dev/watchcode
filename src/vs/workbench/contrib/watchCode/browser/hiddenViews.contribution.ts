/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainer } from '../../../common/views.js';
import { HIDDEN_VIEW_CONTAINER_IDS, PRODUCT_SETTING_DEFAULTS } from '../common/hiddenViews.js';

/**
 * Remove da interface as views nativas que nao fazem parte do produto.
 *
 * A remocao e declarativa e tolerante: um id que nao resolve e ignorado em
 * silencio. Containers registrados depois desta contribuicao sao removidos
 * assim que aparecem, porque workbench.desktop.main.ts e workbench.web.main.ts
 * sao avaliados depois de workbench.common.main.ts.
 */
class HiddenViewsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.watchCode.hiddenViews';

	constructor() {
		super();

		Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.registerDefaultConfigurations([{ overrides: { ...PRODUCT_SETTING_DEFAULTS } }]);

		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

		// Ids que ainda nao apareceram ficam pendentes ate o registro acontecer
		const pending = new Set<string>(HIDDEN_VIEW_CONTAINER_IDS);

		// Containers ja removidos: as views deles podem chegar depois, porque
		// registerViewContainer dispara onDidRegister antes do registerViews
		const removidos = new Set<ViewContainer>();

		const esconder = (container: ViewContainer): void => {
			removidos.add(container);

			const views = viewsRegistry.getViews(container);
			if (views.length > 0) {
				viewsRegistry.deregisterViews(views, container);
			}
			viewContainersRegistry.deregisterViewContainer(container);
		};

		for (const id of [...pending]) {
			const container = viewContainersRegistry.get(id);
			if (container) {
				pending.delete(id);
				esconder(container);
			}
		}

		if (pending.size > 0) {
			this._register(viewContainersRegistry.onDidRegister(({ viewContainer }) => {
				if (pending.delete(viewContainer.id)) {
					esconder(viewContainer);
				}
			}));
		}

		// Fecha o caso em que as views chegam depois do container
		this._register(viewsRegistry.onViewsRegistered(evento => {
			for (const { views, viewContainer } of evento) {
				if (removidos.has(viewContainer)) {
					viewsRegistry.deregisterViews(views, viewContainer);
				}
			}
		}));
	}
}

registerWorkbenchContribution2(HiddenViewsContribution.ID, HiddenViewsContribution, WorkbenchPhase.BlockRestore);
