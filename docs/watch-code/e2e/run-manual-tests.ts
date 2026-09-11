/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Executa, no aplicativo de verdade, os testes manuais de docs/watch-code/testes-manuais.md.
//
// Uso: node --experimental-strip-types run-manual-tests.ts [T-0001 T-0002 ...]
//
// O que era feito à mão passa a ser repetível: o Playwright comanda a interface
// (barra de status e Paleta de Comandos) e as escritas continuam vindo de fora do app,
// como faria um agente. Cada teste abre o app no seu próprio perfil isolado e julga
// o resultado lido do disco — o ledger é a mesma fonte de verdade da leitura manual.

import { execFileSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import {
	APP_SETTLE_MS,
	APP_START_TIMEOUT_MS,
	LedgerReader,
	REPO_ROOT,
	WARM_UP_FILE,
	appOutputTail,
	assertFreshBuild,
	createScratch,
	delay,
	findWorkspaceStorageDir,
	freePort,
	git,
	killApp,
	killLeftovers,
	launchApp,
	ledgerRootOf,
	logTail,
	scratchPaths,
	sha1,
	writeWorkspaceFile,
	type IAppPaths,
	type ILedgerEvent
} from './harness.ts';

import { tmpdir } from 'node:os';

/** Onde vive tudo o que estes testes criam. Apagado a cada execução. */
const DEFAULT_ROOT = join(tmpdir(), 'watchcode-manual');

/** Pausa entre duas escritas que devem abrir sessões diferentes (o agrupador fecha em 1500 ms). */
const BETWEEN_SESSIONS_MS = 3000;

/** Tempo de espera por um evento novo no ledger. */
const EVENT_TIMEOUT_MS = 30000;

/** Conteúdo do arquivo de T-0001 antes da alteração, e depois dela. */
const HEAD_CONTENT = 'linha original\n';
const CHANGED_CONTENT = 'linha alterada\n';

/** Conteúdo das escritas de T-0002 e T-0003. */
const FIRST_VERSION = 'versao um\n';
const SECOND_VERSION = 'versao dois\n';
const THIRD_VERSION = 'versao tres\n';

/** Conteúdo das escritas de T-0004. */
const INITIAL_VERSION = 'versao inicial\n';
const OFF_WRITE = 'mudanca com observacao desligada\n';
const ON_WRITE = 'mudanca com observacao ligada\n';

/** Arquivo que os testes observam. */
const NOTE_FILE = 'note.txt';

/** Textos esperados do indicador e do tooltip, copiados da contribuição. */
const ACTIVE_TOOLTIP = 'Watch Code is observing the workspace. Click to turn observation off.';
const INACTIVE_TOOLTIP = 'Watch Code is not observing the workspace. Click to turn observation on.';

/** Seletores do item da barra de status, do mais específico para o mais tolerante. */
const STATUS_ITEM_SELECTORS = [
	'[id="watchCode.observation"]',
	'[id="status.watchCode.observation"]',
	'.statusbar-item[aria-label^="Watch Code"]',
	'[aria-label^="Watch Code: observation"]'
];

/** Conferências de um teste, sem interromper as seguintes quando uma falha. */
class Assertions {

	private readonly failures: string[] = [];

	/** Registra o resultado de uma conferência. */
	check(label: string, ok: boolean, detail = ''): void {
		console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`);

		if (!ok) {
			this.failures.push(label);
		}
	}

	/** Quantas conferências falharam. */
	get failuresCount(): number {
		return this.failures.length;
	}
}

/** App aberto, pasta observada e o ledger dele. */
interface ISession {
	readonly page: Page;
	readonly paths: IAppPaths;
	readonly ledger: LedgerReader;
	readonly outputLog: string;
}

/** O que `openSession` devolve, para o fechamento acontecer em qualquer caminho. */
interface IOpenedSession {
	readonly child: ChildProcess;
	readonly browser: Browser;
	readonly session: ISession;
}

/** Um teste manual transcrito para o arnês. */
interface IManualTest {
	readonly id: string;
	readonly title: string;
	/** Monta o estado inicial da pasta observada, antes de o app abrir. */
	readonly prepare?: (workspace: string) => void;
	/**
	 * Corre antes da sonda de aquecimento, ainda com o ledger vazio.
	 *
	 * A sonda sempre escreve, então um teste que precise ver a interface sem
	 * nenhuma alteração registrada tem de olhar antes dela.
	 */
	readonly beforeWarmUp?: (session: ISession, t: Assertions) => Promise<void>;
	/** Executa os passos e as conferências do teste. */
	readonly run: (session: ISession, t: Assertions) => Promise<void>;
}


/** Seletor do cabeçalho da view da timeline, dentro do Explorer. */
const TIMELINE_HEADER_SELECTOR = '.pane-header:has-text("Timeline")';

/** Texto do estado vazio, copiado da view. */
const TIMELINE_EMPTY_MESSAGE = 'No changes were observed yet.';

/** Classe do corpo da Timeline nativa: se ela saiu da janela, isto não existe. */
const NATIVE_TIMELINE_BODY_SELECTOR = '.timeline-tree-view';

/** Cabeçalho da view da timeline. */
function timelineHeader(page: Page): Locator {
	return page.locator(TIMELINE_HEADER_SELECTOR);
}

/** Se a view está expandida, pelo que o próprio cabeçalho anuncia. */
async function timelineExpanded(page: Page): Promise<boolean> {
	return await timelineHeader(page).first().getAttribute('aria-expanded') === 'true';
}

/** Expande ou recolhe a view com o gesto do usuário: um clique no cabeçalho. */
async function toggleTimelineView(page: Page): Promise<void> {
	await timelineHeader(page).first().click();
	await delay(600);
}

/** Nomes de arquivo mostrados pela lista, na ordem em que aparecem. */
async function timelineRowNames(page: Page): Promise<readonly string[]> {
	return await page.locator('.watch-code-timeline .watch-code-timeline-row .top .name').allTextContents();
}

/** A segunda faixa de cada linha, na ordem. */
async function timelineRowDetails(page: Page): Promise<readonly string[]> {
	return await page.locator('.watch-code-timeline .watch-code-timeline-row .detail').allTextContents();
}

/** Espera a linha de um arquivo aparecer e devolve a posição dela. */
async function waitForTimelineRow(page: Page, file: string, timeoutMs = EVENT_TIMEOUT_MS): Promise<number> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const names = await timelineRowNames(page);
		const index = names.indexOf(file);

		if (index >= 0) {
			return index;
		}

		await delay(500);
	}

	return -1;
}

/** Espera um texto aparecer dentro de um elemento. */
async function waitForText(locator: Locator, text: string, timeoutMs = 10000): Promise<boolean> {
	try {
		await locator.filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: timeoutMs });

		return true;
	} catch {
		return false;
	}
}

/** Descrição curta de um evento, para a linha de evidência. */
function describe(event: ILedgerEvent): string {
	return `${event.fileUri} sessao=${event.sessionId.slice(0, 8)} antes=${event.beforeHash?.slice(0, 8) ?? 'ausente'} depois=${event.afterHash?.slice(0, 8) ?? 'ausente'} status=${event.status}`;
}

/** Texto de uma linha só, para comparar com o esperado. */
function collapse(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** O ícone do indicador é exatamente este? O nome da classe é comparado por token. */
function hasIcon(icon: string, name: string): boolean {
	return icon.split(/\s+/).includes(name);
}

/** Localiza o item da observação na barra de status, esperando ele aparecer. */
async function findStatusItem(page: Page, timeoutMs = 30000): Promise<Locator> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		for (const selector of STATUS_ITEM_SELECTORS) {
			const locator = page.locator(selector).first();

			if (await locator.count() > 0) {
				console.log(`      indicador encontrado por ${selector}`);

				return locator;
			}
		}

		await delay(500);
	}

	throw new Error('o indicador da observacao nao apareceu na barra de status');
}

/** Estado visível do indicador: texto, ícone e rótulo de acessibilidade. */
interface IIndicator {
	readonly text: string;
	readonly icon: string;
	readonly ariaLabel: string;
}

/** Lê o que a barra de status está mostrando agora. */
async function readIndicator(item: Locator): Promise<IIndicator> {
	return {
		text: (await item.innerText()).trim(),
		icon: (await item.locator('.codicon').first().getAttribute('class')) ?? '',
		ariaLabel: (await item.getAttribute('aria-label')) ?? ''
	};
}

/** Espera o indicador trocar de ícone. */
async function waitForIcon(item: Locator, name: string, timeoutMs = 10000): Promise<boolean> {
	try {
		await item.locator(`.${name}`).first().waitFor({ state: 'attached', timeout: timeoutMs });

		return true;
	} catch {
		return false;
	}
}

/** Passa o mouse pelo item e devolve o tooltip que apareceu, quando apareceu. */
async function showTooltip(page: Page, item: Locator, timeoutMs = 10000): Promise<string | undefined> {
	try {
		await item.hover({ timeout: 3000 });
	} catch {
		// O contexto de edição nativo pode recusar o hover; o mouse vai pelas coordenadas.
		const box = await item.boundingBox();

		if (!box) {
			return undefined;
		}

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	}

	const hover = page.locator('.monaco-hover').filter({ hasText: 'Watch Code is' }).first();

	try {
		await hover.waitFor({ state: 'visible', timeout: timeoutMs });
	} catch {
		return undefined;
	}

	return collapse(await hover.innerText());
}

/**
 * Clica como um usuário clicaria.
 *
 * O contexto de edição nativo cobre a tela com z-index negativo, e o Playwright
 * recusa o clique por causa dele. Nesse caso o clique vai pelas coordenadas do
 * próprio elemento, colhidas até duas leituras seguidas concordarem.
 */
async function clickElement(page: Page, locator: Locator, timeoutMs = 5000): Promise<void> {
	try {
		await locator.click({ timeout: timeoutMs });

		return;
	} catch (error) {
		if (!(error instanceof Error) || !/intercepts pointer events/.test(error.message)) {
			throw error;
		}
	}

	let previous: { x: number; y: number } | undefined;

	for (let attempt = 0; attempt < 40; attempt++) {
		const box = await locator.boundingBox();

		if (!box) {
			throw new Error('elemento sem caixa para clicar');
		}

		const current = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

		if (previous && previous.x === current.x && previous.y === current.y) {
			await page.mouse.click(current.x, current.y);

			return;
		}

		previous = current;
		await delay(100);
	}

	throw new Error('a posicao do elemento nao estabilizou para o clique');
}

/** Abre a Paleta de Comandos com a busca digitada e devolve as linhas mostradas. */
async function openCommandPalette(page: Page, query: string): Promise<Locator> {
	await page.keyboard.press('Control+Shift+P');
	await page.locator('.quick-input-widget').first().waitFor({ state: 'visible', timeout: 15000 });
	await page.keyboard.type(query);

	// A lista refiltra a cada tecla: sem esta pausa a leitura pegaria o resultado anterior.
	await delay(1000);

	return page.locator('.quick-input-list .monaco-list-row');
}

/** Texto das linhas visíveis da lista. */
async function rowLabels(rows: Locator): Promise<readonly string[]> {
	const labels: string[] = [];
	const count = await rows.count();

	for (let index = 0; index < count; index++) {
		const text = collapse(await rows.nth(index).innerText());

		if (text) {
			labels.push(text);
		}
	}

	return labels;
}

/** Escreve por fora do app, como faria um agente — é o estímulo de todos os testes. */
function writeOutside(session: ISession, content: string): void {
	writeWorkspaceFile(session.paths.workspace, NOTE_FILE, content);
}

/** Monta o repositório git de T-0001, com o arquivo já commitado. */
function prepareGitWorkspace(workspace: string): void {
	writeWorkspaceFile(workspace, NOTE_FILE, HEAD_CONTENT);
	// Sem conversão de fim de linha: o que o git devolve no HEAD é o que foi escrito.
	writeWorkspaceFile(workspace, '.gitattributes', '* -text\n');

	execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', workspace], { stdio: 'pipe' });
	git(workspace, ['config', 'user.name', 'Watch Code Teste Manual']);
	git(workspace, ['config', 'user.email', 'manual@watchcode.local']);
	git(workspace, ['config', 'core.autocrlf', 'false']);
	git(workspace, ['add', '-A']);
	git(workspace, ['commit', '--quiet', '-m', 'estado inicial']);
}

/**
 * Espera o ledger parar de crescer.
 *
 * A leitura tem de ser a do estado final, e não a de um instante do meio: logo
 * depois da escrita ainda podem chegar eventos, e quem julga o teste é o que
 * ficou gravado, como faria quem abrisse os arquivos do perfil no fim.
 */
async function waitUntilQuiet(ledger: LedgerReader, quietMs = 1500, timeoutMs = 30000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let previous = -1;
	let lastChange = Date.now();

	while (Date.now() < deadline) {
		const current = ledger.count();

		if (current !== previous) {
			previous = current;
			lastChange = Date.now();
		} else if (Date.now() - lastChange >= quietMs) {
			return;
		}

		await delay(200);
	}
}

/**
 * Espera a observação estar de pé antes de medir qualquer coisa.
 *
 * Escrever cedo demais produz um ledger vazio, e um ledger vazio não diz se a
 * observação estava desligada ou se ainda não existia — a falha mais provável
 * deste arnês é silenciosa. A sonda é um arquivo que nenhum teste mede.
 */
async function warmUpObservation(session: ISession): Promise<void> {
	writeWorkspaceFile(session.paths.workspace, WARM_UP_FILE, `sonda ${Date.now()}\n`);

	const found = await session.ledger.waitForEvents(WARM_UP_FILE, 1, EVENT_TIMEOUT_MS);

	if (found.length === 0) {
		throw new Error(`a observacao nao registrou nem o arquivo de sonda (${WARM_UP_FILE})`);
	}

	console.log(`      observacao de pe: a sonda foi registrada em ${new Date(found[0].timestamp).toISOString()}`);
}

/** Espera o app registrar a pasta observada no perfil. */
async function waitForWorkspaceStorage(paths: IAppPaths, timeoutMs = 30000): Promise<string> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const storage = findWorkspaceStorageDir(paths.userData, paths.workspace);

		if (storage) {
			return storage;
		}

		await delay(500);
	}

	throw new Error('o app nao registrou a pasta do workspace no perfil');
}

/** Conecta ao depurador do app, esperando o app subir. */
async function connectToApp(child: ChildProcess, cdpPort: number): Promise<Browser> {
	const endpoint = `http://127.0.0.1:${cdpPort}`;
	const deadline = Date.now() + APP_START_TIMEOUT_MS;
	let lastError = 'sem tentativa';

	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`o app terminou antes de abrir a janela (codigo ${child.exitCode})`);
		}

		try {
			return await chromium.connectOverCDP(endpoint, { timeout: 10000 });
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			await delay(1000);
		}
	}

	throw new Error(`o depurador do app nao respondeu em ${APP_START_TIMEOUT_MS} ms: ${lastError}`);
}

