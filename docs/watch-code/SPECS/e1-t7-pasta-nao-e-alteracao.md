# Especificação — E1-T7 · Pasta não é alteração

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T7 — Pasta não é alteração |
| Workflow | High (muda contrato) |
| Etapa | SpecWriter (2 de 5) |
| Entrada | `docs/watch-code/PLANS/e1-t7-pasta-nao-e-alteracao.md` |
| Saída | Esta especificação → Developer |

## 1. Referência

- **Plano:** `docs/watch-code/PLANS/e1-t7-pasta-nao-e-alteracao.md`.
- **Defeito de origem:** `docs/watch-code/SPECS/e1-t6-fechamento-da-e1.md`, "Defeito 3 — pasta tratada como arquivo".
- **Backlog:** `docs/watch-code/Workflow/overview.md` §6, linha da E1-T7; `docs/watch-code/Workflow/tasks.md`, item E1-T7.
- **Decisões aprovadas pelo usuário em 11/09/2026:**

| Decisão | O que foi aprovado |
| --- | --- |
| D1 | **B** — reconhecer o caminho que não é arquivo pelo veredito da própria leitura (`FILE_IS_DIRECTORY`), sem `stat` extra |
| D2 | **A** — corrigir só o caso observado (pasta que chega como criação/alteração) e **medir** a remoção de pasta no arnês, sem corrigi-la agora |
| D3 | **A** — o watcher não trata a pasta como erro: nada é registrado e fica um `trace` |
| D4 | **A** — varredura transversal do log em toda execução do arnês **e** cenário novo `T-0011` |

### Evidência que originou a tarefa

```text
2026-09-11 15:56:08.284 [error] [watchCode] failed to record src
  Unable to read file '...\watchcode-manual\t-0010\workspace\src'
  (Error: ... that is actually a directory)
```

Varredura dos dez perfis da última execução do arnês (`%TEMP%\watchcode-manual\t-0001 … t-0010`, arquivos `user-data/logs/<carimbo>/window1/renderer.log` e `main.log`): é a **única** linha de `[error]` ou `[warning]` com prefixo `[watchCode]` em dez execuções. O T-0010 passou com 24 conferências mesmo assim, porque nem a suíte nem o arnês olham o log.

## 2. Comportamento esperado

Quando nasce uma pasta dentro do workspace, o watcher do serviço de arquivos avisa a pasta, e o caminho dela chega ao recorder como qualquer outro. Hoje o recorder tenta ler a pasta como se fosse arquivo, a leitura falha, o `catch` do watcher transforma a falha em `logService.error`, e o produto escreve erro onde não houve erro. O ledger **já fica correto** — nenhum evento entra.

Depois da correção, o recorder reconhece que o caminho não é arquivo, devolve `undefined` e não grava nada; o watcher não trata isso como falha. O resultado, por situação:

| Situação | `kind` | O que muda |
| --- | --- | --- |
| A pasta nasceu e nada mais mudou | `added` | Antes: rejeição e `[error] failed to record src` no log. Depois: resolve `undefined`, ledger intacto, `trace` no log |
| A pasta e um arquivo dentro dela nasceram juntos | `added` (dois caminhos) | Antes: um erro no log e um evento. Depois: nenhum erro e o mesmo evento — só o do arquivo |
| Arquivo alterado, novo ou removido | `updated` / `added` / `deleted` | **Nada muda** |
| Arquivo que sumiu entre o aviso e a leitura, ou sem permissão | `updated` | **Nada muda**: continua rejeitando, e o watcher continua gravando `[error] failed to record` — é erro de verdade |
| Remoção de pasta | `deleted` | **Nada muda nesta tarefa** (D2): a remoção não lê o disco, então a decisão de D1 não a alcança. O cenário do arnês **mede** o que acontece e o número vai para o relatório |

O contrato do recorder passa a dizer isso: `undefined` significa "o caminho observado não é um arquivo; nada foi registrado".

## 3. Contratos

### 3.1 `IChangeRecorderService` (único contrato alterado)

