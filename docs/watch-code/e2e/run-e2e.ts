/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Executor do teste ponta a ponta: prepara a pasta observada e o perfil isolado, abre o app,
// roda o estímulo, espera o ledger, fecha o app e chama o verificador.
//
// Uso: node --experimental-strip-types run-e2e.ts [--workspace <pasta>] [--user-data <pasta>] [--manifest <arquivo>]
//
// O executor não julga nada: quem decide passou ou falhou é o verificador. Aqui só se
// monta o cenário e se conduz a execução, sem intervenção manual.

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

/** Raiz do repositório do fork: este arquivo mora em docs/watch-code/e2e. */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Onde vive tudo o que o teste cria. Apagado no início de cada execução. */
const DEFAULT_ROOT = join(tmpdir(), 'watchcode-e2e');

/** Tempo máximo para a janela do app ficar pronta. */
const APP_START_TIMEOUT_MS = 180000;

/** De quanto em quanto tempo o executor conta que ainda está esperando. */
const PROGRESS_EVERY_MS = 15000;

/** Tempo sem evento novo que significa que o ledger parou de crescer. */
const LEDGER_QUIET_MS = 3000;

/** Tempo máximo de espera pelo ledger. */
const LEDGER_TIMEOUT_MS = 60000;

/** Tempo de acomodação depois de o app ficar pronto. */
const APP_SETTLE_MS = 3000;

/** Arquivos do estado inicial, criados e commitados antes de o app abrir. */
const INITIAL_FILES: readonly (readonly [string, string])[] = [
	['src/app.ts', 'export const app = 1;\n'],
	['src/legacy.ts', 'export const legacy = true;\n'],
	['README.md', '# pasta de teste do e2e\n'],
	// Sem conversão de fim de linha: o que o git devolve no HEAD é o que foi escrito.
	['.gitattributes', '* -text\n']
];

/** Pares fonte/compilado conferidos antes de abrir o app. */
const FRESHNESS_PAIRS: readonly (readonly [string, string])[] = [
	['src/vs/platform/changeLedger/common', 'out/vs/platform/changeLedger/common'],
	['src/vs/workbench/services/changeLedger/electron-browser', 'out/vs/workbench/services/changeLedger/electron-browser'],
	['src/vs/workbench/contrib/watchCode/browser', 'out/vs/workbench/contrib/watchCode/browser']
];

interface IOptions {
	readonly workspace: string;
	readonly userData: string;
	readonly manifest: string;
	/** Pasta de extensões do teste, irmã do perfil. */
	readonly extensions: string;
}

/** Lê os argumentos da linha de comando, com os padrões do teste. */
function parseOptions(argv: readonly string[]): IOptions {
	let workspace = join(DEFAULT_ROOT, 'workspace');
	let userData = join(DEFAULT_ROOT, 'user-data');
	let manifest = join(DEFAULT_ROOT, 'manifest.json');

	for (let index = 2; index < argv.length; index++) {
		const next = argv[index + 1];

		switch (argv[index]) {
			case '--workspace':
				workspace = resolve(next ?? workspace);
				index++;
				break;
			case '--user-data':
				userData = resolve(next ?? userData);
				index++;
				break;
			case '--manifest':
				manifest = resolve(next ?? manifest);
				index++;
				break;
			default:
				throw new Error(`argumento desconhecido: ${argv[index]}`);
		}
	}

	return { workspace, userData, manifest, extensions: join(userData, '..', 'extensions') };
}

/** Caminho nativo de um arquivo relativo à pasta observada. */
function targetOf(workspace: string, fileUri: string): string {
	return join(workspace, ...fileUri.split('/'));
}

/**
 * Caminho na forma canônica do disco.
 *
 * O `%TEMP%` do Windows aparece como nome curto (`GABRIE~1`): sem normalizar, a URI
 * da pasta e os caminhos que o watcher reporta sairiam de origens diferentes, e a
 * comparação de caixa e de forma poderia recusar todo evento.
 */
