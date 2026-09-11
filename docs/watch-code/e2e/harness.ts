/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Infraestrutura compartilhada pelos executores do arnês: pasta de teste, perfil
// isolado, abertura do app e leitura do ledger gravado no disco.
//
// O executor do e2e e o dos testes manuais abrem o app do mesmo jeito; o que muda
// entre eles é o cenário e o que cada um julga.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

/** Raiz do repositório do fork: este arquivo mora em docs/watch-code/e2e. */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Tempo máximo para a janela do app ficar pronta. */
export const APP_START_TIMEOUT_MS = 180000;

/** Tempo de acomodação depois de o workbench aparecer, antes da primeira escrita. */
export const APP_SETTLE_MS = 3000;

/**
 * Arquivo que serve de sonda de prontidão da observação.
 *
 * Extensão de código, como qualquer arquivo de teste: a sonda é escrita e
 * conferida em toda execução, e o produto observa o disco sem olhar a linguagem.
 */
export const WARM_UP_FILE = 'aquecimento.ts';

/** Pasta observada e perfil isolado de um cenário. */
export interface IAppPaths {
	readonly workspace: string;
	readonly userData: string;
	readonly extensions: string;
}

/** Evento gravado pelo ledger, no subconjunto que os testes leem. */
export interface ILedgerEvent {
	readonly id: string;
	readonly sessionId: string;
	readonly source: string;
	readonly attribution: string;
	readonly fileUri: string;
	readonly beforeHash?: string;
	readonly afterHash?: string;
	/** Faixas alteradas, como o produto as gravou; ausente quando não houve faixa. */
	readonly linesChanged?: readonly (readonly [number, number])[];
	readonly timestamp: number;
	readonly status: string;
}

/**
 * Caminho na forma canônica do disco.
 *
 * O `%TEMP%` do Windows aparece como nome curto (`GABRIE~1`): sem normalizar, a URI
 * da pasta e os caminhos que o watcher reporta sairiam de origens diferentes.
 */
