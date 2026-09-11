# SPEC — E1-T9 · A pasta removida leva junto os arquivos que a observação conhece sob ela

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T9 — A pasta removida leva junto os arquivos que a observação conhece sob ela |
| Workflow | High (mexe no que o gravador grava e no contrato de leitura do ledger) |
| Etapa | SpecWriter (2 de 5) |
| Plano | [`docs/watch-code/PLANS/e1-t9-pasta-removida-leva-os-arquivos.md`](../PLANS/e1-t9-pasta-removida-leva-os-arquivos.md) |
| Entrada | O plano aprovado e a execução do T-0011 na E1-T8 |
| Saída | Esta SPEC → etapa Developer |

## 1. Decisões aprovadas

| Decisão | Escolha | O que ficou decidido |
| --- | --- | --- |
| D1 — onde resolver | **A** | No produto, depois do fato: o gravador fecha os arquivos que o ledger conhece sob a pasta removida. O `coalesceEvents` do core fica intocado |
| D2 — de onde sai a lista | **A** | Do ledger, por uma consulta nova que lê o índice por caminho (`indexDir`). Enumerar a árvore do `HEAD` (`git ls-tree`) fica fora desta tarefa e vira tarefa própria se você quiser |
| D3 — o ledger como prova | **A** | Conhecer arquivos sob um caminho prova que o caminho era pasta, e a prova entra **depois** das duas provas diretas da E1-T8 |
| D4 — como provar | **A** | As duas medições das fases 3 e 4 do T-0011 viram conferências; o reinício do app fica coberto por teste de unidade, sem ajudante novo no arnês |

**Decisões locais tomadas durante a especificação** (técnicas, reversíveis e consistentes com o padrão do módulo, conforme o `CLAUDE.md`):

- **L1 — prova direta vence prova indireta.** A pergunta ao ledger só acontece quando a memória e o git **não** responderam "arquivo" ao caminho. Um filho antigo no ledger nunca engole a remoção de um arquivo de verdade — é o que resolve o caso do caminho que já foi pasta e virou arquivo.
- **L2 — o fechamento dos filhos passa pela fila pública de gravação**, para herdar a serialização por arquivo, o baseline, a sombra e a supressão da entrega repetida, com uma marca interna de "já provado arquivo" que evita repetir a decisão de pasta para cada filho.
- **L3 — consulta só quando precisa.** Arquivo removido não paga varredura nenhuma: o caminho provado arquivo (memória ou git) segue direto para a gravação.

## 2. Comportamento esperado

### 2.1 O que a remoção passa a fazer

```text
remoção de src/pacote (que a observação sabe ser pasta)
  1. prova direta  → memória (folders) ou git (HEAD = tree) ......... é pasta
  2. pergunta ao ledger: quem existe sob src/pacote? ............... regra.ts (current, com afterHash)
  3. grava a remoção de src/pacote/regra.ts ........................ afterHash ausente, antes do baseline
  4. devolve undefined ............................................ a pasta não vira evento
```

Sem a prova direta, o passo 2 passa a ser também a **terceira prova**: se o ledger conhece arquivo sob o
caminho, o caminho era pasta — e a decisão da E1-T8 (não virar evento) vale para ele.

### 2.2 Tabela de comportamento

| # | O que chega ao gravador | O que acontece | Muda em relação a hoje |
| --- | --- | --- | --- |
| 1 | Remoção de pasta provada pasta (memória ou git) que tem arquivo conhecido sob ela | Um evento de remoção por arquivo conhecido; a pasta não vira evento | **Sim** — hoje os arquivos ficam "atuais" para sempre na linha do tempo |
| 2 | Remoção de pasta sem filho nenhum no ledger | A pasta não vira evento (como na E1-T8) | Não |
| 3 | Remoção de caminho que a memória ou o git dizem ser **arquivo** | Gravação normal da remoção; nenhuma pergunta ao ledger | Não |
| 4 | Remoção de caminho sem prova direta, mas com arquivo conhecido no ledger sob ele | O filho é fechado e o caminho **não** vira evento | **Sim** — hoje vira evento de pasta (linha fantasma) |
| 5 | Remoção de caminho sem prova direta e sem filho no ledger | Gravação normal, como antes da E1-T8 | Não |
| 6 | Filho conhecido cujo evento atual já é uma remoção | Ignorado: não ganha segunda remoção | Não (já era assim para o caminho) |
| 7 | Filho conhecido sob pasta aninhada (`src/pacote/sub/x.ts`) | Fechado igual | **Sim** |
| 8 | Arquivo de outra pasta que só começa com o mesmo texto (`src/pacote2/x.ts`) | Intocado | Não |

