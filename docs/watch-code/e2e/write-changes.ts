/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Estímulo do teste ponta a ponta: altera arquivos do workspace sem agente nenhum e
// grava o manifesto de expectativa que o verificador usa como referência.
//
// Uso: node --experimental-strip-types write-changes.ts <pastaObservada> <caminhoDoManifesto>

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

/** Pausa entre duas escritas da mesma sessão: acima do coalescimento, abaixo da pausa. */
const WITHIN_SESSION_MS = 400;

/** Pausa que encerra uma sessão. O agrupador fecha em 1500 ms. */
const BETWEEN_SESSIONS_MS = 2500;

/** Tempo máximo de espera pelo evento de aquecimento. */
const WARM_UP_TIMEOUT_MS = 60000;

/** Como o estímulo obtém o conteúdo anterior esperado de uma escrita. */
export type BeforeOrigin = 'git' | 'shadow' | 'none' | 'n/a';

/** Uma escrita do estímulo, com o que ela deve produzir no ledger. */
export interface IScenarioWrite {
	readonly id: string;
	readonly fileUri: string;
	readonly kind: 'added' | 'updated' | 'deleted' | 'ignored';
	readonly session: string | null;
	readonly beforeOrigin: BeforeOrigin;
	/** Conteúdo escrito; ausente na remoção. */
	readonly content?: string;
	/** Conteúdo anterior esperado, quando ele sai da própria sequência (sombra). */
	readonly previousContent?: string;
	/** Pausa antes desta escrita, em milissegundos. */
	readonly waitBeforeMs: number;
}

/** O que o estímulo fez e o que o ledger deve mostrar. */
export interface IE2EManifest {
	readonly schema: 1;
	readonly workspace: string;
	readonly finishedAt: number;
	readonly writes: readonly IE2EWrite[];
}

/** Uma escrita já resolvida: com os hashes esperados para o ledger. */
export interface IE2EWrite {
	readonly id: string;
	readonly fileUri: string;
	readonly kind: IScenarioWrite['kind'];
	readonly at: number;
	readonly session: string | null;
	readonly beforeOrigin: BeforeOrigin;
	readonly contentSha1?: string;
	readonly beforeSha1?: string;
}

/**
 * Escrita de aquecimento, fora da sequência medida.
 *
 * O evento dela é a prova de que a observação está ligada: sem isso a sequência
 * medida poderia começar antes de o workbench subir, e as escritas cairiam no
 * vazio sem que ninguém percebesse.
 */
const WARM_UP_WRITE: IScenarioWrite = {
	id: 'w0', fileUri: 'src/aquecimento.ts', kind: 'added', session: 's0', beforeOrigin: 'none',
	content: '// aquecimento\n', waitBeforeMs: 0
};

/**
 * A sequência medida da especificação, na ordem em que acontece.
 *
 * As quatro primeiras escritas caem na mesma sessão; a pausa separa a segunda;
 * a última escreve num caminho ignorado e não pode virar evento.
 */
const SCENARIO: readonly IScenarioWrite[] = [
	{ id: 'w1', fileUri: 'src/app.ts', kind: 'updated', session: 's1', beforeOrigin: 'git', content: 'export const app = 2;\n', waitBeforeMs: 0 },
	{ id: 'w2', fileUri: 'src/app.ts', kind: 'updated', session: 's1', beforeOrigin: 'git', content: 'export const app = 3;\n', waitBeforeMs: WITHIN_SESSION_MS },
	{ id: 'w3', fileUri: 'src/novo.ts', kind: 'added', session: 's1', beforeOrigin: 'none', content: '// criado agora\n', waitBeforeMs: WITHIN_SESSION_MS },
	{ id: 'w4', fileUri: 'src/outro.ts', kind: 'added', session: 's1', beforeOrigin: 'none', content: '// outro\n', waitBeforeMs: WITHIN_SESSION_MS },
	{ id: 'w5', fileUri: 'src/novo.ts', kind: 'updated', session: 's2', beforeOrigin: 'shadow', content: '// criado agora, v2\n', previousContent: '// criado agora\n', waitBeforeMs: BETWEEN_SESSIONS_MS },
	{ id: 'w6', fileUri: 'src/legacy.ts', kind: 'deleted', session: 's2', beforeOrigin: 'git', waitBeforeMs: WITHIN_SESSION_MS },
	{ id: 'w7', fileUri: 'node_modules/pacote/index.js', kind: 'ignored', session: null, beforeOrigin: 'n/a', content: 'module.exports = {};\n', waitBeforeMs: BETWEEN_SESSIONS_MS }
];

/** Hash de conteúdo, no mesmo formato do produto: SHA-1 hexadecimal do conteúdo. */
function contentSha1(content: string): string {
	return createHash('sha1').update(content, 'utf8').digest('hex');
}

/** Caminho nativo de um arquivo relativo à pasta observada. */
function targetOf(workspace: string, fileUri: string): string {
	return join(workspace, ...fileUri.split('/'));
}

/** Conteúdo de um arquivo no HEAD do repositório, ou ausente quando não há versão. */
function readFromHead(workspace: string, fileUri: string): string | undefined {
	try {
		return execFileSync('git', ['-C', workspace, 'show', `HEAD:${fileUri}`], { encoding: 'utf8' });
	} catch {
		return undefined;
	}
}