export function canonical(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

/** Pasta observada e perfil de um cenário, dentro da raiz de trabalho do arnês. */
export function scratchPaths(root: string, name: string): IAppPaths {
	const base = join(root, name);

	return {
		workspace: join(base, 'workspace'),
		userData: join(base, 'user-data'),
		extensions: join(base, 'extensions')
	};
}

/** Cria as pastas de um cenário e devolve os caminhos na forma canônica do disco. */
export function createScratch(paths: IAppPaths): IAppPaths {
	for (const path of [paths.workspace, paths.userData, paths.extensions]) {
		mkdirSync(path, { recursive: true });
	}

	return {
		workspace: canonical(paths.workspace),
		userData: canonical(paths.userData),
		extensions: canonical(paths.extensions)
	};
}

/** URI da pasta observada, com o caminho codificado: espaço no caminho não quebra o argumento. */
export function folderUriOf(workspace: string): string {
	const segments = workspace.replace(/\\/g, '/').split('/').map(segment => encodeURIComponent(segment));

	return `file:///${segments.join('/')}`;
}

/** Caminho nativo de um arquivo relativo à pasta observada. */
export function targetOf(workspace: string, fileUri: string): string {
	return join(workspace, ...fileUri.split('/'));
}

/** Escreve um arquivo dentro da pasta observada, criando as pastas que faltarem. */
export function writeWorkspaceFile(workspace: string, fileUri: string, content: string): void {
	const target = targetOf(workspace, fileUri);

	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

/** Hash de conteúdo, no mesmo formato do produto. */
export function sha1(content: string): string {
	return createHash('sha1').update(content).digest('hex');
}

/** Compara dois caminhos sem depender da caixa nem do separador. */
export function samePath(a: string | undefined, b: string): boolean {
	return a !== undefined && resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

/** Porta livre, sorteada pelo sistema, para o depurador do app. */
export async function freePort(): Promise<number> {
	const server = createServer();

	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	await new Promise<void>(resolve => server.close(() => resolve()));

	return port;
}

/**
 * Abre o app no perfil do cenário, apontando para a pasta observada.
 *
 * O primeiro argumento é o próprio aplicativo, como em scripts/code.bat, e não a
 * pasta observada: o Electron a trataria como o caminho do app a carregar. A pasta
 * vai por --folder-uri, com o caminho codificado.
 */
export function launchApp(paths: IAppPaths, cdpPort: number, outputLog: string): ChildProcess {
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

	const child = spawn(exe, [
		REPO_ROOT,
		`--folder-uri=${folderUriOf(paths.workspace)}`,
		`--user-data-dir=${paths.userData}`,
		`--extensions-dir=${paths.extensions}`,
		'--disable-workspace-trust',
		`--remote-debugging-port=${cdpPort}`
	], { stdio: ['ignore', output, output], env });

	// O processo filho já herdou o descritor; o executor não precisa mais dele.
	closeSync(output);

	return child;
}

/** Fecha o app pela árvore do processo que o próprio executor abriu. */
export function killApp(child: ChildProcess): void {
	if (child.exitCode !== null || child.pid === undefined) {
		return;
	}

	try {
		execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
	} catch {
		// Processo já morto: nada a fazer.
	}
}

/** Mata processos que ainda segurem o perfil do cenário. Melhor esforço. */
export function killLeftovers(profilePath: string): void {
	const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${profilePath}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;

	try {
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
	} catch {
		// Sem PowerShell não há rede de segurança; o taskkill da árvore já resolveu o normal.
	}
}

/** Pares fonte/compilado conferidos antes de abrir o app. */
const FRESHNESS_PAIRS: readonly (readonly [string, string])[] = [
	['src/vs/platform/changeLedger/common', 'out/vs/platform/changeLedger/common'],
	['src/vs/workbench/services/changeLedger/electron-browser', 'out/vs/workbench/services/changeLedger/electron-browser'],
	['src/vs/workbench/contrib/watchCode/browser', 'out/vs/workbench/contrib/watchCode/browser']
];

/** Confere que o app e o compilado são mais novos que o código-fonte. */
export function assertFreshBuild(): void {
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

/** Roda o git na pasta de teste, falhando alto quando ele não responde. */
export function git(workspace: string, args: readonly string[]): void {
	try {
		execFileSync('git', ['-C', workspace, ...args], { stdio: 'pipe', encoding: 'utf8' });
	} catch (error) {
		throw new Error(`git ${args.join(' ')} falhou: ${error instanceof Error ? error.message : String(error)}`);
	}
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
export function findWorkspaceStorageDir(userDataDir: string, workspace: string): string | undefined {
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

/** Últimas linhas do log do app, para o caso de a execução abortar. */
export function logTail(userDataDir: string, lines = 30): string {
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

/** Últimas linhas da saída do próprio app, quando a execução aborta. */
export function appOutputTail(outputLog: string, lines = 30): string {
	if (!existsSync(outputLog)) {
		return `sem saida do app em ${outputLog}`;
	}

	return [`--- saida do app ---`, ...readFileSync(outputLog, 'utf8').split(/\r?\n/).slice(-lines)].join('\n');
}

/**
 * Leitor do ledger gravado no perfil do cenário.
 *
 * O ledger é a fonte da verdade do teste: é dele que saem os eventos e os snapshots
 * que os testes manuais conferiam à mão nos arquivos JSON do perfil.
 */
export class LedgerReader {

	/** Pasta do ledger: `<perfil>/User/workspaceStorage/<id>/changeLedger`. */
	readonly root: string;

	constructor(root: string) {
		this.root = root;
	}

	get eventsDir(): string {
		return join(this.root, 'events');
	}

	get snapshotsDir(): string {
		return join(this.root, 'snapshots');
	}

	/** Quantos eventos existem, sem ler nenhum. */
	count(): number {
		return existsSync(this.eventsDir) ? readdirSync(this.eventsDir).filter(name => name.endsWith('.json')).length : 0;
	}

	/** Todos os eventos, do mais antigo para o mais recente. */
	events(): readonly ILedgerEvent[] {
		if (!existsSync(this.eventsDir)) {
			return [];
		}

		const events: ILedgerEvent[] = [];

		for (const name of readdirSync(this.eventsDir)) {
			if (!name.endsWith('.json')) {
				continue;
			}

			try {
				events.push(JSON.parse(readFileSync(join(this.eventsDir, name), 'utf8')) as ILedgerEvent);
			} catch {
				// Arquivo ainda sendo escrito: aparece na próxima leitura.
			}
		}

		return events.sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
	}

	/** Eventos de um arquivo do workspace, do mais antigo para o mais recente. */
	eventsOf(fileUri: string): readonly ILedgerEvent[] {
		return this.events().filter(event => event.fileUri === fileUri);
	}

	/** Conteúdo guardado como snapshot, quando o hash existe no store. */
	snapshot(contentHash: string | undefined): string | undefined {
		if (!contentHash) {
			return undefined;
		}

		const path = join(this.snapshotsDir, contentHash);

		return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
	}

	/**
	 * Espera o ledger acumular uma quantidade de eventos.
	 *
	 * A rajada de uma sessão não tem arquivo-sentinela: os eventos chegam por
	 * vários arquivos ao mesmo tempo, e o que se espera é o conjunto.
	 */
	async waitForCount(minimum: number, timeoutMs = 30000): Promise<readonly ILedgerEvent[]> {
		const deadline = Date.now() + timeoutMs;
		let found = this.events();

		while (found.length < minimum && Date.now() < deadline) {
			await delay(250);
			found = this.events();
		}

		return found;
	}

	/** Espera um arquivo acumular uma quantidade de eventos, e devolve todos eles. */
	async waitForEvents(fileUri: string, minimum: number, timeoutMs = 30000): Promise<readonly ILedgerEvent[]> {
		const deadline = Date.now() + timeoutMs;
		let found = this.eventsOf(fileUri);

		while (found.length < minimum && Date.now() < deadline) {
			await delay(250);
			found = this.eventsOf(fileUri);
		}

		return found;
	}
}

/** Raiz do ledger dentro da pasta de armazenamento do workspace. */
export function ledgerRootOf(storageDir: string): string {
	return join(storageDir, 'changeLedger');
}

export { delay };