### 2.3 O evento do filho fechado

| Campo | Valor |
| --- | --- |
| `fileUri` | o caminho do filho, como o ledger o guarda (relativo à pasta do workspace, com `/`) |
| `sessionId` | o da remoção da pasta — os dois aparecem juntos na mesma sessão da linha do tempo |
| `timestamp` | o da remoção da pasta |
| `source` / `attribution` | `agent` / `observed`, como a remoção da pasta traria |
| `beforeHash` | do baseline de sempre: git `HEAD` e, quando o git não tem, a sombra (o último conteúdo observado) |
| `afterHash` | **ausente** — é uma remoção |
| `linesChanged` | ausente, como em toda remoção (`changedLines.ts:23`: sem arquivo depois não há linha para apontar) |
| `status` | `current` (o ledger rebaixa o evento anterior do arquivo a `history`) |

## 3. Contratos

### 3.1 Novo em `IChangeLedgerService`

``ts
/**
 * Eventos atuais dos arquivos que o ledger conhece **sob** um caminho.
 *
 * O próprio caminho não entra na resposta: quem pergunta quer saber quem estava
 * dentro dele. É o que a remoção de uma pasta precisa para fechar os arquivos
 * que ela levou junto — o watcher do core colapsa os DELETED dos filhos, e o
 * ledger é o único lugar onde a lista ainda existe.
 *
 * Devolve um evento por arquivo, com o `currentEventId` do índice por caminho.
 */
