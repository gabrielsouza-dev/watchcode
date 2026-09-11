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
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
	scanWatchCodeLog,
	scratchPaths,
	sha1,
	targetOf,
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

/** Terceiro arquivo do T-0006: nomes distintos deixam claro qual linha esta selecionada. */
const EXTRA_FILE = 'extra.txt';

/** Arquivos do T-0007: um define o simbolo, o outro o importa e o usa. */
const LIBRARY_FILE = 'biblioteca.ts';
const CONSUMER_FILE = 'consumidor.ts';

/**
 * Conteudo de biblioteca.ts: a definicao de saudacao fica na linha 2, com o nome
 * na coluna 17.
 */
const LIBRARY_CONTENT = [
	'// Arquivo de apoio: define o simbolo que o consumidor importa.',
	'export function saudacao(): string {',
	"	return 'ola';",
	'}',
	''
].join('\n');

/**
 * Conteudo de consumidor.ts.
 *
 * A ultima linha tem um erro de tipo de proposito: sem ela, "nenhum erro
 * sublinhado" nao provaria nada, porque nao haveria erro para aparecer.
 */
const CONSUMER_CONTENT = [
	"import { saudacao } from './biblioteca';",
	'',
	'export const mensagem = saudacao();',
	"const quebrado: number = 'texto';",
	''
].join('\n');

/** Posicao do uso em consumidor.ts e da definicao em biblioteca.ts. */
const CONSUMER_LINE = 3;
const CONSUMER_COLUMN = 25;
const DEFINITION_LINE = 2;
const DEFINITION_COLUMN = 17;

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


/**
 * Arquivos de T-0008 e T-0009, e a configuracao que o segundo prepara.
 *
 * Codigo de verdade, em tres linguagens: o produto observa o disco e salta para o
 * arquivo, sem saber nada da linguagem — o .cs prova isso.
 */
const TARGET_FILE = 'alvo.ts';
const HISTORY_FILE = 'historico.js';
const REMOVED_FILE = 'apagado.cs';
const SETTINGS_FILE = '.vscode/settings.json';
const CENTER_ON_REVEAL_OFF = '{\n\t"watchCode.timeline.centerOnReveal": false\n}\n';

/** Linha alterada nos arquivos longos, e o tamanho deles: longe do topo e do fim. */
const TARGET_LINE = 100;
const LONG_FILE_LINES = 200;

/**
 * Passo do arrasto da barra de rolagem, em pixels.
 *
 * O cursor do arrasto anda muitas linhas por pixel: e o que faz a vista sair do
 * lugar sem tirar a linha alterada da area visivel.
 */
const SCROLL_STEP_PX = 20;

/** Um arquivo que a sessao do T-0010 altera. */
interface ISessionFile {
	readonly file: string;
	readonly language: Linguagem;
	/** Linha marcada como alterada. */
	readonly line: number;
	/** Total de linhas do arquivo. */
	readonly total: number;
}

/**
 * Os quatro arquivos que a sessao altera: tres extensoes e uma subpasta.
 *
 * Cada um muda numa linha diferente, e nenhum deles recebe duas escritas na
 * primeira sessao — a segunda escrita de um mesmo arquivo e o que a fase 2 prova.
 */
const SESSION_FILES: readonly ISessionFile[] = [
	{ file: 'src/alvo.ts', language: 'ts', line: 100, total: 200 },
	{ file: 'src/apoio.js', language: 'js', line: 60, total: 120 },
	{ file: 'src/servico.cs', language: 'cs', line: 30, total: 80 },
	{ file: 'src/modulo/indice.ts', language: 'ts', line: 25, total: 40 }
];

/** Arquivo que a sessao cria: o primeiro evento dele nasce sem "antes". */
const SESSION_NEW_FILE = 'src/modulo/regra.ts';
const SESSION_NEW_TOTAL = 12;

/** Arquivo que a sessao remove: o evento dele nasce sem "depois". */
const SESSION_REMOVED_FILE = 'src/legado.js';

/** Quantas alteracoes a sessao do T-0010 produz, sem contar a sonda de aquecimento. */
const SESSION_EVENT_COUNT = 6;

/**
 * Intervalo entre duas escritas da sessao, em milissegundos.
 *
 * Abaixo da pausa do agrupador (1500 ms), para tudo cair numa sessao so; acima da
 * janela em que o watcher coalesce entregas, para cada escrita ter o seu instante e
 * a ordem da lista poder ser conferida contra a ordem do ledger.
 */
const SESSION_WRITE_GAP_MS = 400;

/** Pasta que nasce sozinha no T-0011, e o arquivo que nasce dentro dela depois. */
const FOLDER_ONLY = 'src/pacote';
const FOLDER_FILE = 'src/pacote/regra.ts';
const FOLDER_FILE_NAME = 'regra.ts';
const FOLDER_FILE_TOTAL = 12;

/** Espera a alteracao da pasta chegar ao ledger, caso ela venha a chegar. */
const FOLDER_WAIT_MS = 2000;

/** O dialeto de cada arquivo de teste. */
type Linguagem = 'ts' | 'js' | 'cs';

/**
 * Um arquivo de codigo com a linha marcada como alterada.
 *
 * A linha e o total sao parametros porque a sessao do T-0010 muda cada arquivo
 * numa linha diferente: com a linha fixa, um salto que sempre caisse no mesmo
 * lugar passaria despercebido.
 */
function longContent(linguagem: Linguagem, alterada: boolean, linha = TARGET_LINE, total = LONG_FILE_LINES): string {
	const linhas: string[] = [];

	for (let numero = 1; numero <= total; numero++) {
		const declaracao = statementFor(linguagem, numero);

		linhas.push(numero === linha && alterada ? declaracao + ' // alterado pelo agente' : declaracao);
	}

	return linhas.join('\n') + '\n';
}

/** Cinco linhas: a faixa antiga ja nao existe neste arquivo. */
function shortContent(linguagem: Linguagem): string {
	const linhas: string[] = [];

	for (let numero = 1; numero <= 5; numero++) {
		linhas.push(statementFor(linguagem, numero));
	}

	return linhas.join('\n') + '\n';
}

/** Uma declaracao valida por linha, no dialeto da linguagem. */
function statementFor(linguagem: Linguagem, numero: number): string {
	if (linguagem === 'ts') {
		return 'export const valor' + numero + ': number = ' + numero + ';';
	}

	if (linguagem === 'js') {
		return 'const valor' + numero + ' = ' + numero + ';';
	}

	return 'private static readonly int Valor' + numero + ' = ' + numero + ';';
}

/** Um arquivo pequeno de C#, para o caso do arquivo apagado. */
const CS_CONTENT = 'namespace WatchCode {\n\tpublic static class Apagado {\n\t}\n}\n';

/** Seletor do cabecalho da view da timeline, dentro do Explorer. */
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