```ts
export interface IChangeRecorderService {
	readonly _serviceBrand: undefined;

	recordChange(change: IObservedChange): Promise<ChangeEvent | undefined>;
}
```

| Retorno | Quando | Efeito no ledger |
| --- | --- | --- |
| `ChangeEvent` | O caminho é um arquivo e o conteúdo é diferente do último registrado | Um evento novo |
| O **mesmo** `ChangeEvent` anterior | O conteúdo é igual ao último registrado para o mesmo caminho (entrega repetida da mesma escrita) | Nenhum; nada é tocado |
| `undefined` | O caminho não é um arquivo (pasta) | Nenhum; nada é tocado |
| **Rejeição** | Um caminho que deveria existir não pode ser lido por outro motivo | Nenhum evento; o erro sobe para o chamador |

O texto da interface documenta os três primeiros casos; o quarto já estava documentado e continua igual.

### 3.2 O que **não** muda

- `IObservedChange`, `ChangeEvent` e o schema do ledger: intactos. O `undefined` não chega ao disco.
- A fila por arquivo (`recording`) e a supressão da escrita repetida (`lastEvents`): intactas, incluindo o `previous.catch(() => undefined)` da fila.
- `ObservedChangeKind` e a precedência de tipos do watcher (`KIND_PRIORITY`): intactas.
- Nenhum serviço, decorator ou registro de instanciação novo.

### 3.3 Funções do serviço de arquivos usadas

```ts
export function toFileOperationResult(error: Error): FileOperationResult;
export enum FileOperationResult { FILE_IS_DIRECTORY = 1, ... }
```

As duas são exportadas por `src/vs/platform/files/common/files.ts` e já são usadas por `fileService.ts`. `toFileOperationResult` devolve `FileOperationResult.FILE_OTHER_ERROR` para qualquer erro que não reconheça, o que garante que só o veredito explícito de pasta vire `undefined`.

## 4. Alterações necessárias

### 4.1 `src/vs/platform/changeLedger/common/changeRecorderService.ts`

**(a) Import.** A linha 11 já importa `IFileService` de `../../files/common/files.js`; ela passa a importar também o resultado e o tradutor de erro:

```ts
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
```

**(b) Comentário do contrato.** O bloco JSDoc de `recordChange` (linhas 59 a 71) ganha um parágrafo sobre o `undefined`, e a assinatura muda:

```ts
	/**
	 * Registra uma alteração e devolve o evento que representa o estado atual.
	 *
	 * Só grava quando o conteúdo do arquivo é diferente do último evento gravado
	 * para ele: o sistema de arquivos entrega a mesma escrita mais de uma vez, e
	 * uma entrega repetida não é uma alteração nova. Nesse caso devolve o evento
	 * anterior, sem tocar no ledger.
	 *
	 * Devolve `undefined` quando o caminho observado não é um arquivo: o watcher
	 * avisa quando uma pasta nasce dentro do workspace, e uma pasta não tem o que
	 * registrar. Nada é gravado, e quem chamou não tem evento nenhum em mãos.
	 *
	 * Rejeita quando um arquivo que deveria existir não pode ser lido: sem
	 * conteúdo atual não há "depois", e um evento sem "depois" só representa
	 * remoção. Por isso uma remoção é gravada sem ler o disco, com o "depois"
	 * ausente.
	 */
	recordChange(change: IObservedChange): Promise<ChangeEvent | undefined>;
```

**(c) `recordChange`.** Só a assinatura muda — a fila, o `try`/`finally` e o `recording.delete` ficam idênticos:

```ts
	async recordChange(change: IObservedChange): Promise<ChangeEvent | undefined> {
```

**(d) `record`.** O retorno passa a admitir `undefined`, e a decisão de "não é arquivo" acontece **antes** de qualquer escrita — nada de snapshot, nada em `lastEvents`, nada na sombra:

```ts
	/** Grava a alteração, se ela for diferente do último evento do mesmo arquivo. */
	private async record(resource: URI, change: IObservedChange): Promise<ChangeEvent | undefined> {
		const key = resource.toString();
		// Numa remoção não há o que ler: o evento registra que o arquivo saiu.
		const content = change.kind === 'deleted' ? undefined : await this.readFile(resource);

		// Sem conteúdo e sem remoção, o caminho não é um arquivo: pasta não é
		// alteração e não tem o que gravar. Sai antes de tocar no ledger.
		if (change.kind !== 'deleted' && !content) {
			return undefined;
		}

		const afterHash = content ? await this.ledger.recordSnapshot(content) : undefined;
		// ... o resto do método segue igual
	}
```

**(e) `readFile`.** É onde a pasta é reconhecida — pelo veredito do próprio serviço de arquivos (decisão D1-B):

```ts
	/**
	 * Lê o conteúdo atual do arquivo observado.
	 *
	 * Devolve `undefined` quando o caminho é uma pasta: o serviço de arquivos
	 * consulta o tipo antes de ler e recusa a leitura com o resultado de "é
	 * pasta". Qualquer outra falha continua subindo — arquivo que sumiu ou sem
	 * permissão é erro de verdade, não um caminho que não é arquivo.
	 */
	private async readFile(resource: URI): Promise<VSBuffer | undefined> {
		try {
			const content = await this.fileService.readFile(resource);

			return content.value;
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_IS_DIRECTORY) {
				return undefined;
			}

			throw error;
		}
	}
```

`useUnknownInCatchVariables` é `false` neste repositório (`src/tsconfig.base.json`), então o `catch (error)` entrega `any` e a chamada direta compila.

### 4.2 `src/vs/platform/changeLedger/common/workspaceWatcherService.ts`

O `record` privado (linhas 145 a 157) é o único consumidor de `recordChange` em todo o `src/vs`. Ele passa a distinguir "não virou evento" de "falhou":

```ts
	/** Registra uma alteração sem deixar que a falha interrompa a observação. */
	private record(file: IObservedFile, timestamp: number): void {
		const sessionId = this.grouper.sessionFor(file.folderUri.toString(), timestamp);

		this.recorder.recordChange({
			fileUri: file.fileUri,
			sessionId,
			attribution: 'observed',
			timestamp,
			folderUri: file.folderUri,
			kind: file.kind
		}).then(event => {
			if (!event) {
				// O caminho que não é arquivo não vira evento: a pasta que nasce dentro do
				// workspace chega aqui. Não é falha — o rastro fica no trace, que só aparece
				// com o log detalhado ligado.
				this.logService.trace(`[watchCode] ignored non-file change: ${file.fileUri}`);
			}
		}).catch(error => this.logService.error(`[watchCode] failed to record ${file.fileUri}`, error));
	}
```

Nada mais no arquivo muda: a sessão continua sendo aberta antes do registro (o agrupador não tem como saber o tipo do caminho, e uma sessão sem evento não aparece nem no ledger nem na linha do tempo).

### 4.3 `src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts`

Dois testes novos, logo antes do teste `arquivo ilegível não vira evento`, que fica como está — ele é a guarda de que o erro de verdade continua subindo.

```ts
	test('a pasta não é arquivo e não vira evento', async () => {
		const pasta = 'src/vs/base/pasta';

		await fileService.createFolder(resource(pasta));

		const event = await createRecorder().recordChange(observedChange({ fileUri: pasta }));

		assert.deepStrictEqual({
			event,
			eventos: (await ledger.readByFile(pasta)).length,
		}, {
			event: undefined,
			eventos: 0,
		});
	});

	test('a pasta não atrapalha o arquivo que nasce no mesmo caminho', async () => {
		const recorder = createRecorder();
		const caminho = 'src/vs/base/alvo';

		await fileService.createFolder(resource(caminho));
		const pasta = await recorder.recordChange(observedChange({ fileUri: caminho }));

		// A pasta sai e um arquivo ocupa o mesmo caminho: sem nada memorizado para a
		// pasta, o arquivo tem de virar evento normalmente.
		await fileService.del(resource(caminho), { recursive: true });
		await fileService.writeFile(resource(caminho), VSBuffer.fromString('agora e arquivo'));
		const arquivo = await recorder.recordChange(observedChange({ fileUri: caminho }));

		assert.deepStrictEqual({
			pasta,
			arquivo: arquivo?.afterHash,
			eventos: (await ledger.readByFile(caminho)).length,
		}, {
			pasta: undefined,
			arquivo: await computeContentHash(VSBuffer.fromString('agora e arquivo')),
			eventos: 1,
		});
	});
```