readCurrentUnder(folderUri: string): Promise<readonly ChangeEvent[]>;
```

Regras da comparação de caminho, iguais às do índice (`ledgerStorage.ts`):

1. O caminho é normalizado antes de comparar: `trim`, `\\` → `/` e sem o prefixo `./`.
2. É filho quem **começa com o caminho mais o separador** (`src/pacote/`), ou o próprio caminho
   quando ele for uma pasta igual à consultada (o caso do neto: `src/pacote/sub/x.ts`).
3. `src/pacote2/x.ts` não entra — o separador é o que separa pasta de prefixo de texto.
4. Ordem cronológica crescente (`compareEvents`), como as outras leituras do ledger.
5. Índice ilegível ou ausente é ignorado, como em `readIndex`.

### 3.2 Contratos existentes que **não** mudam

| Contrato | Situação |
| --- | --- |
| `ChangeEvent` | Sem campo novo. A remoção continua sendo o evento sem `afterHash` |
| `IObservedChange` | Sem campo novo |
| `recordChange(change): Promise<ChangeEvent \| undefined>` | A assinatura é a mesma; a documentação passa a dizer que a remoção de pasta também fecha os arquivos conhecidos sob ela |
| `WorkspacePathKindReader` / `readKind` do `GitHeadReader` | Sem mudança |
| `IShadowStore`, `ISnapshotStore`, `BaselineProvider` | Sem mudança |

### 3.3 Export novo em `ledgerStorage.ts`

`normalizeFilePath` passa a ser exportada (hoje é privada e usada só por `fileKey`): a consulta nova
precisa da **mesma** normalização do índice, e reimplementá-la seria duplicar a regra que dá nome aos
arquivos do índice.

## 4. Alterações por arquivo

### 4.1 `src/vs/platform/changeLedger/common/ledgerStorage.ts`

```ts
/** Normaliza o caminho: separadores uniformes e sem prefixo relativo. */
export function normalizeFilePath(fileUri: string): string {
```

Só o `export`. Nenhuma linha de comportamento muda.

### 4.2 `src/vs/platform/changeLedger/common/changeLedgerService.ts`

1. `IChangeLedgerService` ganha `readCurrentUnder` (§3.1), documentado no padrão do arquivo.
2. `ChangeLedgerService.readCurrentUnder(folderUri)`:

```ts
async readCurrentUnder(folderUri: string): Promise<readonly ChangeEvent[]> {
	const target = normalizeFilePath(folderUri);
	const prefix = target + '/';
	const events: ChangeEvent[] = [];

	for (const index of await this.readIndexes()) {
		const fileUri = normalizeFilePath(index.fileUri);

		// O vizinho de prefixo fica de fora: o separador é o que separa pasta de texto.
		if (fileUri !== target && !fileUri.startsWith(prefix)) {
			continue;
		}

		const event = index.currentEventId ? await this.readById(index.currentEventId) : undefined;

		if (event) {
			events.push(event);
		}
	}

	return events.sort(compareEvents);
}
```

3. `readIndexes(): Promise<IFileIndex[]>` privado: lê `layout.indexDir` e devolve os índices legíveis,
   ignorando o ilegível e o que não for `.json` (o mesmo cuidado de `readAllEvents`).
4. `readIndex(fileUri)` passa a usar o mesmo `parseIndex` privado que o `readIndexes` usa, para não
   haver duas leituras de índice no arquivo.

### 4.3 `src/vs/platform/changeLedger/common/changeRecorderService.ts`

O coração da tarefa. O bloco da remoção em `record()` (hoje linhas 187-191) passa a ser:

```ts
if (change.kind === 'deleted' && !knownFile) {
	const kind = await this.removedPathKind(resource, change.fileUri);

	// Só a pasta leva arquivos junto, e o ledger é quem sabe quais. O caminho
	// provado arquivo não paga pergunta nenhuma.
	if (kind !== 'file') {
		const files = await this.filesKnownUnder(change);

		if (files.length > 0) {
			await this.closeRemovedFiles(change, files);

			// Havia filho: o caminho era pasta, e pasta não é alteração.
			return undefined;
		}
	}

	if (kind === 'folder') {
		return undefined;
	}
}
```

Métodos privados novos, no lugar do `isFolder` atual:

```ts
/** O que o caminho removido era, segundo a memória da observação e o git. */
private async removedPathKind(resource: URI, fileUri: string): Promise<WorkspacePathKind>
```

- `folders` tem a chave → `'directory'` (prova da E1-T7/E1-T8, sem I/O).
- `lastEvents` tem a chave → `'file'` (nesta observação um arquivo foi lido nesse caminho, e a
  leitura de um arquivo apaga a marca de pasta — é a prova direta do outro lado).
- senão, `readPathKind(fileUri)`; `'directory'` fica guardado em `folders` para as próximas
  entregas da mesma remoção, como já acontece hoje.

```ts
/** Os arquivos que o caminho removido levou junto, segundo o ledger. */
private async filesKnownUnder(change: IObservedChange): Promise<readonly string[]>
```

- Pergunta `ledger.readCurrentUnder(change.fileUri)`.
- Descarta quem já está removido (`afterHash === undefined`): aquele arquivo já saiu, e uma segunda
  remoção seria um evento a mais para a mesma coisa.
- Devolve os `fileUri` restantes, na ordem do ledger.

```ts
/** Grava a remoção de cada arquivo que a pasta levou junto. */
private async closeRemovedFiles(change: IObservedChange, files: readonly string[]): Promise<void>
```

- Para cada arquivo, entra na fila por arquivo e grava com `knownFile = true` (L2).

E a estrutura da fila separa o público do interno:

```ts
async recordChange(change: IObservedChange): Promise<ChangeEvent | undefined> {
	return this.enqueue(change, false);
}

/** Fila por arquivo: as entregas da mesma escrita não podem se cruzar. */
private async enqueue(change: IObservedChange, knownFile: boolean): Promise<ChangeEvent | undefined>
```

`record(resource, change, knownFile)` — o `knownFile` só desliga a decisão de pasta; todo o resto
(baseline, snapshots, dedup por `afterHash`, sombra, `lastEvents`) é o caminho de sempre.

A documentação de `IChangeRecorderService.recordChange` ganha o parágrafo novo: a remoção de uma
pasta fecha os arquivos que ela levou junto, um evento por arquivo, e a pasta continua não virando
evento.

### 4.4 `src/vs/platform/changeLedger/test/common/timelineService.test.ts`

O dublê `GatedLedger` (linha 65) implementa `IChangeLedgerService` e passa a precisar do método novo:

```ts
readCurrentUnder(folderUri: string): Promise<readonly ChangeEvent[]> {
	return this.inner.readCurrentUnder(folderUri);
}
```

### 4.5 Testes

- `changeLedgerService.test.ts`: dois testes para `readCurrentUnder` (§6.1).
- `changeRecorderService.test.ts`: sete testes (§6.2) e o ajuste do teste
  `a pasta com arquivo dentro é reconhecida sem consultar o git`, que passa a conferir também o
  fechamento do filho.
- `docs/watch-code/e2e/run-manual-tests.ts`: T-0011, fases 3 e 4 (§6.3).

## 5. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | Pasta removida com filho em subpasta (`src/pacote/sub/x.ts`) | A consulta é por prefixo, então o neto entra; o fechamento é de todos os arquivos conhecidos sob a pasta |
| B2 | Vizinho de prefixo (`src/pacote2/x.ts` quando a pasta é `src/pacote`) | Fora da consulta: a comparação exige o separador (`src/pacote/`) |
| B3 | Filho cujo evento atual já é remoção | Fica de fora de `filesKnownUnder`; nenhum segundo evento |
| B4 | O mesmo caminho em duas pastas do workspace | O `folderUri` do evento manda, como em todo o gravador; o caminho relativo é resolvido contra ele |
| B5 | Caminho que já foi arquivo e tem filho antigo no ledger | A prova direta (memória ou git) responde primeiro e o ledger nem é consultado (L1) |
| B6 | Caminho com caixa diferente entre o evento e o ledger (Windows) | Fora do escopo: é o mesmo pressuposto de `readByFile` e da timeline, que comparam sem baixar a caixa. Fica registrado como limitação conhecida |
| B7 | Falha ao gravar um dos filhos | O erro sobe, o watcher registra `[watchCode] failed to record <pasta>` e a pasta não vira evento; uma nova entrega da mesma remoção tenta de novo, porque os filhos que falharam continuam com `afterHash` |
| B8 | Remoção repetida da mesma pasta | O segundo veredito vem da memória; os filhos já estão removidos e ficam de fora — nada é gravado de novo |
| B9 | Índice do ledger ausente, vazio ou ilegível | Lista vazia: nenhum filho é fechado e a decisão da pasta segue pelas provas diretas, exatamente como hoje |
| B10 | Pasta removida com observação desligada | Fora do escopo: sem observação não há evento nenhum, e não há varredura na volta (E1-T5) |
| B11 | Pasta raiz do workspace removida | Fora do escopo: o caminho relativo sai vazio e o watcher já descarta (`workspaceWatcherService.ts:206`) |

## 6. Plano de testes

### 6.1 Unidade — `changeLedgerService.test.ts` (2 testes novos)

1. **`o ledger devolve os arquivos que estão sob um caminho`** — três arquivos gravados
   (`src/pacote/regra.ts`, `src/pacote/sub/antigo.ts`, `src/pacote2/vizinho.ts`) e mais um fora
   (`src/outra/fora.ts`): a consulta por `src/pacote` devolve os dois primeiros, na ordem
   cronológica, e nenhum dos outros.
2. **`a consulta devolve o evento atual de cada arquivo`** — um arquivo com duas alterações: a
   consulta devolve um evento só, e é o segundo (o mais recente).

### 6.2 Unidade — `changeRecorderService.test.ts` (7 testes novos + 1 ajustado)

| Teste | O que prova |
| --- | --- |
| `a pasta removida fecha o arquivo que ela levou` | O filho ganha um segundo evento, sem `afterHash`, com a mesma `sessionId` e o mesmo `timestamp` da remoção; a pasta não ganha evento nenhum; o `beforeHash` do filho é o conteúdo que a sombra guardou |
| `a pasta removida fecha o arquivo que a sessão anterior conheceu` | Um segundo gravador sobre o mesmo ledger (memória vazia, índice cheio): o filho é fechado igual |
| `o arquivo que já tinha sido removido não é fechado de novo` | Remoção do arquivo primeiro, remoção da pasta depois: o arquivo tem duas entradas no total (criação e remoção), não três |
| `o vizinho com o mesmo prefixo não é tocado` | Com `src/pacote2/x.ts` conhecido, remover `src/pacote` não mexe nele |
| `o arquivo que a observação nunca viu sob a pasta não vira evento` | Pasta provada pasta pelo git, ledger sem filho: nenhum evento é inventado |
| `o arquivo sob a subpasta também é fechado` | Filho em subpasta da pasta removida entra no fechamento |
| `a prova direta vence o filho antigo do ledger` | O caminho foi arquivo (evento lido nesta observação) e o ledger ainda tem filho antigo: a remoção é gravada como arquivo e o filho antigo não é tocado |
| *(ajuste)* `a pasta com arquivo dentro é reconhecida sem consultar o git` | Continua sem consultar o git (nenhuma chamada ao leitor de tipo) e passa a conferir que o filho foi fechado — o mesmo cuidado que a E1-T8 teve ao não perder a prova da memória |

### 6.3 Manual — `run-manual-tests.ts`, cenário T-0011

- **Fase 3 vira conferência** (hoje é medição que nunca reprova), em três conferências:
  - `fase 3: o arquivo de dentro vira evento de remocao` — `eventsOf(FOLDER_FILE).length === 2` e o
    último evento tem `afterHash === undefined`;
  - `fase 3: a remocao do arquivo e a da pasta acontecem juntas` — o cenário guarda `Date.now()`
    imediatamente antes do `rmSync` da pasta e confere que o `timestamp` do evento do filho não é
    anterior a ele (a pasta não grava evento, então o instante é o que liga os dois);
  - `fase 3: a linha do tempo ganha a linha da remocao` — `timelineRowNames` passa a ter duas linhas
    com o nome do arquivo, provando na view o que o ledger já provou.
- **Fase 4 continua medição, com o nome ajustado** para dizer o que ela mede agora:
  `medicao (nao reprova): fase 4, o arquivo rastreado que a observacao nunca leu` — o número
  esperado segue `0`, porque a lista do produto é o que a observação conhece; o caso está
  registrado como limitação (a enumeração da árvore do `HEAD` ficou fora do escopo).
- **Fase 5 continua medição** (`pasta vazia=1`, resíduo da E1-T8).
- A varredura transversal do log continua valendo para o cenário inteiro.

### 6.4 Níveis e comandos

| Nível | Comando |
| --- | --- |
| Unidade do módulo | `npm run test-node -- --runGlob "**/changeLedger/test/**/*.test.js"` |
| Unidade do módulo git | `npm run test-node -- --runGlob "**/git/test/**/*.test.js"` |
| Manual (cenário só) | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0011` |
| Manual (arnês inteiro) | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts` |
| Tipos, lint e camadas | `npm run typecheck-client`, `npx eslint <arquivos>`, `npm run valid-layers-check` |

## 7. Critérios de aceite

1. Remover uma pasta que contém arquivo conhecido grava **um evento por arquivo conhecido** sob ela, sem `afterHash`, com a sessão e o instante da remoção e o `beforeHash` do baseline de sempre.
2. A pasta removida continua **não** virando evento.
3. O filho cujo evento atual já é remoção não ganha um segundo evento.
4. O vizinho cujo caminho só começa com o mesmo texto não é tocado.
5. Arquivo que a observação nunca viu sob a pasta não vira evento: nada é inventado.
6. O filho conhecido por uma sessão anterior (memória vazia, ledger cheio) é fechado igual.
7. Caminho provado arquivo pela memória ou pelo git grava a remoção como hoje, sem consultar o ledger.
8. Sem prova direta e sem filho no ledger, a remoção continua sendo gravada como era antes da E1-T8.
9. Depois da remoção da pasta, o último evento de cada arquivo que ela levou é uma remoção — a linha do tempo não tem mais arquivo "atual" que não existe no disco.
10. `readCurrentUnder` devolve o caminho e o que está sob ele, ignora o vizinho de prefixo e devolve o evento atual de cada arquivo.
11. Os testes do módulo `changeLedger` passam com o total novo, e os testes de `git` seguem verdes.
12. No T-0011 as conferências da fase 3 ficam verdes, a fase 4 e a fase 5 seguem medidas, e o cenário inteiro passa.
13. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e `npm run valid-layers-check` sem erro.
14. `docs/watch-code/testes-manuais.md` registra a execução nova do T-0011, acrescentada sem apagar a anterior.
15. `docs/watch-code/Workflow/overview.md` fica com a E1-T9 em `feito`, o total de testes do módulo e o que sobrar de resíduo registrado.
16. Nenhum arquivo fora do escopo da tarefa foi tocado.

## 8. Divergências encontradas na execução

*(Preenchido pelo Developer e pelo Tester.)*

1. **A consulta não podia incluir o próprio caminho.** A primeira versão de `readCurrentUnder`
   aceitava `fileUri === target` "por segurança", contradizendo a §3.1 — e o teste
   `reads the files under a path` reprovou exatamente por isso, devolvendo o evento do próprio
   `src/pacote`. A comparação ficou só com o prefixo (`src/pacote/`), como especificado.
2. **Os testes de fechamento precisaram de instantes distintos.** A §6.2 não previu que o
   `readByFile` ordena por `timestamp` e desempata pelo `id` — um UUID aleatório. Com a criação e
   a remoção no mesmo instante (`TIMESTAMP`), "o último evento do arquivo" saía ora a remoção, ora
   a criação, e três testes falharam de forma intermitente. A remoção da pasta passou a usar
   `TIMESTAMP + 1` nos testes que leem o último evento. No produto isso não acontece: a remoção
   chega sempre depois da criação.
3. **O dublê `GatedLedger` entrou na implementação.** A §4.4 previu o ajuste, e ele foi feito na
   etapa Developer porque sem ele o projeto não typechecka — não é teste de validação, é
   obrigação de compilação.
4. **O tipo do auxiliar `observedChange` ganhou `timestamp`.** O `npm run typecheck-client`
   reprovou os quatro testes novos que passam instante próprio, porque o `Partial<>` do auxiliar
   não declarava o campo. O campo foi acrescentado ao tipo do auxiliar no arquivo de teste.
5. **O arnês ganhou um ajudante.** A §6.3 pediu a conferência da linha do tempo para a remoção, e
   não existia como esperar a **segunda** linha do mesmo arquivo: `waitForTimelineRow` para na
   primeira. Nasceu `waitForTimelineRows(page, file, total)`, no mesmo formato do existente.
6. **A primeira execução do cenário morreu na subida do app.** `a observacao nao registrou nem o
   arquivo de sonda (aquecimento.ts)`, sem nenhuma linha do produto no log do perfil e com dois
   erros de registro de view no `renderer.log`. Rodado de novo, o cenário passou inteiro, e a
   execução do arnês inteiro também. É a mesma instabilidade de subida vista no T-0007 durante a
   E1-T8; o episódio está registrado no `testes-manuais.md`.