/**
 * Rotulos das acoes de navegacao mostradas no titulo da view.
 *
 * O titulo tem outras acoes (o menu "..."), entao a conta olha so os nossos dois
 * rotulos; o prefixo tolera o atalho que o VS Code as vezes acrescenta ao rotulo.
 */
async function timelineNavigationLabels(page: Page): Promise<readonly string[]> {
	const labels: string[] = [];

	for (const item of await page.locator(`${TIMELINE_HEADER_SELECTOR} .actions .action-label`).all()) {
		const label = await item.getAttribute('aria-label') ?? '';

		if (label.startsWith('Previous Change') || label.startsWith('Next Change')) {
			labels.push(label);
		}
	}

	return labels;
}

/** Nomes das linhas selecionadas: mais de uma significa que o evento ativo nao e unico. */
async function timelineSelectedNames(page: Page): Promise<readonly string[]> {
	return await page.locator('.watch-code-timeline .monaco-list-row.selected .name').allTextContents();
}

/** Espera a selecao cair numa linha, e devolve os nomes selecionados. */
async function waitForSelectedRow(page: Page, timeoutMs = 10000): Promise<readonly string[]> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const names = await timelineSelectedNames(page);

		if (names.length > 0) {
			return names;
		}

		await delay(200);
	}

	return [];
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

/** Nome do arquivo do editor ativo, pelo rotulo da aba ativa. */
async function activeEditorName(page: Page): Promise<string> {
	const tab = page.locator('.tabs-container .tab.active').first();

	if (await tab.count() === 0) {
		return '';
	}

	return collapse(await tab.innerText());
}

/** Abre um arquivo do workspace pela busca rapida de arquivos. */
async function openFile(page: Page, file: string): Promise<void> {
	await page.keyboard.press('Control+P');
	await page.locator('.quick-input-widget').first().waitFor({ state: 'visible', timeout: 15000 });
	await page.keyboard.type(file);

	// A lista refiltra a cada tecla: sem esta pausa o Enter pegaria o resultado anterior.
	await delay(1000);
	await page.keyboard.press('Enter');
	await delay(1500);
}

/** Posiciona o cursor por linha e coluna, pelo proprio comando do editor. */
async function gotoPosition(page: Page, line: number, column: number): Promise<void> {
	await page.keyboard.press('Control+G');
	await page.locator('.quick-input-widget').first().waitFor({ state: 'visible', timeout: 15000 });
	await page.keyboard.type(line + ':' + column);
	await delay(500);
	await page.keyboard.press('Enter');
	await delay(800);
}

/** Quantas abas a janela mantem abertas. */
async function tabCount(page: Page): Promise<number> {
	return await page.locator('.tabs-container .tab').count();
}

/**
 * Se a aba ativa esta fixada.
 *
 * O VS Code marca a aba de pre-visualizacao pelo rotulo em italico: fixada e a
 * que perdeu o italico.
 */
async function activeTabPinned(page: Page): Promise<boolean> {
	const aba = page.locator('.tabs-container .tab.active').first();

	if (await aba.count() === 0) {
		return false;
	}

	return await aba.locator('.monaco-icon-label.italic').count() === 0;
}

/**
 * Posicao vertical do cursor da barra de rolagem do editor ativo.
 *
 * E o que diz se a vista se mexeu: os numeros de linha desenhados na margem so
 * mudam quando a janela desenha um quadro novo, e a janela do arnes nao desenha
 * quadros o tempo todo — ja a posicao do cursor da barra acompanha a rolagem na
 * hora.
 */
async function editorScrollTop(page: Page): Promise<number> {
	const barra = page.locator('.editor-group-container.active .monaco-editor .monaco-scrollable-element > .scrollbar.vertical > .slider').first().first();

	if (await barra.count() === 0) {
		return -1;
	}

	const caixa = await barra.boundingBox();

	return caixa ? Math.round(caixa.y) : -1;
}

/** Linhas desenhadas na margem do editor ativo, em ordem. */
async function visibleLines(page: Page): Promise<readonly number[]> {
	const numeros = await page.locator('.editor-group-container.active .monaco-editor .margin-view-overlays .line-numbers').allTextContents();

	return numeros.map(texto => Number(texto.trim())).filter(numero => !Number.isNaN(numero));
}

/**
 * Rola a vista do editor arrastando a barra de rolagem.
 *
 * A roda do mouse nao se mostrou confiavel aqui; o arrasto da barra e o mesmo
 * gesto do usuario e mexe na vista sem tocar no cursor — que e o que a
 * conferencia da centralizacao precisa medir.
 */
async function scrollEditor(page: Page, pixels: number): Promise<void> {
	const barra = page.locator('.editor-group-container.active .monaco-editor .monaco-scrollable-element > .scrollbar.vertical > .slider').first();

	if (await barra.count() === 0) {
		return;
	}

	const editor = page.locator('.editor-group-container.active .monaco-editor').first();
	const area = await editor.boundingBox();

	// O editor so mostra a barra quando o mouse esta sobre ele: sem esta passada o
	// arrasto pega um cursor invisivel e nao rola nada.
	if (area) {
		await page.mouse.move(area.x + area.width / 3, area.y + area.height / 2);
		await delay(400);
	}

	const caixa = await barra.boundingBox();

	if (!caixa) {
		return;
	}

	const x = caixa.x + caixa.width / 2;
	const y = caixa.y + caixa.height / 2;

	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + pixels, { steps: 5 });
	await page.mouse.up();
	await delay(600);
}

/** Texto dos avisos que a janela esta mostrando agora. */
async function notificationTexts(page: Page): Promise<readonly string[]> {
	const mensagens = page.locator('.notifications-toasts .notification-list-item-message');

	if (await mensagens.count() === 0) {
		return [];
	}

	return (await mensagens.allTextContents()).map(collapse);
}

/** Espera um aviso novo, que nao estava na lista medida antes do passo. */
async function waitForNewNotification(page: Page, antes: readonly string[], timeoutMs = 10000): Promise<readonly string[]> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const novas = (await notificationTexts(page)).filter(texto => !antes.includes(texto));

		if (novas.length > 0) {
			return novas;
		}

		await delay(300);
	}

	return [];
}

/** A segunda faixa da linha selecionada: pasta, linhas, hora e origem. */
async function selectedRowDetail(page: Page): Promise<string> {
	const detail = page.locator('.watch-code-timeline .monaco-list-row.selected .detail').first();

	return await detail.count() === 0 ? '' : await detail.textContent() ?? '';
}

/** Clica na linha da lista pela posicao. */
async function clickTimelineRow(page: Page, index: number): Promise<void> {
	await page.locator('.watch-code-timeline .monaco-list-row').nth(index).click();
	await delay(1500);
}

/** Ultimo segmento do caminho: e o nome que a linha mostra. */
function fileNameOf(fileUri: string): string {
	return fileUri.substring(fileUri.lastIndexOf('/') + 1);
}