O caminho `src/vs/base/pasta` fica fora do arquivo `src/vs/base/a.ts` usado pelo resto da suíte, para nenhum teste mexer no estado do outro.

### 4.4 `src/vs/platform/changeLedger/test/common/workspaceWatcherService.test.ts`

**(a) Um log que guarda o que foi escrito**, no topo do arquivo, junto dos outros ajudantes:

```ts
/** Log que guarda os erros escritos, para o teste conferir que não houve nenhum. */
class RecordingLogService extends NullLogService {

	readonly errors: string[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push(typeof message === 'string' ? message : message.message);
	}
}
```

**(b) O `setup` passa a usá-lo** — uma variável `logs` no escopo da suíte, e o watcher construído com ela no lugar do `new NullLogService()` da linha 56. Os testes que já existem não mudam de comportamento: o `NullLogService` continua sendo o pai, e nada mais é registrado.

**(c) Um teste novo**, depois de `a remoção do arquivo vira evento sem "depois"`:

```ts
	test('a pasta nova não vira evento nem erro no log', async () => {
		service.start();

		// Criar a pasta chega ao watcher como alteração: o provider avisa o ADDED do
		// diretório (mkdir / _fireSoon do provider em memória).
		await fileService.createFolder(resource('src/modulo'));
		await timeout(SETTLED);

		const eventosDaPasta = await ledger.readByFile('src/modulo');

		await fileService.writeFile(resource('src/modulo/regra.ts'), VSBuffer.fromString('novo'));
		await timeout(SETTLED);

		assert.deepStrictEqual({
			eventosDaPasta: eventosDaPasta.length,
			eventosDoArquivo: (await ledger.readByFile('src/modulo/regra.ts')).length,
			erros: logs.errors,
		}, {
			eventosDaPasta: 0,
			eventosDoArquivo: 1,
			erros: [],
		});
	});
```

O `timeout(SETTLED)` de 30 ms é o mesmo dos outros testes da suíte: é o tempo que o provider em memória leva para entregar as alterações.

### 4.5 `docs/watch-code/e2e/harness.ts`

O `newestLogDir` já existe e é privado; a varredura usa ele e é exportada:

```ts
/** Linha de erro ou aviso que o próprio produto escreveu no log. */
const WATCH_CODE_ISSUE = /\[(?:error|warning)\] \[watchCode\]/;

/** Resultado da varredura do log de uma execução. */
export interface ILogScan {
	/** Quantas linhas foram conferidas. Zero significa que o log não foi lido. */
	readonly lines: number;
	/** Linhas de erro ou aviso escritas pelo produto. */
	readonly issues: readonly string[];
}

/**
 * Procura erro ou aviso do produto no log do perfil.
 *
 * O prefixo `[watchCode]` tem de vir logo depois do nível: o aviso
 * `Creation of workbench contribution '...watchCode.hiddenViews'` aparece em toda
 * execução e apenas cita o nome, e não pode ser confundido com erro do produto.
 */
export function scanWatchCodeLog(userDataDir: string): ILogScan {
	const logDir = newestLogDir(userDataDir);
	const issues: string[] = [];
	let lines = 0;

	if (!logDir) {
		return { lines, issues };
	}

	for (const name of ['main.log', join('window1', 'renderer.log')]) {
		const file = join(logDir, name);

		if (!existsSync(file)) {
			continue;
		}

		for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
			if (!line.trim()) {
				continue;
			}

			lines++;

			if (WATCH_CODE_ISSUE.test(line)) {
				issues.push(`${name}: ${line.trim()}`);
			}
		}
	}

	return { lines, issues };
}
```

### 4.6 `docs/watch-code/e2e/run-manual-tests.ts`