/** O antes esperado de uma escrita, pela origem que ela declara. */
function resolveBefore(workspace: string, write: IScenarioWrite): string | undefined {
	if (write.beforeOrigin === 'none' || write.beforeOrigin === 'n/a') {
		return undefined;
	}

	if (write.beforeOrigin === 'shadow') {
		return write.previousContent;
	}

	const fromHead = readFromHead(workspace, write.fileUri);

	if (fromHead === undefined) {
		throw new Error(`sem versao em HEAD para ${write.fileUri}: o workspace precisa ter o commit inicial`);
	}

	return fromHead;
}

/** Executa uma escrita e devolve o que o ledger deve mostrar depois dela. */
function applyWrite(workspace: string, write: IScenarioWrite): IE2EWrite {
	const target = targetOf(workspace, write.fileUri);
	const before = resolveBefore(workspace, write);

	if (write.kind === 'deleted') {
		rmSync(target);
	} else {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, write.content ?? '', 'utf8');
	}

	return {
		id: write.id,
		fileUri: write.fileUri,
		kind: write.kind,
		at: Date.now(),
		session: write.session,
		beforeOrigin: write.beforeOrigin,
		contentSha1: write.kind === 'ignored' || write.kind === 'deleted' ? undefined : contentSha1(write.content ?? ''),
		beforeSha1: before === undefined ? undefined : contentSha1(before)
	};
}

/** Resumo de uma escrita, para o log da execução. */
function describe(write: IE2EWrite): string {
	const before = write.beforeSha1 === undefined ? 'nenhum' : write.beforeSha1.slice(0, 8);
	const after = write.contentSha1 === undefined ? 'nenhum' : write.contentSha1.slice(0, 8);
	const session = write.session === null ? 'sem evento' : write.session;

	return `${write.id}  ${write.fileUri}  ${write.kind}  antes=${write.beforeOrigin}(${before})  depois=${after}  sessao=${session}`;
}

/** Eventos já gravados no ledger, para a espera do aquecimento. */
function ledgerEvents(eventsDir: string): { fileUri?: string; afterHash?: string }[] {
	if (!existsSync(eventsDir)) {
		return [];
	}

	const events: { fileUri?: string; afterHash?: string }[] = [];

	for (const name of readdirSync(eventsDir).filter(name => name.endsWith('.json'))) {
		try {
			events.push(JSON.parse(readFileSync(join(eventsDir, name), 'utf8')) as { fileUri?: string; afterHash?: string });
		} catch {
			// Evento ilegível é assunto do verificador, não desta espera.
		}
	}

	return events;
}

/** Espera o evento de aquecimento, que prova que a observação já estava ligada. */
async function waitForWarmUp(eventsDir: string, afterHash: string): Promise<void> {
	const deadline = Date.now() + WARM_UP_TIMEOUT_MS;

	while (Date.now() < deadline) {
		if (ledgerEvents(eventsDir).some(event => event.fileUri === WARM_UP_WRITE.fileUri && event.afterHash === afterHash)) {
			return;
		}

		await delay(1000);
	}

	throw new Error(`o evento de aquecimento de ${WARM_UP_WRITE.fileUri} nao apareceu em ${WARM_UP_TIMEOUT_MS} ms: a observacao nao estava ligada`);
}

function main(): void {
	const [, , workspaceArg, manifestArg, eventsDirArg] = process.argv;

	if (!workspaceArg || !manifestArg) {
		process.stderr.write('uso: write-changes.ts <pastaObservada> <caminhoDoManifesto> [pastaDeEventos]\n');
		process.exit(1);
	}

	const workspace = resolve(workspaceArg);
	const manifestPath = resolve(manifestArg);
	const eventsDir = eventsDirArg ? resolve(eventsDirArg) : undefined;
	const resolved: IE2EWrite[] = [];

	void (async () => {
		const warmUp = applyWrite(workspace, WARM_UP_WRITE);
		resolved.push(warmUp);
		console.log(describe(warmUp));

		if (eventsDir) {
			await waitForWarmUp(eventsDir, warmUp.contentSha1 as string);
			console.log('aquecimento observado: a sequencia medida comeca agora');
			// A pausa fecha a sessão do aquecimento antes das escritas medidas.
			await delay(BETWEEN_SESSIONS_MS);
		}

		for (const write of SCENARIO) {
			await delay(write.waitBeforeMs);

			const applied = applyWrite(workspace, write);
			resolved.push(applied);
			console.log(describe(applied));
		}

		const manifest: IE2EManifest = {
			schema: 1,
			workspace,
			finishedAt: Date.now(),
			writes: resolved
		};

		mkdirSync(dirname(manifestPath), { recursive: true });
		writeFileSync(manifestPath, JSON.stringify(manifest, undefined, '\t'), 'utf8');

		const sessions = new Set(resolved.map(write => write.session).filter(session => session !== null));
		console.log(`estimulo concluido: ${resolved.length} escritas, ${sessions.size} sessoes, manifesto em ${manifestPath}`);
	})().catch(error => {
		process.stderr.write(`estimulo falhou: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	});
}

main();