function canonical(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

/** URI da pasta observada, com o caminho codificado: espaço no caminho não quebra o argumento. */
function folderUriOf(workspace: string): string {
	const segments = workspace.replace(/\\\\/g, '/').split('/').map(segment => encodeURIComponent(segment));

	return `file:///${segments.join('/')}`;
}

/** Compara dois caminhos sem depender da caixa nem do separador. */
function samePath(a: string | undefined, b: string): boolean {
	return a !== undefined && resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

/** Pasta apontada pelo campo folder de um workspace.json do perfil. */
function folderOfWorkspaceJson(path: string): string | undefined {
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as { folder?: string };

		if (!parsed.folder) {
			return undefined;
		}

		const decoded = decodeURIComponent(parsed.folder.replace(/^file:\/\//, ''));

		return decoded.replace(/^\/(?=[a-zA-Z]:)/, '');
	} catch {
		return undefined;
	}
}

/** Pasta de armazenamento do workspace dentro do perfil, quando o app já a criou. */
function findWorkspaceStorageDir(userDataDir: string, workspace: string): string | undefined {
	const storageHome = join(userDataDir, 'User', 'workspaceStorage');

	if (!existsSync(storageHome)) {
		return undefined;
	}

	for (const entry of readdirSync(storageHome)) {
		const workspaceJson = join(storageHome, entry, 'workspace.json');

		if (!existsSync(workspaceJson)) {
			continue;
		}

		if (samePath(folderOfWorkspaceJson(workspaceJson), workspace)) {
			return join(storageHome, entry);
		}
	}

	return undefined;
}

/** Carimbo de modificação mais recente de uma pasta, por extensão. */
function newestMtime(dir: string, extension: string): number {
	let newest = 0;

	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);

			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith(extension)) {
				newest = Math.max(newest, statSync(full).mtimeMs);
			}
		}
	};

	if (existsSync(dir)) {
		walk(dir);
	}

	return newest;
}

/** Quantos eventos o ledger já gravou. */
function countEvents(eventsDir: string): number {
	if (!existsSync(eventsDir)) {
		return 0;
	}

	return readdirSync(eventsDir).filter(name => name.endsWith('.json')).length;
}

/** Pasta de log mais recente do perfil. */
function newestLogDir(userDataDir: string): string | undefined {
	const logs = join(userDataDir, 'logs');

	if (!existsSync(logs)) {
		return undefined;
	}

	const dirs = readdirSync(logs)
		.map(name => join(logs, name))
		.filter(path => statSync(path).isDirectory())
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

	return dirs[0];
}

/** Últimas linhas do log, para o caso de a execução abortar. */
function logTail(userDataDir: string, lines = 30): string {
	const logDir = newestLogDir(userDataDir);

	if (!logDir) {
		return 'sem logs no perfil';
	}

	const parts: string[] = [];

	for (const name of ['main.log', join('window1', 'renderer.log')]) {
		const file = join(logDir, name);

		if (!existsSync(file)) {
			continue;
		}

		const content = readFileSync(file, 'utf8').split(/\r?\n/);
		parts.push(`--- ${name} ---`, ...content.slice(-lines));
	}

	return parts.join('\n');
}

/** Qual biblioteca de watcher o app realmente usou, quando o log conta. */
function watcherEvidence(userDataDir: string): string {
	const logDir = newestLogDir(userDataDir);
	const mainLog = logDir ? join(logDir, 'main.log') : undefined;

	if (!mainLog || !existsSync(mainLog)) {
		return 'sem main.log para consultar';
	}

	const found = readFileSync(mainLog, 'utf8')
		.split(/\r?\n/)
		.filter(line => /File Watcher/.test(line))
		.slice(0, 3);

	return found.length > 0 ? found.join(' | ') : 'o log nao registrou qual watcher foi usado';
}

/** Mata processos que ainda segurem o perfil do teste. Melhor esforço. */
function killLeftovers(profilePath: string): void {
	const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${profilePath}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;

	try {
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
	} catch {
		// Sem PowerShell não há rede de segurança; o taskkill da árvore já resolveu o normal.
	}
}