**(a) A varredura transversal** entra no `runTest`, **depois** do `finally` que fecha o app — o log em arquivo só está completo quando o processo terminou de escrever nele:

```ts
	// A varredura transversal vale para todo cenário: nenhuma execução pode terminar
	// com erro do produto no log, e é isso que o defeito da pasta escrevia.
	if (opened) {
		const scan = scanWatchCodeLog(opened.session.paths.userData);

		t.check('log: o produto nao escreveu erro nem aviso', scan.lines > 0 && scan.issues.length === 0, `linhas=${scan.lines} problemas=${JSON.stringify(scan.issues)}`);
	}
```

`scan.lines > 0` é proposital: um zero ali significa que o log não foi lido, e um verde sem ter lido nada não prova coisa nenhuma.

**(b) Constantes do cenário novo**, junto das do T-0010:

```ts
/** Pasta que nasce sozinha no cenário do T-0011, e o arquivo que nasce dentro dela depois. */
const FOLDER_ONLY = 'src/pacote';
const FOLDER_FILE = 'src/pacote/regra.ts';
const FOLDER_FILE_TOTAL = 12;

/** Espera a alteração da pasta chegar ao ledger, caso ela venha a chegar. */
const FOLDER_WAIT_MS = 2000;
```

**(c) O cenário novo**, no fim do array `TESTS`:

```ts
{
	id: 'T-0011',
	title: 'Pasta nao e alteracao',
	run: async (session, t) => {
		const page = session.page;
		const workspace = session.paths.workspace;
		const sonda = session.ledger.count();

		if (!await timelineExpanded(page)) {
			await toggleTimelineView(page);
		}

		await waitForTimelineRow(page, WARM_UP_FILE);

		// Fase 1: a pasta nasce sozinha. Nada pode entrar no ledger.
		mkdirSync(targetOf(workspace, FOLDER_ONLY), { recursive: true });
		await delay(FOLDER_WAIT_MS);

		const semArquivo = session.ledger.events();
		const daPasta = semArquivo.filter(event => event.fileUri === FOLDER_ONLY);

		t.check('fase 1: a pasta sozinha nao vira evento', daPasta.length === 0, 'eventos da pasta=' + daPasta.length);
		t.check('fase 1: o ledger nao cresceu com a pasta', semArquivo.length === sonda, 'eventos=' + semArquivo.length + ' sonda=' + sonda);

		// Fase 2: o arquivo dentro da pasta que ja existia vira evento, e so ele.
		writeWorkspaceFile(workspace, FOLDER_FILE, longContent('ts', false, 1, FOLDER_FILE_TOTAL));

		await session.ledger.waitForCount(sonda + 1, EVENT_TIMEOUT_MS);
		await waitUntilQuiet(session.ledger);

		const comArquivo = session.ledger.events();
		const novo = comArquivo[comArquivo.length - 1];

		t.check('fase 2: so o arquivo virou evento', comArquivo.length === sonda + 1 && novo.fileUri === FOLDER_FILE, 'eventos=' + comArquivo.length + ' ultimo=' + JSON.stringify(novo?.fileUri));
		t.check('fase 2: o arquivo novo tem a faixa do arquivo inteiro', lineRangesOf(novo) === '1-' + FOLDER_FILE_TOTAL, 'faixa=' + JSON.stringify(lineRangesOf(novo)));
		const linhas = await timelineRowNames(page);
		const nomeDaPasta = FOLDER_ONLY.split('/').pop();

		t.check('fase 2: a pasta nao aparece na linha do tempo', linhas.every(name => name !== nomeDaPasta), 'linhas=' + JSON.stringify(linhas));

		// Fase 3 (medicao aprovada no D2): a remocao de pasta nao e corrigida nesta
		// tarefa, entao o cenario mede o que acontece e imprime o numero.
		rmSync(targetOf(workspace, FOLDER_ONLY), { recursive: true });
		await delay(FOLDER_WAIT_MS);
		await waitUntilQuiet(session.ledger);

		const depois = session.ledger.events();
		const pastaRemovida = depois.filter(event => event.fileUri === FOLDER_ONLY).length;
		const arquivoRemovido = depois.filter(event => event.fileUri === FOLDER_FILE).length;

		t.check('medicao: eventos da pasta removida', true, 'pasta=' + pastaRemovida + ' arquivo=' + arquivoRemovido);
	}
},
```