/** Espera a janela do workbench existir, e devolve a página dela. */
async function waitForWorkbenchPage(browser: Browser, deadline: number): Promise<Page> {
	let lastError = 'nenhuma pagina';

	while (Date.now() < deadline) {
		for (const context of browser.contexts()) {
			for (const page of context.pages()) {
				try {
					if (await page.locator('.monaco-workbench .statusbar').count() > 0) {
						return page;
					}
				} catch (error) {
					lastError = error instanceof Error ? error.message : String(error);
				}
			}
		}

		await delay(500);
	}

	throw new Error(`a janela do app nao ficou pronta: ${lastError}`);
}

/** Abre o app num cenário próprio e deixa a observação pronta para medir. */
async function openSession(test: IManualTest, t: Assertions): Promise<IOpenedSession> {
	const scratch = scratchPaths(DEFAULT_ROOT, test.id.toLowerCase());

	killLeftovers(scratch.userData);
	await delay(1000);
	rmSync(join(DEFAULT_ROOT, test.id.toLowerCase()), { recursive: true, force: true });

	const paths = createScratch(scratch);
	test.prepare?.(paths.workspace);

	const outputLog = join(paths.userData, '..', 'app-output.log');
	const cdpPort = await freePort();
	const started = Date.now();
	const child = launchApp(paths, cdpPort, outputLog);
	const browser = await connectToApp(child, cdpPort);
	const page = await waitForWorkbenchPage(browser, started + APP_START_TIMEOUT_MS);

	console.log(`      janela montada em ${Math.round((Date.now() - started) / 1000)}s`);

	page.setDefaultTimeout(15000);

	const ledger = new LedgerReader(ledgerRootOf(await waitForWorkspaceStorage(paths)));

	console.log(`      ledger: ${ledger.root}`);

	await delay(APP_SETTLE_MS);

	const session: ISession = { page, paths, ledger, outputLog };

	await test.beforeWarmUp?.(session, t);

	await warmUpObservation(session);

	return { child, browser, session };
}