/** Roda o git na pasta de teste, falhando alto quando ele não responde. */
function git(workspace: string, args: readonly string[]): void {
	try {
		execFileSync('git', ['-C', workspace, ...args], { stdio: 'pipe', encoding: 'utf8' });
	} catch (error) {
		throw new Error(`git ${args.join(' ')} falhou: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** Cria a pasta observada com o estado inicial, já commitado. */
function prepareWorkspace(workspace: string): void {
	mkdirSync(workspace, { recursive: true });

	for (const [fileUri, content] of INITIAL_FILES) {
		const target = targetOf(workspace, fileUri);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content, 'utf8');
	}

	// A identidade fica no próprio repositório: o commit não depende do git global.
	execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', workspace], { stdio: 'pipe' });
	git(workspace, ['config', 'user.name', 'Watch Code E2E']);
	git(workspace, ['config', 'user.email', 'e2e@watchcode.local']);
	git(workspace, ['config', 'core.autocrlf', 'false']);
	git(workspace, ['add', '-A']);
	git(workspace, ['commit', '--quiet', '-m', 'estado inicial do e2e']);
}

/** Confere que o app e o compilado são mais novos que o código-fonte. */
function assertFreshBuild(): void {
	const exe = join(REPO_ROOT, '.build', 'electron', 'Code - OSS.exe');
	const electronMain = join(REPO_ROOT, 'out', 'vs', 'code', 'electron-main', 'main.js');

	if (!existsSync(exe) || !existsSync(electronMain)) {
		throw new Error('executavel ou compilado ausente: rode npm run compile-client e npm run electron');
	}

	const stale = FRESHNESS_PAIRS.filter(([source, compiled]) => newestMtime(join(REPO_ROOT, compiled), '.js') < newestMtime(join(REPO_ROOT, source), '.ts'));

	if (stale.length > 0) {
		throw new Error(`compilado mais velho que a fonte em [${stale.map(pair => pair[0]).join(', ')}]: rode npm run compile-client`);
	}
}

/** Abre o app no perfil do teste, apontando para a pasta observada. */
/** Porta livre para o depurador, que é também o sinal de prontidão da janela. */
async function freePort(): Promise<number> {
	const server = createServer();

	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	await new Promise<void>(resolve => server.close(() => resolve()));

	return port;
}

/** Alvo de depuração anunciado pelo app. */
interface ICdpTarget {
	readonly type?: string;
	readonly webSocketDebuggerUrl?: string;
}

/** Páginas que o depurador do app anuncia, quando ele já responde. */
function cdpPages(port: number): Promise<readonly ICdpTarget[] | undefined> {
	return new Promise(resolve => {
		const request = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 2000 }, response => {
			let body = '';

			response.on('data', chunk => body += chunk);
			response.on('end', () => {
				try {
					resolve(JSON.parse(body) as ICdpTarget[]);
				} catch {
					resolve(undefined);
				}
			});
		});

		request.on('error', () => resolve(undefined));
		request.on('timeout', () => { request.destroy(); resolve(undefined); });
	});
}

/**
 * Avalia uma expressão na janela do app.
 *
 * É por aqui que o executor sabe que a interface subiu de verdade: o alvo de
 * depuração nasce com a janela, muito antes de o workbench existir.
 */
async function evaluateInPage(port: number, expression: string): Promise<string | undefined> {
	const pages = await cdpPages(port);
	const page = pages?.find(entry => entry.type === 'page' && entry.webSocketDebuggerUrl);

	if (!page?.webSocketDebuggerUrl) {
		return undefined;
	}

	return new Promise(resolve => {
		const socket = new WebSocket(page.webSocketDebuggerUrl as string);
		const done = (value: string | undefined): void => {
			try {
				socket.close();
			} catch {
				// Conexão já encerrada.
			}
			resolve(value);
		};

		socket.onerror = () => done(undefined);
		socket.onopen = () => socket.send(JSON.stringify({
			id: 1,
			method: 'Runtime.evaluate',
			params: { expression, returnByValue: true }
		}));
		socket.onmessage = event => {
			try {
				const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };

				if (message.id === 1) {
					done(String(message.result?.result?.value));
				}
			} catch {
				done(undefined);
			}
		};

		setTimeout(() => done(undefined), 5000);
	});
}

/** O workbench montado: é depois disto que a contribuição da observação entra. */
const READINESS_EXPRESSION = 'document.readyState === "complete" && !!document.querySelector(".monaco-workbench .statusbar")';

/** Evidência, não asserção: o indicador da observação está na barra de status. */
const INDICATOR_EXPRESSION = '(() => { const bar = document.querySelector(".statusbar"); if (!bar) { return "sem barra de status"; } return /Watch Code/.test(bar.textContent || "") ? "indicador presente" : "indicador ausente"; })()';

/**
 * Espera a janela do app ficar montada, e não só o armazenamento do workspace.
 *
 * O `workspace.json` nasce antes da interface: a captura por disco começa com a
 * contribuição do workbench, então esperar pelo armazenamento mediria cedo demais
 * e as escritas do estímulo cairiam no vazio.
 */
async function waitForWorkbench(child: ChildProcess, cdpPort: number): Promise<void> {
	const started = Date.now();
	const deadline = started + APP_START_TIMEOUT_MS;
	let reported = started;

	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`o app terminou antes de abrir a janela (codigo ${child.exitCode})`);
		}

		if (await evaluateInPage(cdpPort, READINESS_EXPRESSION) === 'true') {
			console.log(`      janela montada em ${Math.round((Date.now() - started) / 1000)}s`);
			return;
		}

		if (Date.now() - reported >= PROGRESS_EVERY_MS) {
			reported = Date.now();
			console.log(`      aguardando a janela... ${Math.round((Date.now() - started) / 1000)}s`);
		}

		await delay(1000);
	}

	throw new Error(`a janela do app nao ficou pronta em ${APP_START_TIMEOUT_MS} ms`);
}

/** Abre o app no perfil do teste, apontando para a pasta observada. */
function launchApp(options: IOptions, cdpPort: number, outputLog: string): ChildProcess {
	const exe = join(REPO_ROOT, '.build', 'electron', 'Code - OSS.exe');
	const output = openSync(outputLog, 'a');
	const env: NodeJS.ProcessEnv = {
		...process.env,
		NODE_ENV: 'development',
		VSCODE_DEV: '1',
		VSCODE_CLI: '1',
		VSCODE_SKIP_PRELAUNCH: '1',
		// O log do Chromium vai para o arquivo de saída: é a evidência de uma execução que falha.
		ELECTRON_ENABLE_LOGGING: '1'
	};

	// Sem isto o Electron subiria como Node, e sem aquilo o git herdaria configuração de teste.
	delete env.ELECTRON_RUN_AS_NODE;
	delete env.GIT_CONFIG_COUNT;
	delete env.GIT_CONFIG_PARAMETERS;

	// O primeiro argumento é o próprio aplicativo, como em scripts/code.bat, e não a pasta
	// observada: o Electron a trata como o caminho do app a carregar. A pasta vai por
	// --folder-uri, com o caminho codificado.
	const child = spawn(exe, [
		REPO_ROOT,
		`--folder-uri=${folderUriOf(options.workspace)}`,
		`--user-data-dir=${options.userData}`,
		`--extensions-dir=${options.extensions}`,
		'--disable-workspace-trust',
		`--remote-debugging-port=${cdpPort}`
	], { stdio: ['ignore', output, output], env });

	// O processo filho já herdou o descritor; o executor não precisa mais dele.
	closeSync(output);

	return child;
}

/** Últimas linhas da saída do próprio app, quando a execução aborta. */
function appOutputTail(outputLog: string, lines = 30): string {
	if (!existsSync(outputLog)) {
		return `sem saida do app em ${outputLog}`;
	}

	return [`--- saida do app ---`, ...readFileSync(outputLog, 'utf8').split(/\r?\n/).slice(-lines)].join('\n');
}

/** Espera o ledger parar de crescer e devolve quantos eventos ficaram. */
async function waitForLedger(eventsDir: string): Promise<number> {
	const deadline = Date.now() + LEDGER_TIMEOUT_MS;
	let previous = -1;
	let lastChange = Date.now();

	while (Date.now() < deadline) {
		const current = countEvents(eventsDir);

		if (current !== previous) {
			previous = current;
			lastChange = Date.now();
		} else if (Date.now() - lastChange >= LEDGER_QUIET_MS) {
			return current;
		}

		await delay(500);
	}

	return countEvents(eventsDir);
}

/** Roda um script do arnês em Node, com a saída no mesmo fluxo. */
function runNode(script: string, args: readonly string[]): number {
	const result = spawnSync(process.execPath, ['--experimental-strip-types', join(import.meta.dirname, script), ...args], { stdio: 'inherit' });

	return result.status ?? 1;
}

/** Fecha o app pela árvore do processo que o próprio executor abriu. */
function killApp(child: ChildProcess): void {
	if (child.exitCode !== null || child.pid === undefined) {
		return;
	}

	try {
		execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
	} catch {
		// Processo já morto: nada a fazer.
	}
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv);

	console.log('=== Watch Code — teste ponta a ponta ===');
	console.log(`repositorio : ${REPO_ROOT}`);
	console.log(`manifesto   : ${options.manifest}`);
	console.log('');

	console.log('[1/8] fechando sobras de execucao anterior');
	killLeftovers(options.userData);
	await delay(1500);

	console.log('[2/8] limpando a pasta de trabalho');
	rmSync(options.workspace, { recursive: true, force: true });
	rmSync(options.userData, { recursive: true, force: true });
	rmSync(options.extensions, { recursive: true, force: true });
	rmSync(options.manifest, { force: true });
	mkdirSync(options.userData, { recursive: true });
	mkdirSync(options.extensions, { recursive: true });
	mkdirSync(options.workspace, { recursive: true });

	// Daqui em diante tudo usa o caminho canônico, e não o nome curto do %TEMP%.
	const paths: IOptions = {
		...options,
		workspace: canonical(options.workspace),
		userData: canonical(options.userData),
		extensions: canonical(options.extensions)
	};

	console.log(`workspace   : ${paths.workspace}`);
	console.log(`perfil      : ${paths.userData}`);
	console.log('');

	console.log('[3/8] preparando a pasta observada e o commit inicial');
	prepareWorkspace(paths.workspace);

	console.log('[4/8] conferindo o frescor do compilado');
	assertFreshBuild();

	console.log('[5/8] abrindo o app');
	const outputLog = join(dirname(paths.userData), 'app-output.log');
	const cdpPort = await freePort();
	const child = launchApp(paths, cdpPort, outputLog);
	let verdict = 1;

	try {
		await waitForWorkbench(child, cdpPort);
		await delay(APP_SETTLE_MS);

		const storageDir = findWorkspaceStorageDir(paths.userData, paths.workspace);

		if (!storageDir) {
			throw new Error('o app nao registrou a pasta do workspace no perfil');
		}

		const eventsDir = join(storageDir, 'changeLedger', 'events');

		console.log('[6/8] rodando o estimulo');

		if (runNode('write-changes.ts', [paths.workspace, options.manifest, eventsDir]) !== 0) {
			throw new Error('o estimulo falhou; o manifesto nao foi gravado');
		}

		// O indicador só é consultado com o workbench inteiro de pé, e antes de fechar o app.
		const indicator = await evaluateInPage(cdpPort, INDICATOR_EXPRESSION);

		console.log('[7/8] esperando o ledger estabilizar');
		const settled = await waitForLedger(eventsDir);
		console.log(`      ${settled} evento(s) no ledger`);

		killApp(child);
		killLeftovers(paths.userData);
		await delay(2000);

		console.log('');
		console.log('[8/8] verificando o ledger');
		console.log(`watcher     : ${watcherEvidence(paths.userData)}`);
		console.log(`indicador   : ${indicator ?? 'nao foi possivel consultar'}`);
		console.log('');

		verdict = runNode('verify-ledger.ts', [options.manifest, paths.userData]);
	} catch (error) {
		console.error('');
		console.error(`execucao abortada: ${error instanceof Error ? error.message : String(error)}`);
		console.error('');
		console.error(appOutputTail(outputLog));
		console.error(logTail(paths.userData));
	} finally {
		killApp(child);
		killLeftovers(paths.userData);
	}

	process.exit(verdict);
}

main().catch(error => {
	process.stderr.write(`executor falhou: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