/** Caminho ate o arquivo, sem o nome; vazio quando o arquivo esta na raiz. */
function folderPathOf(fileUri: string): string {
	const separator = fileUri.lastIndexOf('/');

	return separator < 0 ? '' : fileUri.substring(0, separator);
}

/** A faixa de linhas no formato da view: '12', '12-14' ou varios, separados por virgula. */
function lineRangesOf(event: ILedgerEvent): string {
	return (event.linesChanged ?? []).map(range => range[0] === range[1] ? String(range[0]) : range[0] + '-' + range[1]).join(', ');
}

/** Hora local no formato HH:MM, o mesmo que a linha mostra. */
function clockOf(timestamp: number): string {
	const date = new Date(timestamp);

	return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

/**
 * A segunda faixa que a linha deve mostrar para um evento.
 *
 * E a mesma montagem da view: pasta, linhas, hora e origem, sem as partes vazias.
 */
function expectedRowDetail(event: ILedgerEvent): string {
	return [folderPathOf(event.fileUri), lineRangesOf(event), clockOf(event.timestamp), event.attribution === 'hook' ? 'Hook' : 'Disk']
		.filter(part => part.length > 0)
		.join(' \u00b7 ');
}

/**
 * Quantas linhas o editor mostra para um conteudo.
 *
 * O conteudo dos testes termina em quebra de linha, e o editor conta a linha
 * vazia que vem depois dela: cinco linhas de texto dao seis no modelo.
 */
function editorLineCount(content: string): number {
	return content.replace(/\r\n/g, '\n').split('\n').length;
}

/**
 * A linha em que o cursor deve parar: a ultima da faixa, limitada ao arquivo.
 *
 * Sem faixa, ou com o arquivo fora do disco, nao ha salto para conferir.
 */
function expectedCursorLine(event: ILedgerEvent, workspace: string): number | undefined {
	const range = event.linesChanged?.[0];
	const target = targetOf(workspace, event.fileUri);

	if (!range || !existsSync(target)) {
		return undefined;
	}

	return Math.min(range[1], editorLineCount(readFileSync(target, 'utf8')));
}

/** O que a lista mostrou num passo da travessia. */
interface ITimelineStep {
	readonly name: string;
	readonly detail: string;
	readonly editor: string;
	readonly position: string;
	/** Avisos visiveis no instante do passo. */
	readonly notices: readonly string[];
}

/**
 * Volta o evento ativo para a primeira linha da lista.
 *
 * Sem evento ativo o "anterior" entra pela ponta de baixo, e nas pontas o passo
 * para: repetir leva ao comeco e de la nao sai.
 */
async function restartAtFirstRow(page: Page, rows: number): Promise<void> {
	for (let press = 0; press <= rows; press++) {
		await page.keyboard.press('Shift+F5');
		await delay(700);
	}
}

/**
 * Anda uma linha por vez com o F5 e devolve o que a lista mostrou.
 *
 * A lista e virtualizada: so algumas linhas existem no DOM de cada vez. A leitura
 * e sempre a da linha selecionada, que o proprio passo traz para a area visivel —
 * e o gesto de quem percorre a sessao inteira.
 */
async function walkForward(page: Page, rows: number): Promise<readonly ITimelineStep[]> {
	const steps: ITimelineStep[] = [];

	for (let index = 0; index < rows; index++) {
		steps.push({
			name: (await timelineSelectedNames(page))[0] ?? '',
			detail: await selectedRowDetail(page),
			editor: await activeEditorName(page),
			position: await editorPosition(page),
			notices: await notificationTexts(page)
		});

		if (index < rows - 1) {
			await page.keyboard.press('F5');
			await delay(1800);
		}
	}

	return steps;
}

/** Texto do item de posicao da barra de status, no formato "Ln 2, Col 17". */
async function editorPosition(page: Page): Promise<string> {
	const item = page.locator('[id="status.editor.selection"]').first();

	if (await item.count() === 0) {
		return '';
	}

	return collapse(await item.innerText());
}

/** Quantas marcas de erro ou aviso o editor esta desenhando no arquivo ativo. */
async function editorSquiggles(page: Page): Promise<number> {
	return await page.locator('.monaco-editor .squiggly-error, .monaco-editor .squiggly-warning').count();
}

/** Rotulo de acessibilidade do item de problemas da barra de status. */
async function problemsLabel(page: Page): Promise<string> {
	const item = page.locator('[id="status.problems"]').first();

	if (await item.count() === 0) {
		return 'sem item de problemas na barra';
	}

	return collapse(await item.getAttribute('aria-label') ?? '');
}

/**
 * Abre o hover do cursor pelo comando do editor e devolve o texto mostrado.
 *
 * O atalho e um encadeamento (Ctrl+K Ctrl+I): as duas teclas precisam chegar em
 * sequencia, com o editor no foco. A pausa entre elas e a nova tentativa existem
 * porque o encadeamento as vezes se perde e o hover nao abre.
 */
async function hoverText(page: Page, attempts = 3): Promise<string> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		await page.keyboard.press('Control+K');
		await delay(300);
		await page.keyboard.press('Control+I');

		const hover = page.locator('.monaco-hover').first();

		try {
			await hover.waitFor({ state: 'visible', timeout: 8000 });

			const texto = collapse(await hover.innerText());

			if (texto.length > 0) {
				return texto;
			}
		} catch {
			// Sem hover nesta tentativa: fecha o que tiver aberto e tenta de novo.
		}

		await page.keyboard.press('Escape');
		await delay(500);
	}

	return '';
}

/** Linhas do widget de sugestao, quando ele esta aberto. */
async function suggestionRows(page: Page): Promise<readonly string[]> {
	if (await page.locator('.suggest-widget.visible').count() === 0) {
		return [];
	}

	return await rowLabels(page.locator('.suggest-widget .monaco-list-row'));
}

/** Espera o indicador de versao do TypeScript, que so aparece com o servidor no ar. */
async function typeScriptStatus(page: Page, timeoutMs = 60000): Promise<string> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const dedicado = page.locator('[id="typescript.version"]').first();

		if (await dedicado.count() > 0) {
			const rotulo = collapse(await dedicado.getAttribute('aria-label') ?? '');

			if (rotulo.length > 0) {
				return rotulo;
			}
		}

		const combinado = page.locator('[id="status.languageStatus"]').first();

		if (await combinado.count() > 0) {
			const rotulo = collapse(await combinado.getAttribute('aria-label') ?? '').toLowerCase();

			if (rotulo.includes('typescript')) {
				return rotulo;
			}
		}

		await delay(500);
	}

	return '';
}

/** Insiste numa tecla ate a condicao valer, porque o servidor leva segundos para subir. */
async function pressUntil(page: Page, key: string, done: () => Promise<boolean>, timeoutMs = 60000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		await page.keyboard.press(key);

		if (await done()) {
			return true;
		}

		await delay(2000);
	}

	return false;
}