/** Fecha o app e libera o perfil do cenário. */
async function closeSession(opened: IOpenedSession): Promise<void> {
	killApp(opened.child);
	killLeftovers(opened.session.paths.userData);

	try {
		await opened.browser.close();
	} catch {
		// O app já foi fechado por baixo: a conexão morre junto.
	}

	await delay(2000);
}

/** As duas escritas separadas pela pausa de agrupamento, comuns a T-0002 e T-0003. */
async function writeNoteTwice(session: ISession): Promise<readonly ILedgerEvent[]> {
	writeOutside(session, SECOND_VERSION);
	await session.ledger.waitForEvents(NOTE_FILE, 1, EVENT_TIMEOUT_MS);
	await waitUntilQuiet(session.ledger);

	await delay(BETWEEN_SESSIONS_MS);

	writeOutside(session, THIRD_VERSION);
	await session.ledger.waitForEvents(NOTE_FILE, 2, EVENT_TIMEOUT_MS);
	await waitUntilQuiet(session.ledger);

	return session.ledger.eventsOf(NOTE_FILE);
}

const TESTS: readonly IManualTest[] = [
{
	id: 'T-0001',
	title: 'Baseline do "antes" com repositório git real',
	prepare: prepareGitWorkspace,
	run: async (session, t) => {
		writeOutside(session, CHANGED_CONTENT);
		await session.ledger.waitForEvents(NOTE_FILE, 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const events = session.ledger.eventsOf(NOTE_FILE);

		t.check('passo 4: o ledger guardou um evento de note.txt', events.length === 1, `${events.length} evento(s): ${events.map(describe).join(' | ')}`);

		if (events.length === 0) {
			return;
		}

		const event = events[0];

		t.check('passo 5: o evento traz beforeHash — o git respondeu', event.beforeHash !== undefined, `beforeHash=${event.beforeHash ?? 'ausente'}`);
		t.check('passo 5: o beforeHash é o do conteúdo que estava no HEAD', event.beforeHash === sha1(HEAD_CONTENT), `esperado=${sha1(HEAD_CONTENT).slice(0, 8)}`);
		t.check('passo 5: source=agent, attribution=observed, status=current', event.source === 'agent' && event.attribution === 'observed' && event.status === 'current', `${event.source}/${event.attribution}/${event.status}`);

		const before = session.ledger.snapshot(event.beforeHash);
		const after = session.ledger.snapshot(event.afterHash);

		t.check('passo 6: o snapshot do antes guarda o conteúdo do HEAD', before === HEAD_CONTENT, `antes=${JSON.stringify(before)}`);
		t.check('passo 6: o snapshot do depois guarda a alteração', after === CHANGED_CONTENT, `depois=${JSON.stringify(after)}`);
	}
},
{
	id: 'T-0002',
	title: 'Degradação para a sombra sem git',
	prepare: workspace => writeWorkspaceFile(workspace, NOTE_FILE, FIRST_VERSION),
	run: async (session, t) => {
		const events = await writeNoteTwice(session);

		t.check('existem dois eventos para note.txt', events.length === 2, `${events.length} evento(s): ${events.map(describe).join(' | ')}`);

		if (events.length < 2) {
			return;
		}

		t.check('o primeiro evento é parcial: sem git e sem sombra, não há antes', events[0].beforeHash === undefined, `beforeHash=${events[0].beforeHash ?? 'ausente'}`);
		t.check('o segundo evento tem antes — a sombra cobriu a ausência do git', events[1].beforeHash !== undefined, `beforeHash=${events[1].beforeHash ?? 'ausente'}`);

		const before = session.ledger.snapshot(events[1].beforeHash);
		const after = session.ledger.snapshot(events[1].afterHash);

		t.check('o antes do segundo evento é o conteúdo da primeira escrita', before === SECOND_VERSION, `antes=${JSON.stringify(before)}`);
		t.check('o depois do segundo evento é o conteúdo da segunda escrita', after === THIRD_VERSION, `depois=${JSON.stringify(after)}`);
	}
},
{
	id: 'T-0003',
	title: 'Observação do disco pelo watcher nativo',
	prepare: workspace => writeWorkspaceFile(workspace, NOTE_FILE, FIRST_VERSION),
	run: async (session, t) => {
		// Passo 3: a observação ligada é pré-condição do teste.
		const item = await findStatusItem(session.page);
		const indicator = await readIndicator(item);

		t.check('passo 3: a observação está ligada antes de medir', indicator.ariaLabel.includes('observation is on'), `aria-label=${JSON.stringify(indicator.ariaLabel)}`);

		const events = await writeNoteTwice(session);

		t.check('passo 6: dois eventos, ambos de note.txt', events.length === 2 && events.every(event => event.fileUri === NOTE_FILE), `${events.length} evento(s): ${events.map(describe).join(' | ')}`);

		if (events.length < 2) {
			return;
		}

		t.check('passo 6: as escritas separadas abrem sessões diferentes', events[0].sessionId !== events[1].sessionId, `${events[0].sessionId.slice(0, 8)} / ${events[1].sessionId.slice(0, 8)}`);
		t.check('o primeiro evento não tem antes: a pasta não tem git e a sombra estava vazia', events[0].beforeHash === undefined, `beforeHash=${events[0].beforeHash ?? 'ausente'}`);
		t.check('o segundo evento tem antes vindo da sombra', events[1].beforeHash !== undefined, `beforeHash=${events[1].beforeHash ?? 'ausente'}`);
		t.check('a origem é observada, e não um comando da interface', events.every(event => event.source === 'agent' && event.attribution === 'observed'), events.map(event => `${event.source}/${event.attribution}`).join(' | '));
		// Regra de atualidade do ledger: só o último evento de um arquivo fica 'current';
		// o anterior vira 'history' quando o seguinte entra.
		t.check('o último evento está current e o anterior virou history', events[0].status === 'history' && events[1].status === 'current', events.map(event => event.status).join(' | '));

		const before = session.ledger.snapshot(events[1].beforeHash);
		const after = session.ledger.snapshot(events[1].afterHash);

		t.check('o antes do segundo evento é "versao dois"', before === SECOND_VERSION, `antes=${JSON.stringify(before)}`);
		t.check('o depois do segundo evento é "versao tres"', after === THIRD_VERSION, `depois=${JSON.stringify(after)}`);
	}
},
{
	id: 'T-0004',
	title: 'Comando e indicador da observação',
	prepare: workspace => writeWorkspaceFile(workspace, NOTE_FILE, INITIAL_VERSION),
	run: async (session, t) => {
		const item = await findStatusItem(session.page);
		let indicator = await readIndicator(item);

		// Passo 3: o item na barra de status, com o olho aberto.
		t.check('passo 3: o item da barra de status mostra "Watch Code"', indicator.text === 'Watch Code', `texto=${JSON.stringify(indicator.text)}`);
		t.check('passo 3: o ícone é o olho aberto', hasIcon(indicator.icon, 'codicon-eye'), `icone=${JSON.stringify(indicator.icon)}`);
		t.check('passo 3: o estado inicial é observando', indicator.ariaLabel.includes('observation is on'), `aria-label=${JSON.stringify(indicator.ariaLabel)}`);

		// Passo 4: o tooltip diz que a observação está ligada.
		const activeTooltip = await showTooltip(session.page, item);

		t.check('passo 4: o tooltip é o da observação ligada', activeTooltip === ACTIVE_TOOLTIP, `tooltip=${JSON.stringify(activeTooltip)}`);

		// Passo 5: o comando aparece na paleta.
		const rows = await openCommandPalette(session.page, 'Watch Code');
		const labels = await rowLabels(rows);
		const target = rows.filter({ hasText: 'Turn Observation On/Off' }).first();

		t.check('passo 5: a paleta mostra "Watch Code: Turn Observation On/Off"', labels.some(label => label.includes('Watch Code') && label.includes('Turn Observation On/Off')), `itens=${JSON.stringify(labels)}`);

		// Passo 6: executar o comando desliga a observação, e o indicador acompanha.
		if (await target.count() === 0) {
			t.check('passo 6: o comando pôde ser executado', false, 'item nao encontrado na paleta');

			return;
		}

		await clickElement(session.page, target);

		const closed = await waitForIcon(item, 'codicon-eye-closed');
		indicator = await readIndicator(item);

		t.check('passo 6: o ícone virou olho fechado', closed && hasIcon(indicator.icon, 'codicon-eye-closed'), `icone=${JSON.stringify(indicator.icon)}`);
		t.check('passo 6: o rótulo acompanha, sem recarregar a janela', indicator.ariaLabel.includes('observation is off'), `aria-label=${JSON.stringify(indicator.ariaLabel)}`);
		const inactiveTooltip = await showTooltip(session.page, item);

		t.check('passo 6: o tooltip passa para o da observação desligada', inactiveTooltip === INACTIVE_TOOLTIP, `tooltip=${JSON.stringify(inactiveTooltip)}`);

		// Passos 7 a 9: com a observação desligada, a escrita não pode virar evento.
		const before = session.ledger.eventsOf(NOTE_FILE).length;

		writeOutside(session, OFF_WRITE);
		await delay(BETWEEN_SESSIONS_MS);
		await waitUntilQuiet(session.ledger);

		const afterOff = session.ledger.eventsOf(NOTE_FILE).length;

		t.check('passo 9: a escrita com a observação desligada não virou evento', afterOff === before, `${before} → ${afterOff} evento(s) de note.txt`);

		// Passo 10: o clique no indicador religa, sem passar pela paleta.
		await clickElement(session.page, item);

		t.check('passo 10: o clique no indicador religa a observação', await waitForIcon(item, 'codicon-eye'), 'o ícone não voltou ao olho aberto');

		// Passos 11 e 12: a escrita volta a virar evento — uma só, e com o conteúdo novo.
		writeWorkspaceFile(session.paths.workspace, WARM_UP_FILE, `sonda religada ${Date.now()}\n`);
		await session.ledger.waitForEvents(WARM_UP_FILE, 2, EVENT_TIMEOUT_MS);

		writeOutside(session, ON_WRITE);
		await session.ledger.waitForEvents(NOTE_FILE, before + 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const events = session.ledger.eventsOf(NOTE_FILE);
		const last = events[events.length - 1];

		t.check('passo 12: apareceu exatamente um evento novo de note.txt', events.length === before + 1, `${before} → ${events.length}`);
		t.check('passo 12: o evento novo aponta para note.txt', last?.fileUri === NOTE_FILE, `fileUri=${last?.fileUri ?? 'nenhum'}`);
		t.check('passo 12: o depois guardado é a escrita nova', session.ledger.snapshot(last?.afterHash) === ON_WRITE, `depois=${JSON.stringify(session.ledger.snapshot(last?.afterHash))}`);
	}
},
{
	id: 'T-0005',
	title: 'View da timeline no Explorer',
	prepare: workspace => writeWorkspaceFile(workspace, NOTE_FILE, INITIAL_VERSION),
	beforeWarmUp: async (session, t) => {
		const page = session.page;
		const header = timelineHeader(page);
		const headers = await header.count();

		// Passo 3: a view do produto está na janela, e a Timeline nativa não.
		t.check('passo 3: existe uma única view "Timeline" na janela', headers === 1, headers + ' cabeçalho(s) com "Timeline"');
		t.check('passo 3: o corpo da Timeline nativa não está na janela', await page.locator(NATIVE_TIMELINE_BODY_SELECTOR).count() === 0, NATIVE_TIMELINE_BODY_SELECTOR);

		// Passo 4: ela nasce recolhida.
		t.check('passo 4: a view nasce recolhida', !await timelineExpanded(page), 'aria-expanded=' + await header.first().getAttribute('aria-expanded'));

		// Passo 5: expandir mostra a lista, e sem nenhuma alteração ela anuncia o vazio.
		await toggleTimelineView(page);

		t.check('passo 5: o clique no cabeçalho expande a view', await timelineExpanded(page), 'aria-expanded=' + await header.first().getAttribute('aria-expanded'));

		const message = page.locator('.watch-code-timeline-message');
		const emptyShown = await waitForText(message, TIMELINE_EMPTY_MESSAGE);

		t.check('passo 5: sem alteração nenhuma, a view anuncia o vazio', emptyShown, 'mensagem=' + JSON.stringify(await message.textContent()));
		const retryButtons = await page.locator('.watch-code-timeline-message .monaco-button').count();

		t.check('passo 5: sem erro, não há botão de tentar de novo', retryButtons === 0, 'botões de tentar de novo=' + retryButtons);
		t.check('passo 5: a lista está vazia', await page.locator('.watch-code-timeline .monaco-list-row').count() === 0, 'linhas na lista');
	},
	run: async (session, t) => {
		const page = session.page;

		// Passo 6: a sonda de aquecimento foi escrita com a janela aberta; a lista
		// precisa tê-la mostrado sem nenhuma recarga.
		const probeIndex = await waitForTimelineRow(page, WARM_UP_FILE);

		t.check('passo 6: a alteração feita com a janela aberta aparece na lista', probeIndex >= 0, 'linhas=' + JSON.stringify(await timelineRowNames(page)));

		const details = await timelineRowDetails(page);
		const probeDetail = details[probeIndex] ?? '';

		t.check('passo 6: a linha mostra a hora e a origem', /\d{2}:\d{2}/.test(probeDetail) && probeDetail.includes('Disk'), 'detalhe=' + JSON.stringify(probeDetail));

		// Passo 7: uma segunda alteração, medida pelo crescimento da lista.
		const before = await timelineRowNames(page);

		writeWorkspaceFile(session.paths.workspace, NOTE_FILE, 'alterado com a janela aberta\n');

		const noteIndex = await waitForTimelineRow(page, NOTE_FILE);
		const after = await timelineRowNames(page);

		t.check('passo 7: a segunda alteração entra na lista', noteIndex >= 0, 'linhas=' + JSON.stringify(after));
		t.check('passo 7: a lista cresceu uma linha e manteve a anterior', after.length === before.length + 1, before.length + ' -> ' + after.length);
		t.check('passo 7: a alteração nova ficou depois da primeira', noteIndex >= 0 && noteIndex === after.length - 1, 'posição=' + noteIndex + ' de ' + after.length);

		// Passo 8: recolher de novo, com o mesmo gesto.
		await toggleTimelineView(page);

		t.check('passo 8: o clique recolhe a view de novo', !await timelineExpanded(page), 'aria-expanded=' + await timelineHeader(page).first().getAttribute('aria-expanded'));
		const listVisible = await page.locator('.watch-code-timeline .monaco-list').isVisible();

		t.check('passo 8: recolhida, a lista sai de cena', !listVisible, 'lista visível=' + listVisible);
	}
},
];

/** Abre o cenário, roda o teste, fecha o app e devolve se tudo passou. */
async function runTest(test: IManualTest): Promise<boolean> {
	const t = new Assertions();
	let opened: IOpenedSession | undefined;

	try {
		opened = await openSession(test, t);
		await test.run(opened.session, t);
	} catch (error) {
		t.check('execução do teste', false, error instanceof Error ? error.message : String(error));

		if (opened) {
			console.error(indent(appOutputTail(opened.session.outputLog)));
			console.error(indent(logTail(opened.session.paths.userData, 20)));
		}
	} finally {
		if (opened) {
			await closeSession(opened);
		}
	}

	return t.failuresCount === 0;
}

/** Recua um bloco de texto, para a evidência não se confundir com o resultado. */
function indent(text: string): string {
	return text.split('\n').map(line => `      ${line}`).join('\n');
}

async function main(): Promise<void> {
	const requested = process.argv.slice(2).filter(argument => argument.startsWith('T-'));
	const tests = requested.length > 0 ? TESTS.filter(test => requested.includes(test.id)) : TESTS;

	console.log('=== Watch Code — testes manuais no aplicativo ===');
	console.log(`repositorio : ${REPO_ROOT}`);
	console.log(`raiz        : ${DEFAULT_ROOT}`);
	console.log(`testes      : ${tests.map(test => test.id).join(', ')}`);
	console.log('');

	if (tests.length === 0) {
		throw new Error(`nenhum teste corresponde a [${requested.join(', ')}]; os conhecidos sao ${TESTS.map(test => test.id).join(', ')}`);
	}

	assertFreshBuild();

	const failed: string[] = [];

	for (const test of tests) {
		console.log(`${test.id} — ${test.title}`);

		if (!await runTest(test)) {
			failed.push(test.id);
		}

		console.log('');
	}

	console.log(`veredito: ${failed.length === 0 ? `PASSOU (${tests.length} testes manuais)` : `FALHOU (${failed.join(', ')})`}`);

	process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
	process.stderr.write(`executor falhou: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
