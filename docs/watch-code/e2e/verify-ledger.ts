/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Verificador do teste ponta a ponta: lê o ledger que o app gravou no perfil isolado e
// confere as invariantes da especificação contra o manifesto deixado pelo estímulo.
//
// Uso: node --experimental-strip-types verify-ledger.ts <caminhoDoManifesto> <pastaDePerfil>
//
// Sai com 0 quando todas as invariantes passam, 1 quando alguma falha e 2 quando o
// ledger não é encontrado. Nada é corrigido aqui: o verificador só olha e julga.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

/** Evento gravado pelo ledger, no subconjunto que interessa a esta verificação. */
interface ILedgerEvent {
	readonly id: string;
	readonly sessionId: string;
	readonly source: string;
	readonly attribution: string;
	readonly fileUri: string;
	readonly beforeHash?: string;
	readonly afterHash?: string;
	readonly timestamp: number;
	readonly status: string;
}

/** Índice de atualidade de um arquivo, derivado dos eventos pelo ledger. */
interface IFileIndex {
	readonly fileUri: string;
	readonly eventIds: readonly string[];
	readonly currentEventId?: string;
}

/** O que o estímulo fez, lido do manifesto. */
interface IE2EWrite {
	readonly id: string;
	readonly fileUri: string;
	readonly kind: 'added' | 'updated' | 'deleted' | 'ignored';
	readonly at: number;
	readonly session: string | null;
	readonly beforeOrigin: 'git' | 'shadow' | 'none' | 'n/a';
	readonly contentSha1?: string;
	readonly beforeSha1?: string;
}

interface IE2EManifest {
	readonly schema: 1;
	readonly workspace: string;
	readonly finishedAt: number;
	readonly writes: readonly IE2EWrite[];
}

/** Um arquivo esperado, com as escritas e os eventos que o representam. */
interface IFileAnalysis {
	readonly fileUri: string;
	readonly writes: readonly IE2EWrite[];
	readonly events: readonly ILedgerEvent[];
	/** Posição de cada evento na sequência de escritas do arquivo; -1 quando não casa. */
	readonly ranks: readonly number[];
}

/** Quantos milissegundos de folga o carimbo do evento pode ter para cada lado. */
const TIMESTAMP_SLACK_MS = 2000;

const failures: string[] = [];

/** Registra o resultado de uma invariante, sem interromper as seguintes. */
function check(id: string, ok: boolean, detail: string): void {
	console.log(`${ok ? 'ok   ' : 'FALHA'} ${id} ${detail}`);

	if (!ok) {
		failures.push(id);
	}
}

/** Hash de conteúdo, no mesmo formato do produto. */
function contentSha1(content: string | Buffer): string {
	return createHash('sha1').update(content).digest('hex');
}

/** Compara dois caminhos sem depender da caixa nem do separador. */
function samePath(a: string | undefined, b: string): boolean {
	return a !== undefined && resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

/** Caminho nativo de um arquivo relativo à pasta observada. */
function targetOf(workspace: string, fileUri: string): string {
	return join(workspace, ...fileUri.split('/'));
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

/** Pasta do ledger da observação, dentro do perfil isolado. */
function findLedgerRoot(userDataDir: string, workspace: string): string | undefined {
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
			return join(storageHome, entry, 'changeLedger');
		}
	}

	return undefined;
}

/** Eventos gravados, com a contagem dos que não puderam ser lidos. */
function readEvents(dir: string): { events: ILedgerEvent[]; unreadable: number } {
	const events: ILedgerEvent[] = [];
	let unreadable = 0;

	if (!existsSync(dir)) {
		return { events, unreadable };
	}

	for (const name of readdirSync(dir).filter(name => name.endsWith('.json'))) {
		try {
			events.push(JSON.parse(readFileSync(join(dir, name), 'utf8')) as ILedgerEvent);
		} catch {
			unreadable++;
		}
	}

	return { events, unreadable };
}

/** Índices por arquivo gravados pelo ledger. */
function readIndexes(dir: string): IFileIndex[] {
	if (!existsSync(dir)) {
		return [];
	}

	return readdirSync(dir)
		.filter(name => name.endsWith('.json'))
		.map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')) as IFileIndex);
}