/** Escreve por fora do app, como faria um agente — é o estímulo de todos os testes. */
function writeOutside(session: ISession, content: string): void {
	writeWorkspaceFile(session.paths.workspace, NOTE_FILE, content);
}

/** Monta o repositório git de T-0001, com o arquivo já commitado. */
function prepareGitWorkspace(workspace: string): void {
	commitWorkspace(workspace, [[NOTE_FILE, HEAD_CONTENT]]);
}

/**
 * Escreve os arquivos, cria o repositório e commita tudo.
 *
 * O commit é o "antes" da primeira alteração de cada arquivo: sem ele o evento
 * nasce parcial e não tem faixa de linhas para o salto revelar.
 */
function commitWorkspace(workspace: string, arquivos: readonly (readonly [string, string])[]): void {
	for (const [caminho, conteudo] of arquivos) {
		writeWorkspaceFile(workspace, caminho, conteudo);
	}

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
{
	id: 'T-0006',
	title: 'Anterior/Próximo na linha do tempo',
	prepare: workspace => writeWorkspaceFile(workspace, NOTE_FILE, INITIAL_VERSION),
	beforeWarmUp: async (session, t) => {
		// Passo 1: sem nenhuma alteração registrada não há o que percorrer.
		const labels = await timelineNavigationLabels(session.page);

		t.check('passo 1: sem alteração, os botões de navegação não aparecem', labels.length === 0, 'ações=' + JSON.stringify(labels));
	},
	run: async (session, t) => {
		const page = session.page;

		// Passo 2: três alterações, medidas pela própria lista.
		await waitForTimelineRow(page, WARM_UP_FILE);

		writeWorkspaceFile(session.paths.workspace, NOTE_FILE, 'primeira versao de t-0006\n');
		await session.ledger.waitForEvents(NOTE_FILE, 1, EVENT_TIMEOUT_MS);
		await waitForTimelineRow(page, NOTE_FILE);

		writeWorkspaceFile(session.paths.workspace, EXTRA_FILE, 'segunda versao de t-0006\n');
		await session.ledger.waitForEvents(EXTRA_FILE, 1, EVENT_TIMEOUT_MS);
		await waitForTimelineRow(page, EXTRA_FILE);
		await waitUntilQuiet(session.ledger);

		const ledged = session.ledger.eventsOf(WARM_UP_FILE).length + session.ledger.eventsOf(NOTE_FILE).length + session.ledger.eventsOf(EXTRA_FILE).length;

		t.check('passo 2: o ledger registrou as três alterações', ledged === 3, 'eventos=' + ledged + ' / linhas na tela=' + JSON.stringify(await timelineRowNames(page)));

		// Passo 3: com a view recolhida não há lista desenhada — e é assim que a navegação começa.
		t.check('passo 3: a view começa recolhida', !await timelineExpanded(page), 'aria-expanded=' + await timelineHeader(page).first().getAttribute('aria-expanded'));

		// Passo 4: o F5 abre a view, escolhe a alteração mais antiga e não rouba o foco.
		const focusBefore = await page.evaluate('document.activeElement ? document.activeElement.className : ""');

		await page.keyboard.press('F5');

		const selected = await waitForSelectedRow(page);
		const focusAfter = await page.evaluate('document.activeElement ? document.activeElement.className : ""');
		const focusInList = await page.evaluate('!!document.activeElement && !!document.activeElement.closest(".watch-code-timeline")');

		t.check('passo 4: o F5 abre a view', await timelineExpanded(page), 'aria-expanded=' + await timelineHeader(page).first().getAttribute('aria-expanded'));

		const rows = await timelineRowNames(page);

		t.check('passo 4: a lista mostra as três alterações, na ordem', rows.length === 3 && rows[0] === WARM_UP_FILE && rows[1] === NOTE_FILE && rows[2] === EXTRA_FILE, 'linhas=' + JSON.stringify(rows));

		const labels = await timelineNavigationLabels(page);

		t.check('passo 4: os dois botões de navegação aparecem no título', labels.length === 2 && labels[0].startsWith('Previous Change') && labels[1].startsWith('Next Change'), 'ações=' + JSON.stringify(labels));
		t.check('passo 4: o primeiro F5 escolhe a alteração mais antiga', selected[0] === WARM_UP_FILE, 'selecionadas=' + JSON.stringify(selected));
		t.check('passo 4: o foco não vai para a lista', !focusInList, 'foco antes=' + JSON.stringify(focusBefore) + ' depois=' + JSON.stringify(focusAfter));

		// Passo 5: o passo anda nas duas direções.
		await page.keyboard.press('F5');
		await delay(400);
		const forward = await timelineSelectedNames(page);

		t.check('passo 5: o F5 seguinte anda uma linha', forward[0] === NOTE_FILE, 'selecionadas=' + JSON.stringify(forward));

		await page.keyboard.press('Shift+F5');
		await delay(400);
		const backward = await timelineSelectedNames(page);

		t.check('passo 5: o Shift+F5 volta uma linha', backward[0] === WARM_UP_FILE, 'selecionadas=' + JSON.stringify(backward));

		// Passo 6: nas pontas o passo para, sem dar a volta.
		await page.keyboard.press('Shift+F5');
		await delay(400);
		const atStart = await timelineSelectedNames(page);

		t.check('passo 6: no começo, o anterior não dá a volta', atStart[0] === WARM_UP_FILE, 'selecionadas=' + JSON.stringify(atStart));

		await page.keyboard.press('F5');
		await page.keyboard.press('F5');
		await delay(400);
		const atEnd = await timelineSelectedNames(page);

		t.check('passo 6: dois F5 chegam na última alteração', atEnd[0] === EXTRA_FILE, 'selecionadas=' + JSON.stringify(atEnd));

		await page.keyboard.press('F5');
		await delay(400);
		const pastEnd = await timelineSelectedNames(page);

		t.check('passo 6: no fim, o próximo não dá a volta', pastEnd[0] === EXTRA_FILE, 'selecionadas=' + JSON.stringify(pastEnd));

		// Passo 7: o clique define o evento ativo, e a navegação continua dele.
		await page.locator('.watch-code-timeline .monaco-list-row').nth(1).click();
		await delay(400);
		const clicked = await timelineSelectedNames(page);

		t.check('passo 7: o clique escolhe a linha clicada', clicked[0] === NOTE_FILE, 'selecionadas=' + JSON.stringify(clicked));

		await page.keyboard.press('F5');
		await delay(400);
		const afterClick = await timelineSelectedNames(page);

		t.check('passo 7: o F5 continua a partir do clique', afterClick[0] === EXTRA_FILE, 'selecionadas=' + JSON.stringify(afterClick));

		// Passo 8: Ctrl+clique não cria um segundo evento ativo.
		await page.keyboard.down('Control');
		await page.locator('.watch-code-timeline .monaco-list-row').nth(0).click();
		await page.keyboard.up('Control');
		await delay(400);
		const ctrlClicked = await timelineSelectedNames(page);

		t.check('passo 8: a seleção continua única', ctrlClicked.length === 1, 'selecionadas=' + JSON.stringify(ctrlClicked));
	}
},
{
	id: 'T-0007',
	title: 'Leitura de código pelo F12',
	prepare: workspace => {
		writeWorkspaceFile(workspace, LIBRARY_FILE, LIBRARY_CONTENT);
		writeWorkspaceFile(workspace, CONSUMER_FILE, CONSUMER_CONTENT);
	},
	run: async (session, t) => {
		const page = session.page;

		// Passo 1: abrir o arquivo que consome o símbolo.
		await openFile(page, CONSUMER_FILE);
		const opened = await activeEditorName(page);

		t.check('passo 1: o consumidor abre no editor', opened === CONSUMER_FILE, 'aba ativa=' + JSON.stringify(opened));

		// Passo 2: o servidor de linguagem sobe e se anuncia na barra de status.
		const status = await typeScriptStatus(page);

		t.check('passo 2: a extensão do TypeScript está ativa', status.length > 0, 'indicador=' + JSON.stringify(status));

		// Passo 3: cursor sobre o símbolo usado.
		await gotoPosition(page, CONSUMER_LINE, CONSUMER_COLUMN);
		const beforeJump = await editorPosition(page);

		t.check('passo 3: o cursor está sobre o símbolo usado', beforeJump.includes('Ln ' + CONSUMER_LINE + ','), 'posição=' + JSON.stringify(beforeJump));

		// Passo 4: o F12 leva à definição, que está em outro arquivo.
		const jumped = await pressUntil(page, 'F12', async () => await activeEditorName(page) === LIBRARY_FILE);
		const afterJump = await activeEditorName(page);

		t.check('passo 4: o F12 abre o arquivo da definição', jumped && afterJump === LIBRARY_FILE, 'aba ativa=' + JSON.stringify(afterJump));

		// Passo 5: o cursor para em cima do símbolo definido.
		const position = await editorPosition(page);

		t.check('passo 5: o cursor fica na linha da definição', position.includes('Ln ' + DEFINITION_LINE + ','), 'posição=' + JSON.stringify(position) + ', esperado Ln ' + DEFINITION_LINE + ', Col ' + DEFINITION_COLUMN);

		// Passo 6: o hover mostra a assinatura, que só o servidor sabe.
		const hover = await hoverText(page);

		t.check('passo 6: o hover traz a assinatura', hover.includes('saudacao') && hover.includes('string'), 'hover=' + JSON.stringify(hover.slice(0, 160)));

		// Passo 7: nenhum erro sublinhado, mesmo com o erro de tipo plantado no arquivo.
		const squiggles = await editorSquiggles(page);
		const problemas = await problemsLabel(page);

		t.check('passo 7: o editor não sublinha o erro de tipo', squiggles === 0, 'marcas=' + squiggles);
		t.check('passo 7: a barra de status não acusa problema', !/Errors: [1-9]/.test(problemas) && !/Warnings: [1-9]/.test(problemas), 'problemas=' + JSON.stringify(problemas));

		// Passo 8: o comando de escrita saiu da paleta.
		const rows = await openCommandPalette(page, 'sort imports');
		const labels = await rowLabels(rows);

		await page.keyboard.press('Escape');
		await delay(400);

		t.check('passo 8: Sort Imports não aparece na paleta', !labels.some(label => label.toLowerCase().includes('sort imports')), 'linhas=' + JSON.stringify(labels.slice(0, 5)));

		// Passo 9: digitar não abre sugestão.
		await openFile(page, CONSUMER_FILE);
		await page.keyboard.press('Control+End');
		await page.keyboard.press('Enter');
		await page.keyboard.type('sauda');
		await delay(1500);
		const suggestions = await suggestionRows(page);

		t.check('passo 9: digitar não abre sugestão', suggestions.length === 0, 'sugestões=' + JSON.stringify(suggestions));

		await page.keyboard.press('Escape');
		await delay(300);
	}
},
{
	id: 'T-0008',
	title: 'Salto ao local da alteracao',
	prepare: workspace => commitWorkspace(workspace, [
		[TARGET_FILE, longContent('ts', false)],
		[HISTORY_FILE, longContent('js', false)],
		[REMOVED_FILE, CS_CONTENT]
	]),
	run: async (session, t) => {
		const page = session.page;
		const workspace = session.paths.workspace;

		// Passo 1: a lista comeca com a sonda de aquecimento, e recebe duas alteracoes.
		await waitForTimelineRow(page, WARM_UP_FILE);

		writeWorkspaceFile(workspace, TARGET_FILE, longContent('ts', true));
		await session.ledger.waitForEvents(TARGET_FILE, 1, EVENT_TIMEOUT_MS);
		await waitForTimelineRow(page, TARGET_FILE);

		writeWorkspaceFile(workspace, HISTORY_FILE, longContent('js', true));
		await session.ledger.waitForEvents(HISTORY_FILE, 1, EVENT_TIMEOUT_MS);
		await waitForTimelineRow(page, HISTORY_FILE);
		await waitUntilQuiet(session.ledger);

		const eventosDoAlvo = session.ledger.eventsOf(TARGET_FILE).length;

		t.check('passo 1: o ledger registrou a alteracao', eventosDoAlvo === 1, 'eventos do alvo=' + eventosDoAlvo + ' linhas na tela=' + JSON.stringify(await timelineRowNames(page)));

		// Passo 2: o F5 com o foco no editor abre a view e salta para a alteracao mais antiga.
		await page.keyboard.press('F5');
		await delay(2000);

		const primeiroDestino = await activeEditorName(page);

		t.check('passo 2: o F5 leva ao arquivo da alteracao mais antiga', primeiroDestino === WARM_UP_FILE, 'editor ativo=' + JSON.stringify(primeiroDestino));

		// Passo 3: o F5 seguinte salta para a alteracao do alvo, na linha alterada.
		await page.keyboard.press('F5');
		await delay(2000);

		const nomeDoAlvo = await activeEditorName(page);
		const posicao = await editorPosition(page);
		const visiveis = await visibleLines(page);

		t.check('passo 3: o editor vai para o arquivo da alteracao', nomeDoAlvo === TARGET_FILE, 'editor ativo=' + JSON.stringify(nomeDoAlvo));
		t.check('passo 3: o cursor cai na linha alterada', posicao.startsWith('Ln ' + TARGET_LINE + ','), 'posicao=' + JSON.stringify(posicao));
		t.check('passo 3: a linha alterada fica visivel', visiveis.includes(TARGET_LINE), 'linhas visiveis=' + visiveis[0] + '..' + visiveis[visiveis.length - 1]);

		// Passo 4: percorrer reusa uma aba so, de pre-visualizacao.
		const abas = await tabCount(page);
		const fixada = await activeTabPinned(page);

		t.check('passo 4: uma aba so, de pre-visualizacao', abas === 1 && !fixada, 'abas=' + abas + ' fixada=' + fixada);

		// Passo 5: com a tela rolada, o clique na linha centraliza a alteracao de novo.
		const linhaDoAlvo = await waitForTimelineRow(page, TARGET_FILE);

		// O cursor sai da linha alterada pelo proprio editor: sem isso, "o cursor
		// voltou para a linha" nao provaria nada.
		await gotoPosition(page, 150, 1);

		const rolagemAntes = await editorScrollTop(page);

		await scrollEditor(page, SCROLL_STEP_PX);

		const rolagemDepois = await editorScrollTop(page);

		await clickTimelineRow(page, linhaDoAlvo);

		const rolagemDoSalto = await editorScrollTop(page);
		const posicaoDepoisDoClique = await editorPosition(page);

		t.check('passo 5: a barra rolou a vista antes do clique', rolagemDepois > rolagemAntes, 'cursor da barra ' + rolagemAntes + ' -> ' + rolagemDepois);
		t.check('passo 5: o clique traz a alteracao de volta para o centro', rolagemDoSalto < rolagemDepois, 'cursor da barra ' + rolagemDepois + ' -> ' + rolagemDoSalto);
		t.check('passo 5: o cursor volta para a linha alterada', posicaoDepoisDoClique.startsWith('Ln ' + TARGET_LINE + ','), 'posicao=' + JSON.stringify(posicaoDepoisDoClique));

		// Passo 6: as setas andam na lista e o foco fica nela.
		await page.keyboard.press('ArrowDown');
		await delay(2000);

		const depoisDaSeta = await activeEditorName(page);
		const focoNaLista = await page.evaluate('!!document.activeElement && !!document.activeElement.closest(".watch-code-timeline")');
		const selecionada = await timelineSelectedNames(page);

		t.check('passo 6: a seta troca o arquivo aberto', depoisDaSeta === HISTORY_FILE, 'editor ativo=' + JSON.stringify(depoisDaSeta) + ' selecionadas=' + JSON.stringify(selecionada));
		t.check('passo 6: o foco continua na lista', focoNaLista, 'foco na lista=' + focoNaLista);

		// Passo 7: o Enter numa linha que ja e o evento ativo salta de novo.
		const rolagemAntesDoEnter = await editorScrollTop(page);

		await scrollEditor(page, SCROLL_STEP_PX);

		const rolagemDoEnter = await editorScrollTop(page);

		await page.keyboard.press('Enter');
		await delay(2000);

		const rolagemDepoisDoEnter = await editorScrollTop(page);
		const posicaoDepoisDoEnter = await editorPosition(page);

		t.check('passo 7: o Enter salta de novo, mesmo na linha ja ativa', posicaoDepoisDoEnter.startsWith('Ln ' + TARGET_LINE + ','), 'posicao=' + JSON.stringify(posicaoDepoisDoEnter));
		t.check('passo 7: a barra rolou a vista antes do Enter', rolagemDoEnter > rolagemAntesDoEnter, 'cursor da barra ' + rolagemAntesDoEnter + ' -> ' + rolagemDoEnter);
		t.check('passo 7: a centralizacao acontece outra vez', rolagemDepoisDoEnter < rolagemDoEnter, 'cursor da barra ' + rolagemDoEnter + ' -> ' + rolagemDepoisDoEnter);

		// Passo 8: o duplo clique fixa a aba, e o salto seguinte abre outra.
		await page.locator('.watch-code-timeline .monaco-list-row').nth(linhaDoAlvo).dblclick();
		await delay(2000);

		const fixadaDepoisDoDuploClique = await activeTabPinned(page);

		t.check('passo 8: o duplo clique fixa a aba', fixadaDepoisDoDuploClique, 'abas=' + await tabCount(page) + ' fixada=' + fixadaDepoisDoDuploClique);

		await page.keyboard.press('F5');
		await delay(2000);

		const abasNoFim = await tabCount(page);

		t.check('passo 8: a aba fixada nao e reusada pelo salto seguinte', abasNoFim === 2, 'abas=' + abasNoFim);

		// O arquivo que sera apagado: uma alteracao e, depois, a remocao.
		writeWorkspaceFile(workspace, REMOVED_FILE, 'namespace WatchCode {\n\tpublic static class Apagado {\n\t\t// reescrito pelo agente\n\t}\n}\n');
		await session.ledger.waitForEvents(REMOVED_FILE, 1, EVENT_TIMEOUT_MS);

		rmSync(join(workspace, REMOVED_FILE));
		await session.ledger.waitForEvents(REMOVED_FILE, 2, EVENT_TIMEOUT_MS);

		// A segunda alteracao do historico rebaixa a primeira a historica.
		writeWorkspaceFile(workspace, HISTORY_FILE, shortContent('js'));
		await session.ledger.waitForEvents(HISTORY_FILE, 2, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		// Passo 9 e 10: o passeio pela lista.
		//
		// A lista e virtualizada e a view e baixa: o que existe na tela sao poucas
		// linhas de cada vez. Andar com a seta traz cada linha para a area visivel —
		// e e o gesto do usuario para percorrer a sessao.
		await clickTimelineRow(page, 0);

		const nomesVisitados: string[] = [];
		const editoresVisitados: string[] = [];
		const avisosVistos: string[] = [];
		let posicaoDaHistorica = '';

		// Sao mais linhas do que a view desenha de uma vez, e duas delas tem o mesmo
		// nome de arquivo: o passeio anda um numero fixo de linhas, em vez de parar
		// quando o nome se repete.
		for (let passo = 0; passo < 8; passo++) {
			const linha = (await timelineSelectedNames(page))[0] ?? '';

			if (linha.length === 0) {
				break;
			}

			nomesVisitados.push(linha);
			editoresVisitados.push(await activeEditorName(page));

			if (linha === HISTORY_FILE && posicaoDaHistorica.length === 0) {
				posicaoDaHistorica = await editorPosition(page);
			}

			await page.keyboard.press('ArrowDown');
			await delay(1500);

			avisosVistos.push(...await waitForNewNotification(page, avisosVistos, 1500));
		}

		t.check('passo 9: o passeio visitou as alteracoes da sessao', nomesVisitados.length >= 5, 'linhas=' + JSON.stringify(nomesVisitados));
		t.check('passo 9: o arquivo que sumiu avisa, em vez de abrir', avisosVistos.some(texto => texto.includes('no longer in the workspace')), 'avisos=' + JSON.stringify(avisosVistos));
		t.check('passo 9: a remocao registrada tem o proprio aviso', avisosVistos.some(texto => texto.includes('removed the file')), 'avisos=' + JSON.stringify(avisosVistos));
		t.check('passo 9: nenhum editor do arquivo apagado e aberto', !editoresVisitados.includes(REMOVED_FILE), 'editores=' + JSON.stringify(editoresVisitados));
		t.check('passo 10: a entrada historica para na ultima linha do arquivo', posicaoDaHistorica.startsWith('Ln 6,'), 'posicao=' + JSON.stringify(posicaoDaHistorica));
	}
},
{
	id: 'T-0009',
	title: 'Salto sem centralizar a alteracao',
	prepare: workspace => {
		commitWorkspace(workspace, [[TARGET_FILE, longContent('ts', false)]]);

		// Depois do commit: a configuracao nao entra no "antes" de nenhum arquivo.
		writeWorkspaceFile(workspace, SETTINGS_FILE, CENTER_ON_REVEAL_OFF);
	},
	run: async (session, t) => {
		const page = session.page;

		await waitForTimelineRow(page, WARM_UP_FILE);

		writeWorkspaceFile(session.paths.workspace, TARGET_FILE, longContent('ts', true));
		await session.ledger.waitForEvents(TARGET_FILE, 1, EVENT_TIMEOUT_MS);
		await waitForTimelineRow(page, TARGET_FILE);
		await waitUntilQuiet(session.ledger);

		// Passo 1: com a centralizacao desligada o salto continua indo para a linha alterada.
		await page.keyboard.press('F5');
		await delay(1500);
		await page.keyboard.press('F5');
		await delay(2000);

		const nomeDoAlvo = await activeEditorName(page);
		const posicao = await editorPosition(page);

		t.check('passo 1: o salto continua com a configuracao desligada', nomeDoAlvo === TARGET_FILE && posicao.startsWith('Ln ' + TARGET_LINE + ','), 'editor ativo=' + JSON.stringify(nomeDoAlvo) + ' posicao=' + JSON.stringify(posicao));

		// Passo 2: com a alteracao ja visivel, o salto nao mexe na rolagem.
		const linhaDoAlvo = await waitForTimelineRow(page, TARGET_FILE);

		await clickTimelineRow(page, linhaDoAlvo);

		const rolagemAntes = await editorScrollTop(page);

		await scrollEditor(page, SCROLL_STEP_PX);

		const rolagemDepois = await editorScrollTop(page);

		await page.keyboard.press('Enter');
		await delay(2000);

		const rolagemDoSalto = await editorScrollTop(page);

		t.check('passo 2: a barra rolou a vista antes do Enter', rolagemDepois > rolagemAntes, 'cursor da barra ' + rolagemAntes + ' -> ' + rolagemDepois);
		t.check('passo 2: o salto nao rola a tela', rolagemDoSalto === rolagemDepois, 'cursor da barra ' + rolagemDepois + ' -> ' + rolagemDoSalto);
	}
},
{
	id: 'T-0010',
	title: 'Sessao inteira percorrida',
	prepare: workspace => commitWorkspace(workspace, [
		...SESSION_FILES.map(item => [item.file, longContent(item.language, false, item.line, item.total)] as const),
		[SESSION_REMOVED_FILE, shortContent('js')]
	]),
	run: async (session, t) => {
		const page = session.page;
		const workspace = session.paths.workspace;

		// A view nasce expandida: o clique aqui so garante que ela esta aberta.
		if (!await timelineExpanded(page)) {
			await toggleTimelineView(page);
		}

		await waitForTimelineRow(page, WARM_UP_FILE);

		// Fase 1: a sessao inteira. As escritas ficam separadas por menos que a pausa
		// do agrupador (1500 ms) e mais que a janela de coalescencia do watcher.
		for (const { file, language, line, total } of SESSION_FILES) {
			writeWorkspaceFile(workspace, file, longContent(language, true, line, total));
			await delay(SESSION_WRITE_GAP_MS);
		}

		writeWorkspaceFile(workspace, SESSION_NEW_FILE, longContent('ts', false, 1, SESSION_NEW_TOTAL));
		await delay(SESSION_WRITE_GAP_MS);
		rmSync(targetOf(workspace, SESSION_REMOVED_FILE));

		await session.ledger.waitForCount(SESSION_EVENT_COUNT + 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const firstPhase = session.ledger.events();
		const changes = firstPhase.slice(1);
		const sessions = new Set(changes.map(event => event.sessionId));

		t.check('fase 1: o ledger tem a sonda e as seis alteracoes', firstPhase.length === SESSION_EVENT_COUNT + 1 && firstPhase[0].fileUri === WARM_UP_FILE, 'eventos=' + firstPhase.length + ' primeiro=' + JSON.stringify(firstPhase[0]?.fileUri));
		t.check('fase 1: a sonda usa extensao de codigo', WARM_UP_FILE.endsWith('.ts'), 'sonda=' + WARM_UP_FILE);
		t.check('fase 1: as seis alteracoes estao na mesma sessao', sessions.size === 1, 'sessoes=' + sessions.size);

		const expectedRanges = new Map<string, string>(SESSION_FILES.map(item => [item.file, String(item.line)]));

		expectedRanges.set(SESSION_NEW_FILE, '1-' + SESSION_NEW_TOTAL);
		expectedRanges.set(SESSION_REMOVED_FILE, '');

		const wrongRanges = changes.filter(event => lineRangesOf(event) !== expectedRanges.get(event.fileUri));

		t.check('fase 1: cada alteracao tem a faixa de linhas esperada', wrongRanges.length === 0 && changes.length === SESSION_EVENT_COUNT, 'faixas=' + JSON.stringify(changes.map(event => fileNameOf(event.fileUri) + '=' + lineRangesOf(event))));

		// Ida: uma linha por vez, sempre conferindo contra o evento do ledger.
		await restartAtFirstRow(page, firstPhase.length);

		const forward = await walkForward(page, firstPhase.length);

		for (let index = 0; index < firstPhase.length; index++) {
			const event = firstPhase[index];
			const step = forward[index];
			const name = fileNameOf(event.fileUri);
			const cursor = expectedCursorLine(event, workspace);
			const position = 'ida ' + (index + 1) + ': ';

			t.check(position + 'a linha e a do evento do ledger', step.name === name && step.detail === expectedRowDetail(event), 'linha=' + JSON.stringify(step.name + ' | ' + step.detail) + ' evento=' + JSON.stringify(name + ' | ' + expectedRowDetail(event)));

			if (cursor === undefined) {
				t.check(position + 'o arquivo removido avisa em vez de abrir', step.editor !== name && step.notices.some(text => text.includes('removed the file')), 'editor=' + JSON.stringify(step.editor) + ' avisos=' + JSON.stringify(step.notices));
			} else {
				t.check(position + 'o cursor cai na faixa do evento', step.editor === name && step.position.startsWith('Ln ' + cursor + ','), 'editor=' + JSON.stringify(step.editor) + ' posicao=' + JSON.stringify(step.position));
			}
		}

		// Volta: o Shift+F5 percorre a mesma lista ao contrario.
		const backward: string[] = [];

		for (let index = 0; index < firstPhase.length; index++) {
			backward.push((await timelineSelectedNames(page))[0] ?? '');

			if (index < firstPhase.length - 1) {
				await page.keyboard.press('Shift+F5');
				await delay(1500);
			}
		}

		const expectedBackward = firstPhase.map(event => fileNameOf(event.fileUri)).reverse();

		t.check('volta: o Shift+F5 percorre a mesma lista ao contrario', backward.join(' > ') === expectedBackward.join(' > '), 'volta=' + JSON.stringify(backward));

		// Fase 2: uma escrita nova, noutra sessao, com o app aberto.
		await delay(BETWEEN_SESSIONS_MS);

		writeWorkspaceFile(workspace, SESSION_FILES[0].file, shortContent('ts'));

		await session.ledger.waitForCount(firstPhase.length + 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const secondPhase = session.ledger.events();
		const newest = secondPhase[secondPhase.length - 1];
		const oldIndex = secondPhase.findIndex(event => event.fileUri === SESSION_FILES[0].file);
		const older = secondPhase[oldIndex];

		t.check('fase 2: a entrada antiga do alvo vira historica', older.status === 'history' && newest.status === 'current' && newest.fileUri === SESSION_FILES[0].file, 'antiga=' + older.status + ' nova=' + newest.status);

		await restartAtFirstRow(page, secondPhase.length);

		const afterSecond = await walkForward(page, secondPhase.length);
		const names = afterSecond.map(step => step.name);
		const expectedNames = secondPhase.map(event => fileNameOf(event.fileUri));

		t.check('fase 2: a alteracao nova entra no fim da lista', names.join(' > ') === expectedNames.join(' > '), 'lista=' + JSON.stringify(names));

		const kept = afterSecond.slice(0, firstPhase.length).map(step => step.name + ' | ' + step.detail);
		const before = forward.map(step => step.name + ' | ' + step.detail);

		t.check('fase 2: as linhas anteriores continuam iguais, na mesma ordem', kept.join(' > ') === before.join(' > '), 'antes=' + JSON.stringify(before));

		// A entrada antiga do alvo aponta para a linha 100, que ja nao existe no arquivo
		// encurtado: o salto para na ultima linha e nao avisa. A pendencia esta
		// registrada desde o T-0008, e o aviso e escopo da E5-T1.
		const shortenedLines = editorLineCount(shortContent('ts'));
		const oldEntry = afterSecond[oldIndex];

		t.check('fase 2: a entrada antiga para na ultima linha do arquivo encurtado', oldEntry.position.startsWith('Ln ' + shortenedLines + ','), 'posicao=' + JSON.stringify(oldEntry.position) + ' linhas do arquivo=' + shortenedLines);
		t.check('fase 2: o salto para a entrada antiga nao avisa', !oldEntry.notices.some(text => text.includes('no longer in the workspace')), 'avisos=' + JSON.stringify(oldEntry.notices));
	}
},
{
	id: 'T-0011',
	title: 'Pasta nao e alteracao',
	run: async (session, t) => {
		const page = session.page;
		const workspace = session.paths.workspace;
		const sonda = session.ledger.count();

		// A view nasce expandida: o clique aqui so garante que ela esta aberta.
		if (!await timelineExpanded(page)) {
			await toggleTimelineView(page);
		}

		await waitForTimelineRow(page, WARM_UP_FILE);

		// Fase 1: a pasta nasce sozinha, como nasce quando alguem cria a arvore antes
		// de escrever o arquivo. Nada pode entrar no ledger por causa dela.
		mkdirSync(targetOf(workspace, FOLDER_ONLY), { recursive: true });
		await delay(FOLDER_WAIT_MS);

		const semArquivo = session.ledger.events();
		const daPasta = semArquivo.filter(event => event.fileUri === FOLDER_ONLY);

		t.check('fase 1: a pasta sozinha nao vira evento', daPasta.length === 0, 'eventos da pasta=' + daPasta.length);
		t.check('fase 1: o ledger nao cresceu com a pasta', semArquivo.length === sonda, 'eventos=' + semArquivo.length + ' sonda=' + sonda);

		// Fase 2: o arquivo dentro da pasta que ja existia vira evento, e so ele.
		writeWorkspaceFile(workspace, FOLDER_FILE, longContent('ts', false, 1, FOLDER_FILE_TOTAL));

		await waitForTimelineRow(page, FOLDER_FILE_NAME);
		await session.ledger.waitForCount(sonda + 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const comArquivo = session.ledger.events();
		const novo = comArquivo[comArquivo.length - 1];

		t.check('fase 2: so o arquivo virou evento', comArquivo.length === sonda + 1 && novo.fileUri === FOLDER_FILE, 'eventos=' + comArquivo.length + ' ultimo=' + JSON.stringify(novo?.fileUri));
		t.check('fase 2: o arquivo novo tem a faixa do arquivo inteiro', lineRangesOf(novo) === '1-' + FOLDER_FILE_TOTAL, 'faixa=' + JSON.stringify(lineRangesOf(novo)));

		const linhas = await timelineRowNames(page);
		const nomeDaPasta = FOLDER_ONLY.split('/').pop();

		t.check('fase 2: a pasta nao aparece na linha do tempo', linhas.every(name => name !== nomeDaPasta), 'linhas=' + JSON.stringify(linhas));

		// Fase 3: a medicao aprovada no D2. A remocao de pasta nao e corrigida nesta
		// tarefa, entao o cenario mede o que acontece e imprime o numero. A conferencia
		// nunca reprova: nao ha promessa nenhuma sobre o resultado.
		rmSync(targetOf(workspace, FOLDER_ONLY), { recursive: true });
		await delay(FOLDER_WAIT_MS);
		await waitUntilQuiet(session.ledger);

		const depois = session.ledger.events();
		const pastaRemovida = depois.filter(event => event.fileUri === FOLDER_ONLY).length;
		const arquivoRemovido = depois.filter(event => event.fileUri === FOLDER_FILE).length;

		t.check('medicao (nao reprova): a pasta removida vira evento?', true, 'pasta=' + pastaRemovida + ' arquivo=' + arquivoRemovido);
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

	// A varredura vem depois de fechar o app: o log em arquivo so esta completo quando
	// o processo terminou de escrever nele. Ela vale para todo cenario — a conferencia
	// e a mesma, e nenhuma execucao pode terminar com erro do produto no log.
	if (opened) {
		const scan = scanWatchCodeLog(opened.session.paths.userData);

		t.check('log: o produto nao escreveu erro nem aviso', scan.lines > 0 && scan.issues.length === 0, `linhas=${scan.lines} problemas=${JSON.stringify(scan.issues)}`);
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