Notas de implementação para o Developer:

- `rmSync` já é importado de `node:fs`; `mkdirSync` **precisa entrar** na mesma linha de import. `delay` já vem do `harness.ts`.
- `timelineRowNames` devolve os nomes renderizados; com dois eventos a lista inteira cabe na janela.
- A conferência `medicao: eventos da pasta removida` **nunca reprova**: ela imprime o número medido, e o que se tira dela é a informação, não um veredito. O Developer deve deixar isso explícito no nome, para ninguém ler o `ok` como aprovação.
- A varredura do log (item a) já cobre o erro do defeito neste cenário e em todos os outros: o T-0010 cria `src/` e `src/modulo/` e reprovaria a execução se o erro voltasse.

### 4.7 Documentação

| Arquivo | O que muda |
| --- | --- |
| `docs/watch-code/e2e/README.md` | Uma linha sobre a conferência transversal do log (ela vale para toda execução) e a linha do T-0011 na tabela de cenários |
| `docs/watch-code/testes-manuais.md` | Entrada `## T-0011 — Pasta não é alteração (E1-T7)`, com objetivo, pré-condições, passos, resultado esperado, resultado obtido e situação. **Só depois da execução real** |
| `docs/watch-code/Workflow/overview.md` | Linha da E1-T7: status `feito`, com o total de testes do módulo, a evidência do arnês e a pendência da remoção de pasta (D2) quando a medição a confirmar |

A pendência do D2 só vira texto no guia se a medição mostrar que a pasta removida vira evento. Se a medição mostrar que não vira, o registro diz que foi medido e não acontece — e a E1 fica fechada de verdade.

## 5. Casos de borda e tratamento de erro

| # | Caso | Comportamento definido |
| --- | --- | --- |
| B1 | A pasta nasce sozinha (`mkdir`) | `undefined`, ledger intacto, `trace` no log. Teste de unidade do watcher e fase 1 do T-0011 |
| B2 | A pasta e o arquivo nascem no mesmo lote (`writeWorkspaceFile` cria a pasta) | Dois caminhos no mesmo evento do watcher, um evento só no ledger: o do arquivo. A sessão é a mesma para os dois, porque o agrupador usa a pasta do workspace e o instante |
| B3 | Pasta aninhada: `src/` e `src/pacote/` nascem de uma vez | Nenhum dos dois caminhos vira evento — cada um é uma entrega própria |
| B4 | O caminho era pasta e depois é arquivo | Vira evento normalmente: nada foi memorizado para a pasta em `lastEvents` nem na sombra |
| B5 | Arquivo que não existe, sem permissão ou ilegível por qualquer outro motivo | Continua rejeitando, e o watcher continua escrevendo `[error] failed to record`. O teste `arquivo ilegível não vira evento` é a guarda |
| B6 | Remoção de pasta | Fora da correção (D2): a remoção não lê o disco, então o `deleted` segue o caminho de sempre. Medido no T-0011 e relatado |
| B7 | Pasta em workspace sem repositório git | Igual a qualquer pasta: o baseline nem é consultado, porque a decisão de "não é arquivo" acontece antes |
| B8 | Log de uma execução anterior com o erro antigo | Não interfere: `openSession` apaga a pasta do cenário (`rmSync` em `DEFAULT_ROOT/<id>`) antes de abrir o app, então a varredura lê o log da execução atual |
| B9 | Provider que devolve conteúdo para uma pasta em vez de recusar a leitura | Não é reconhecido como pasta e viraria evento. É limitação conhecida da decisão D1-B, registrada aqui: no disco local o Node recusa a leitura de diretório nas duas plataformas, e é o único provider do produto |

## 6. Plano de testes

### 6.1 Unidade — módulo `changeLedger`