/** Escritas do arquivo, em ordem cronológica. */
function writesOf(manifest: IE2EManifest, fileUri: string): IE2EWrite[] {
	return manifest.writes
		.filter(write => write.fileUri === fileUri && write.kind !== 'ignored')
		.sort((a, b) => a.at - b.at);
}

/** Posição da escrita que um evento representa, pela cadeia de conteúdo. */
function rankOf(event: ILedgerEvent, writes: readonly IE2EWrite[]): number {
	if (event.afterHash === undefined) {
		return writes.findIndex(write => write.kind === 'deleted');
	}

	return writes.findIndex(write => write.contentSha1 === event.afterHash);
}

/**
 * Eventos e escritas de um arquivo, já casados um a um.
 *
 * O casamento é pelo hash do conteúdo, e não pela ordem de chegada: dois eventos
 * podem compartilhar o mesmo carimbo de milissegundo, e aí a ordem relativa entre
 * eles não é observável. Dentro do empate vale a ordem das escritas; entre carimbos
 * diferentes a ordem é conferida de verdade.
 */
function analyzeFile(manifest: IE2EManifest, allEvents: readonly ILedgerEvent[], fileUri: string): IFileAnalysis {
	const writes = writesOf(manifest, fileUri);
	const events = allEvents
		.filter(event => event.fileUri === fileUri)
		.map(event => ({ event, rank: rankOf(event, writes) }))
		.sort((a, b) => a.event.timestamp - b.event.timestamp || a.rank - b.rank);

	return {
		fileUri,
		writes,
		events: events.map(entry => entry.event),
		ranks: events.map(entry => entry.rank)
	};
}

/** Conferências internas do manifesto: sem elas o resto não significa nada. */
function manifestIssues(manifest: IE2EManifest): string[] {
	const issues: string[] = [];
	const seen = new Set<string>();

	for (const write of manifest.writes) {
		if (seen.has(write.id)) {
			issues.push(`id repetido: ${write.id}`);
		}
		seen.add(write.id);

		if (write.kind === 'ignored' && (write.session !== null || write.beforeOrigin !== 'n/a')) {
			issues.push(`${write.id}: caminho ignorado nao pode declarar sessao nem antes`);
		}

		if (write.kind === 'deleted' && write.contentSha1 !== undefined) {
			issues.push(`${write.id}: remocao nao tem conteudo`);
		}

		if (write.beforeOrigin === 'none' && write.beforeSha1 !== undefined) {
			issues.push(`${write.id}: origem none nao tem antes`);
		}

		if ((write.beforeOrigin === 'git' || write.beforeOrigin === 'shadow') && write.beforeSha1 === undefined) {
			issues.push(`${write.id}: origem ${write.beforeOrigin} exige um antes`);
		}
	}

	return issues;
}

function main(): void {
	const [, , manifestArg, userDataArg] = process.argv;

	if (!manifestArg || !userDataArg) {
		process.stderr.write('uso: verify-ledger.ts <caminhoDoManifesto> <pastaDePerfil>\n');
		process.exit(1);
	}

	const manifestPath = resolve(manifestArg);

	if (!existsSync(manifestPath)) {
		process.stderr.write(`manifesto nao encontrado: ${manifestPath}\n`);
		process.exit(2);
	}

	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as IE2EManifest;
	const ledgerRoot = findLedgerRoot(resolve(userDataArg), manifest.workspace);

	if (!ledgerRoot) {
		process.stderr.write(`ledger nao encontrado para ${manifest.workspace} em ${userDataArg}\n`);
		process.exit(2);
	}

	const { events, unreadable } = readEvents(join(ledgerRoot, 'events'));
	const indexes = readIndexes(join(ledgerRoot, 'index'));
	const snapshotsDir = join(ledgerRoot, 'snapshots');

	console.log(`ledger  : ${ledgerRoot}`);
	console.log(`workspace: ${manifest.workspace}`);
	console.log(`eventos : ${events.length}${unreadable > 0 ? ` (${unreadable} ilegiveis)` : ''}`);
	console.log('');

	// I12 — o manifesto precisa ser coerente antes de qualquer comparação.
	const issues = manifestIssues(manifest);
	check('I12', issues.length === 0, issues.length === 0 ? 'manifesto consistente' : issues.join('; '));

	// I1 — só os arquivos esperados viraram evento, e nada de caminho ignorado.
	const expectedFiles = [...new Set(manifest.writes.filter(write => write.kind !== 'ignored').map(write => write.fileUri))];
	const observedFiles = [...new Set(events.map(event => event.fileUri))];
	const extra = observedFiles.filter(fileUri => !expectedFiles.includes(fileUri));
	const missing = expectedFiles.filter(fileUri => !observedFiles.includes(fileUri));
	const ignoredLeak = events.filter(event => /(^|[\\/])node_modules([\\/]|$)/.test(event.fileUri)).map(event => event.fileUri);
	check(
		'I1',
		extra.length === 0 && missing.length === 0 && ignoredLeak.length === 0 && unreadable === 0,
		extra.length === 0 && missing.length === 0 && ignoredLeak.length === 0 && unreadable === 0
			? `${expectedFiles.length} arquivos esperados, nenhum a mais`
			: `a mais: [${extra.join(', ')}]; faltando: [${missing.join(', ')}]; ignorados que vazaram: [${ignoredLeak.join(', ')}]; ilegiveis: ${unreadable}`
	);

	const analyses = expectedFiles.map(fileUri => analyzeFile(manifest, events, fileUri));
	const byFile = new Map(analyses.map(analysis => [analysis.fileUri, analysis]));
	const labelByEventId = new Map<string, string>();

	// I2, I3, I6 e I11 — o que cada evento diz sobre a escrita que ele representa.
	const orderIssues: string[] = [];
	const hashIssues: string[] = [];
	const statusIssues: string[] = [];
	const timeIssues: string[] = [];

	for (const analysis of analyses) {
		if (analysis.events.length !== analysis.writes.length) {
			orderIssues.push(`${analysis.fileUri}: ${analysis.events.length} eventos para ${analysis.writes.length} escritas`);
		}

		analysis.ranks.forEach((rank, index) => {
			const event = analysis.events[index];

			if (rank < 0) {
				orderIssues.push(`${analysis.fileUri}: evento ${event.id} nao casa com escrita nenhuma`);
				return;
			}

			const write = analysis.writes[rank];
			labelByEventId.set(event.id, write.session ?? 'sem sessao');

			if (index > 0 && analysis.ranks[index - 1] >= rank) {
				orderIssues.push(`${analysis.fileUri}: evento ${event.id} fora de ordem`);
			}

			if (event.afterHash !== write.contentSha1 || event.beforeHash !== write.beforeSha1) {
				hashIssues.push(`${analysis.fileUri} ${write.id}: depois ${event.afterHash ?? 'ausente'} esperado ${write.contentSha1 ?? 'ausente'}, antes ${event.beforeHash ?? 'ausente'} esperado ${write.beforeSha1 ?? 'ausente'}`);
			}

			if (event.timestamp < write.at - TIMESTAMP_SLACK_MS || event.timestamp > manifest.finishedAt + TIMESTAMP_SLACK_MS) {
				timeIssues.push(`${analysis.fileUri} ${write.id}: carimbo ${event.timestamp} distante da escrita ${write.at}`);
			}
		});

		analysis.events.forEach((event, index) => {
			const expected = index === analysis.events.length - 1 ? 'current' : 'history';

			if (event.status !== expected) {
				statusIssues.push(`${analysis.fileUri} ${event.id}: ${event.status} onde se esperava ${expected}`);
			}
		});
	}

	check('I2', orderIssues.length === 0, orderIssues.length === 0 ? `${events.length} eventos casados com as escritas, em ordem` : orderIssues.join('; '));
	check('I3', hashIssues.length === 0, hashIssues.length === 0 ? 'antes e depois de cada evento conferem' : hashIssues.join('; '));
	check('I6', statusIssues.length === 0, statusIssues.length === 0 ? 'so o ultimo evento de cada arquivo esta current' : statusIssues.join('; '));
	check('I11', timeIssues.length === 0, timeIssues.length === 0 ? 'carimbos dentro da janela da execucao' : timeIssues.join('; '));

	// I5 — todo hash citado existe no store e o conteúdo confere com o próprio nome.
	const cited = new Set<string>();

	for (const event of events) {
		if (event.beforeHash) {
			cited.add(event.beforeHash);
		}
		if (event.afterHash) {
			cited.add(event.afterHash);
		}
	}

	const brokenSnapshots = [...cited].filter(hash => {
		const snapshot = join(snapshotsDir, hash);

		return !existsSync(snapshot) || contentSha1(readFileSync(snapshot)) !== hash;
	});
	check('I5', brokenSnapshots.length === 0, brokenSnapshots.length === 0 ? `${cited.size} snapshots integros` : `snapshots quebrados: [${brokenSnapshots.join(', ')}]`);

	// I7 — o índice por arquivo acompanha os eventos.
	const indexIssues: string[] = [];
	const indexByFile = new Map(indexes.map(index => [index.fileUri, index]));

	for (const analysis of analyses) {
		const index = indexByFile.get(analysis.fileUri);
		const eventIds = analysis.events.map(event => event.id);

		if (!index) {
			indexIssues.push(`sem indice para ${analysis.fileUri}`);
			continue;
		}

		if (JSON.stringify(index.eventIds) !== JSON.stringify(eventIds)) {
			indexIssues.push(`${analysis.fileUri}: eventIds divergentes`);
		}

		if (index.currentEventId !== eventIds[eventIds.length - 1]) {
			indexIssues.push(`${analysis.fileUri}: currentEventId divergente`);
		}
	}

	for (const index of indexes) {
		if (!byFile.has(index.fileUri)) {
			indexIssues.push(`indice inesperado: ${index.fileUri}`);
		}
	}

	check('I7', indexIssues.length === 0, indexIssues.length === 0 ? `${analyses.length} indices coerentes` : indexIssues.join('; '));

	// I8 — toda alteração vem do disco e é atribuída ao agente.
	const unattributed = events.filter(event => event.source !== 'agent' || event.attribution !== 'observed');
	check('I8', unattributed.length === 0, unattributed.length === 0 ? 'todos os eventos sao observed do agent' : `${unattributed.length} eventos com origem inesperada`);

	// I9 — as sessões do ledger formam a mesma partição que o estímulo declarou.
	const byLabel = new Map<string, Set<string>>();

	for (const event of events) {
		const label = labelByEventId.get(event.id);

		if (label === undefined) {
			continue;
		}

		const sessionIds = byLabel.get(label) ?? new Set<string>();
		sessionIds.add(event.sessionId);
		byLabel.set(label, sessionIds);
	}

	const expectedLabels = [...new Set(manifest.writes.filter(write => write.session !== null).map(write => write.session as string))];
	const sessionIds = [...byLabel.values()].map(ids => [...ids][0]);
	const sessionOk = byLabel.size === expectedLabels.length
		&& [...byLabel.values()].every(ids => ids.size === 1)
		&& new Set(sessionIds).size === byLabel.size
		&& expectedLabels.every(label => byLabel.has(label));
	check('I9', sessionOk, sessionOk ? `${byLabel.size} sessoes, partição igual à declarada` : `esperado [${expectedLabels.join(', ')}], encontrado [${[...byLabel.entries()].map(([label, ids]) => `${label}->${[...ids].length}`).join(', ')}]`);

	// I10 — o disco ao final conta a mesma história do último evento de cada arquivo.
	const diskIssues: string[] = [];

	for (const analysis of analyses) {
		const last = analysis.events[analysis.events.length - 1];

		if (!last) {
			continue;
		}

		const target = targetOf(manifest.workspace, analysis.fileUri);

		if (last.afterHash === undefined) {
			if (existsSync(target)) {
				diskIssues.push(`${analysis.fileUri}: evento de remocao mas o arquivo existe`);
			}
			continue;
		}

		if (!existsSync(target)) {
			diskIssues.push(`${analysis.fileUri}: ultimo evento diz que existe, mas o arquivo sumiu`);
		} else if (contentSha1(readFileSync(target)) !== last.afterHash) {
			diskIssues.push(`${analysis.fileUri}: conteudo no disco difere do ultimo evento`);
		}
	}

	check('I10', diskIssues.length === 0, diskIssues.length === 0 ? 'estado final do disco casa com o ultimo evento' : diskIssues.join('; '));

	console.log('');

	for (const analysis of analyses) {
		console.log(`  ${analysis.fileUri}: ${analysis.events.length} evento(s), ultimo ${analysis.events[analysis.events.length - 1]?.status ?? 'ausente'}`);
	}

	console.log('');

	if (failures.length > 0) {
		console.log(`veredito: FALHOU em ${failures.join(', ')}`);
		process.exit(1);
	}

	console.log(`veredito: PASSOU (${events.length} eventos, ${analyses.length} arquivos)`);
}

main();