```text
npm run transpile-client
npm run test-node -- --runGlob "**/{changeLedger,watchCode}/test/**/*.test.js"
```

- Os três testes novos (dois no recorder, um no watcher) passam.
- Todos os testes que já existiam continuam passando — em especial `arquivo ilegível não vira evento`, `a entrega repetida da mesma escrita não vira um segundo evento`, `duas entregas simultâneas da mesma escrita não viram dois eventos` e `a remoção de um arquivo que nunca existiu não rejeita`.
- O total do módulo sobe pelo número de testes novos; esse total é o que o relatório e o `overview.md` registram.

### 6.2 Arnês — aplicativo de verdade

```text
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts
```

- Os **onze** cenários passam, incluindo o T-0010 (que hoje deixa a linha de erro no log).
- A conferência transversal `log: o produto nao escreveu erro nem aviso` passa em todos, com `linhas` maior que zero.
- O `T-0011` pode ser rodado sozinho antes da execução completa: `... run-manual-tests.ts T-0011`.

### 6.3 Verificações estáticas

```text
npm run typecheck-client
npx eslint src/vs/platform/changeLedger/common/changeRecorderService.ts src/vs/platform/changeLedger/common/workspaceWatcherService.ts src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts src/vs/platform/changeLedger/test/common/workspaceWatcherService.test.ts docs/watch-code/e2e/harness.ts docs/watch-code/e2e/run-manual-tests.ts
npm run valid-layers-check
```

### 6.4 Teste manual registrado

O `testes-manuais.md` ganha o `T-0011`, executado de fato, com a saída real colada (as conferências do cenário e a linha da conferência transversal) e a situação preenchida. O resultado da medição do D2 entra no próprio texto do teste e no relatório.

### 6.5 O que **não** é testado aqui

- A remoção de pasta, como comportamento: ela é medida, não corrigida (D2).
- A varredura do log em si: é código do arnês, não do produto, e o teste dela é a execução real.

## 7. Critérios de aceite verificáveis

1. `recordChange` de um caminho que é pasta **resolve** `undefined` (teste de unidade do recorder).
2. Nada entra no ledger por causa da pasta (mesmo teste: `readByFile` vazio).
3. A pasta não memoriza nada: o arquivo que nasce no mesmo caminho depois vira evento (segundo teste do recorder).
4. Um caminho que não existe continua rejeitando (`arquivo ilegível não vira evento` verde).
5. A supressão da escrita repetida e a fila por arquivo seguem intactas (testes existentes verdes).
6. No watcher, pasta nova com arquivo dentro produz **um** evento — o do arquivo — e **nenhum** erro no log (teste novo, com o log espiado).
7. A execução inteira do arnês termina com a conferência transversal verde, com `linhas > 0`, em todos os cenários.
8. O cenário T-0011 passa: a pasta sozinha não move o ledger, o arquivo vira o único evento novo, com faixa `1-12`, e nenhuma linha da timeline é da pasta.
9. A medição da remoção de pasta (fase 3 do T-0011) está registrada com o número observado.
10. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e `npm run valid-layers-check` terminam sem erro.
11. `testes-manuais.md` com o T-0011 executado; `overview.md` com a E1-T7 em `feito`, o total de testes do módulo e a pendência do D2 (ou a nota de que a medição não achou problema).
12. `docs/watch-code/e2e/README.md` com a conferência transversal e o cenário novo.
13. Nenhum arquivo fora da lista do item 4 foi tocado.

## 8. Decisões pendentes

Nenhuma. As quatro decisões do plano foram aprovadas pelo usuário em 11/09/2026 e estão registradas no §1.

### Divergências do plano

| # | Plano | Especificação | Por quê |
| --- | --- | --- | --- |
| 1 | Medir a remoção de pasta "no cenário novo do arnês" | A medição é a **fase 3** do T-0011, com uma conferência que imprime o número e nunca reprova | Um `check` que falhasse ali cobraria uma correção que o D2 deixou de fora |
| 2 | — | A varredura vale para toda execução, não só para o cenário novo | É onde o defeito apareceu (T-0010) e custa o mesmo |
