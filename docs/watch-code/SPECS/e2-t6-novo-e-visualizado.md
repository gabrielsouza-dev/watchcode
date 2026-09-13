# SPEC — E2-T6 · Novo e visualizado

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T6 — Novo e visualizado |
| Workflow | High (contrato do evento, gravação no ledger e interface) |
| Etapa | SpecWriter (2 de 5) |
| Plano | [`docs/watch-code/PLANS/e2-t6-novo-e-visualizado.md`](../PLANS/e2-t6-novo-e-visualizado.md) |
| Entrada | O plano aprovado e a decisão D1 = A ("segue A") |
| Saída | Esta SPEC → etapa Developer |

## 1. Decisões

| Decisão | Escolha | O que ficou decidido |
| --- | --- | --- |
| D1 — superfície do selo do lote | **A** (aprovada pelo usuário) | Contador no título da view da timeline. A lista **não** é agrupada por sessão nesta tarefa — o agrupamento é entregável da E5-T3 |
| D2 — onde mora o selo | Decidida — óbvia | Campo `viewedAt` no próprio evento, gravado pelo ledger |
| D3 — quando a alteração vira visualizada | Decidida — óbvia | Quando ela se torna o evento ativo (`setActiveEvent`), inclusive quando o arquivo já não existe |
| D4 — onde a regra do lote é calculada | Decidida — óbvia | Função pura sobre a lista de eventos, no módulo do ledger, exposta pelo serviço de timeline |
| D5 — desenho do selo na linha | Decidida — local | Um ponto antes do nome, só na alteração nova; a visualizada não ganha marca |
| D6 — o que o número do título conta | Decidida — local | Lotes com alteração não visualizada ("2 new batches"), porque a descrição e o tooltip do `ViewPane` são o mesmo texto e o número precisa se explicar sozinho |
| D7 — evento antigo sem `viewedAt` | Decidida — óbvia | Conta como novo |

**Decisões locais tomadas durante a especificação** (técnicas, reversíveis e consistentes com o padrão do módulo):

- **L1 — a marca não dispara `onDidRecord`.** O aviso do ledger significa "uma alteração foi observada"; a marca é leitura do desenvolvedor. Quem avisa a interface é o serviço de timeline, com um evento próprio (`onDidMarkViewed`), e só quando a marca de fato aconteceu.
- **L2 — o instante da marca vem de quem chama.** `markViewed(eventId, timestamp)` recebe o instante, como `record` já recebe o do evento: mantém a decisão de tempo em um lugar só e deixa o teste determinístico, sem relógio falso.
- **L3 — a marca não mexe em nada além de `viewedAt`.** Hash, linhas, instante, sessão, origem e status do evento ficam exatamente como estavam.
- **L4 — quem desenha o selo é a linha, quem conta o lote é o serviço.** A linha carrega um booleano (`unviewed`); a contagem por lote sai do resumo do serviço. A view não recalcula regra nenhuma.
- **L5 — o ponto usa `--vscode-editorInfo-foreground`.** É o azul de "informação" já definido em todos os temas; `badge.background` é fundo de selo cheio e pesaria demais para um ponto de 8 px.

## 2. Comportamento esperado

### 2.1 O caminho do selo

```text
escrita externa
  → ledger.record ................................. evento gravado **sem** viewedAt: alteração nova
  → linha do tempo ................................ linha com ponto + título "1 new batch"

desenvolvedor vai até a alteração (F5, Shift+F5, clique, setas, Enter, duplo clique)
  → TimelineView.setActiveEvent ................... ponto único do evento ativo
  → TimelineService.markViewed(id) ................ ledger.markViewed(id, agora) grava viewedAt no evento
  → onDidMarkViewed ............................... linha perde o ponto, título recalculado
```

### 2.2 Tabela de comportamento

| # | Situação | Antes da E2-T6 | Depois da E2-T6 |
| --- | --- | --- | --- |
| 1 | Alteração chegando à lista | Linha igual a todas as outras | Linha com ponto, e o título ganha a contagem de lotes |
| 2 | Desenvolvedor vai até a alteração nova | Nada além do salto | `viewedAt` gravado no evento, ponto some, contagem cai |
| 3 | Vai de novo até a mesma alteração | Nada | **Nada é gravado**: a marca é idempotente |
| 4 | F5 percorrendo a sessão inteira | Salta por todas | Cada uma é marcada ao passar; o lote sai da contagem só quando a última for vista |
| 5 | Alteração cujo arquivo foi removido | Aviso "nada para abrir" | O aviso acontece **e** a marca é gravada: foi a leitura possível |
| 6 | Alteração que já virou `history` | Continua navegável | Marca igual: histórico também é lido |
| 7 | Evento gravado antes desta tarefa | Era uma linha comum | Conta como novo (ausente é "ninguém olhou") |
| 8 | Duas sessões, uma percorrida | — | Título passa de "2 new batches" para "1 new batch" |
| 9 | Última alteração nova vista | — | Título volta a "Timeline", sem descrição |
| 10 | App fechado e reaberto | — | Selos continuam: o dado está no evento, no disco, não na memória |

### 2.3 O campo novo do evento

| Campo | Valor |
| --- | --- |
| Nome | `viewedAt` |
| Tipo | `number` opcional, epoch em milissegundos |
| Quando existe | Da primeira vez que o desenvolvedor vai até a alteração; nunca muda depois |
| Quando falta | A alteração é **nova** |
| Quem escreve | `ChangeLedgerService.markViewed`, reescrevendo o JSON do próprio evento |
| Quem lê | A linha da lista (ponto), o resumo do serviço (contagem) e o teste manual (prova em disco) |

## 3. Contratos

### 3.1 `changeEvent.ts` — campo novo

```ts
export interface ChangeEvent {
	// ... campos atuais, sem alteração ...
	readonly status: ChangeEventStatus;
	/**
	 * Instante em que o desenvolvedor foi até esta alteração.
	 *
	 * Ausente é "ninguém olhou ainda". É o único campo do evento que a leitura
	 * do desenvolvedor escreve: todo o resto vem da observação do disco.
	 */
	readonly viewedAt?: number;
}
```

### 3.2 `timelineSummary.ts` — módulo novo

```ts
/** O que a linha do tempo tem, e quanto disso ainda não foi visto. */
export interface ITimelineSummary {
	/** Todas as alterações da lista. */
	readonly changes: number;
	/** Alterações que o desenvolvedor ainda não viu. */
	readonly unviewedChanges: number;
	/** Sessões (lotes) presentes na lista. */
	readonly sessions: number;
	/** Sessões com pelo menos uma alteração não vista. */
	readonly unviewedSessions: number;
}

/** Diz se a alteração ainda não foi vista. */
export function isUnviewed(event: ChangeEvent): boolean;

/**
 * Resume a lista de eventos em ordem cronológica.
 *
 * O lote é derivado, e não guardado: ele é o conjunto das alterações que
 * compartilham o `sessionId`, e só conta como visto quando **todas** estiverem.
 * Lista vazia devolve tudo zerado.
 */
export function summarizeTimeline(events: readonly ChangeEvent[]): ITimelineSummary;
```

### 3.3 `IChangeLedgerService` — método novo

```ts
	/**
	 * Marca uma alteração como visualizada, gravando o instante no próprio evento.
	 *
	 * Não é alteração observada: o aviso de gravação (`onDidRecord`) não sai daqui.
	 * Evento já marcado volta como está, sem nova escrita — o mesmo F5 repetido não
	 * gera escrita. Evento inexistente devolve `undefined`.
	 */
	markViewed(eventId: string, timestamp: number): Promise<ChangeEvent | undefined>;
```

Nada mais muda no ledger: `record`, `readAll`, `readByFile`, `readById`, `readCurrentUnder`, `recordSnapshot` e `readSnapshot` ficam como estão. A regra de atualidade (`current`/`history`), o índice por arquivo e os snapshots não são tocados.

### 3.4 `ITimelineService` — resumo, marca e aviso

```ts
	/** Resumo do que a lista tem: é o que alimenta o contador do título. */
	getSummary(): Promise<ITimelineSummary>;

	/**
	 * Marca a alteração como visualizada e mantém a lista em memória coerente.
	 *
	 * Devolve o evento como ficou, ou `undefined` quando o id não existe.
	 */
	markViewed(eventId: string): Promise<ChangeEvent | undefined>;

	/** Avisa quando uma alteração foi marcada como visualizada. */
	readonly onDidMarkViewed: Event<ChangeEvent>;
```

`getEvents`, `getEventsForFile`, `getEvent` e `onDidChange` ficam como estão. O status derivado (`withDerivedStatus`) continua valendo para a lista devolvida, e a marca não interfere nele.

### 3.5 `timelineRows.ts` — campo novo na linha

```ts
export interface TimelineRow {
	// ... campos atuais, sem alteração ...
	/** Verdadeiro enquanto o desenvolvedor não foi até esta alteração. */
	readonly unviewed: boolean;
}
```

### 3.6 `timelineBadge.ts` — módulo novo (texto do contador)

```ts
/**
 * Texto do contador do título: vazio quando não há lote novo, "1 new batch"
 * no singular e "N new batches" no plural.
 */
export function formatUnviewedBatches(count: number): string;
```

## 4. Alterações por arquivo

### 4.1 `src/vs/platform/changeLedger/common/changeEvent.ts`

Ganha `viewedAt` (§3.1). Nada mais muda: nem `ChangeSource`, nem `ChangeEventStatus`, nem `ChangeLineRange`.

### 4.2 `src/vs/platform/changeLedger/common/timelineSummary.ts` — **novo**

O módulo puro do §3.2. Sem serviço, sem disco e sem interface: recebe eventos e devolve números.

`summarizeTimeline` percorre a lista uma vez, guardando em um `Map` por `sessionId` se a sessão já tem alteração vista e se já tem alteração não vista; no fim, uma sessão conta como lote novo se tiver pelo menos uma não vista.

### 4.3 `src/vs/platform/changeLedger/common/changeLedgerService.ts`

`markViewed` (§3.3), implementado sobre o que já existe:

```ts
	async markViewed(eventId: string, timestamp: number): Promise<ChangeEvent | undefined> {
		const event = await this.readById(eventId);

		if (!event || event.viewedAt !== undefined) {
			return event;
		}

		const viewed = { ...event, viewedAt: timestamp };

		await this.writeEvent(viewed);

		return viewed;
	}
```

O `writeEvent` privado é o mesmo do `record` e do `demote`; nenhum caminho de escrita novo é criado.

### 4.4 `src/vs/platform/changeLedger/common/timelineService.ts`

- `getSummary()` sobre a lista carregada: `summarizeTimeline(await this.load())`.
- `markViewed(eventId)`: garante a carga, confere o que já está em memória (já vista, o serviço não chama o ledger), chama `ledger.markViewed(eventId, Date.now())`, troca a entrada correspondente na lista em memória e dispara `onDidMarkViewed`.
- `onDidMarkViewed` como `Emitter<ChangeEvent>` registrado no `Disposable` da classe, no mesmo padrão de `onDidChange`.
- A doc de classe continua valendo: é aqui que mora a regra; a view só pergunta.

### 4.5 `src/vs/workbench/contrib/watchCode/common/timelineRows.ts`

`buildTimelineRows` passa a preencher `unviewed: event.viewedAt === undefined`. Nada mais muda na conversão.

### 4.6 `src/vs/workbench/contrib/watchCode/common/timelineBadge.ts` — **novo**

`formatUnviewedBatches` (§3.6), com `localize` do módulo `nls` e as duas mensagens (singular e plural). Zero devolve string vazia, para o título não ter descrição nenhuma.

### 4.7 `src/vs/workbench/contrib/watchCode/browser/timelineView.ts`

1. O template da linha ganha um `span.badge` antes do nome; `renderElement` mostra o ponto só quando `element.unviewed`, e o tooltip e o `aria-label` ganham a marca de "nova".
2. A view escuta `onDidMarkViewed` e, para o evento marcado: atualiza o mapa de eventos, reconstrói aquela linha (`buildTimelineRows([event])`), troca a linha na lista com `splice` e atualiza o título.
3. `setActiveEvent` chama `void this.markViewed(id)` depois de avisar quem observa; `markViewed` engole a falha de gravação (a navegação não depende do selo) e não espera resposta.
4. `refreshTitle()`: `getSummary()` e `updateTitleDescription(formatUnviewedBatches(summary.unviewedSessions))`, chamado depois da carga, a cada evento novo acrescentado e a cada marca.
5. `renderState()` continua tratando vazio e erro, sem mudança.
6. A **carga da lista passa para a construção da view** (`void this.load()` no construtor), e não
   fica só no `renderBody`. É o que faz o contador valer com a lista recolhida: a view nasce
   recolhida, e sem isso os eventos ficavam numa fila interna esperando a abertura, deixando o
   título vazio justamente quando ele é a única coisa visível. O `renderBody` continua chamando
   `load()`, que é idempotente.

### 4.8 `src/vs/workbench/contrib/watchCode/browser/media/timelineView.css`

Estilo do ponto: pequeno, na cor de informação, com a classe `.hidden` escondendo-o nas linhas já vistas — no mesmo padrão de `.hidden` que a lista e a mensagem já usam.

### 4.9 Ajustes exigidos por compilação

- `src/vs/platform/changeLedger/test/common/timelineService.test.ts`: o dublê `GatedLedger` implementa `IChangeLedgerService` e ganha `markViewed` delegando ao ledger de verdade.
- `src/vs/workbench/contrib/watchCode/test/common/timelineRows.test.ts`: as três conferências de linha inteira (`deepStrictEqual`) ganham o campo `unviewed`.

### 4.10 `docs/watch-code/e2e/run-manual-tests.ts`

Cenário **T-0012**, com ajudantes novos para ler o selo das linhas e a descrição do título. Nenhum cenário existente muda de comportamento.

## 5. Casos de borda e tratamento de erro

| # | Caso | Comportamento |
| --- | --- | --- |
| B1 | `markViewed` de id que não existe no ledger | Devolve `undefined`; nada é gravado e nenhum aviso sai |
| B2 | `markViewed` de evento já marcado | Sem escrita; devolve o evento como está e **não** dispara `onDidMarkViewed` |
| B3 | JSON do evento ilegível no disco | `readById` devolve `undefined`; a marca não acontece e a navegação segue |
| B4 | Gravação da marca falha (disco cheio, permissão) | A view engole o erro: a alteração continua nova e a próxima visita tenta de novo |
| B5 | Marca pedida antes de a lista carregar | `markViewed` do serviço espera a carga (`load()`) e só então decide |
| B6 | Marca e `record` do mesmo arquivo ao mesmo tempo | O evento marcado é outro id; a troca na lista é por id, então nada é sobrescrito |
| B7 | Dois gestos rápidos na mesma alteração | O segundo não acha nada a gravar (B2): uma escrita, um aviso |
| B8 | Lote com três alterações, duas vistas | O lote continua novo; as duas linhas vistas perdem o ponto |
| B9 | Lista vazia | Resumo todo zerado e título sem descrição |
| B10 | `sessionId` repetido em instantes distantes | É o mesmo lote: a regra é por `sessionId`, não por proximidade |
| B11 | Alteração nova chegando enquanto a lista está carregada | Ganha ponto e entra na contagem, pelo mesmo caminho de `append` que já existe |
| B12 | Linha fora da área visível (lista virtualizada) | Não tem DOM; nada a fazer — o selo é do dado, e volta a aparecer quando a linha é desenhada |
| B13 | Arquivo da alteração removido do workspace | A marca é gravada mesmo assim (a visita aconteceu e o aviso foi mostrado) |

## 6. Plano de testes

### 6.1 Unidade — `timelineSummary.test.ts` (novo, 6 casos)

Lista vazia; uma alteração nova; um lote com todas as alterações vistas; um lote com uma pendente; dois lotes, um visto e outro não; contagem de alterações e de alterações novas.

### 6.2 Unidade — `changeLedgerService.test.ts` (3 casos novos)

O `viewedAt` chega ao disco (lido por `readById` depois de reler o serviço); a segunda marca não muda o instante nem reescreve; a marca não altera nenhum outro campo (comparação do evento inteiro); id inexistente devolve `undefined`.

### 6.3 Unidade — `timelineService.test.ts` (4 casos novos + dublê)

`getSummary` conta lotes novos em uma lista com eventos de duas sessões; `markViewed` grava no ledger e a lista em memória passa a devolver a alteração vista; `markViewed` de id inexistente devolve `undefined`; `onDidMarkViewed` avisa uma vez por marca e não avisa na repetida.

### 6.4 Unidade — `timelineRows.test.ts` (2 casos novos + 3 ajustados)

A alteração sem `viewedAt` sai como nova; a com `viewedAt` sai como vista; as três conferências de linha inteira ganham o campo.

### 6.5 Unidade — `timelineBadge.test.ts` (novo, 3 casos)

Zero devolve vazio; um devolve o singular; três devolvem o plural.

### 6.6 Manual — `run-manual-tests.ts`, cenário T-0012

Registrado em `docs/watch-code/testes-manuais.md`, com arquivos de código (`.ts`, `.js`, `.cs`). Quatro fases, todas conferidas no app de verdade:

1. **Nasce novo.** Escrita externa em `marcador.ts` com o app aberto: a linha aparece com o selo, o título mostra um lote novo a mais, e o JSON do evento no disco **não** tem `viewedAt`.
2. **Vai até ela.** F5 (e, em outra alteração, o clique na linha): o selo some daquela linha, a contagem do título cai, e o JSON do evento no disco passa a ter `viewedAt` — é a prova de que o selo sobrevive ao fechamento do app.
3. **Lote inteiro.** Duas sessões separadas pela pausa do agrupador, com uma alteração cada: o título conta dois lotes novos; percorrer uma delas deixa o título com um.
4. **Medição (não reprova):** quantas linhas a lista mostra com selo logo ao abrir, antes de qualquer visita, quando já existe histórico.

A sonda de aquecimento do arnês (`aquecimento.ts`) escreve antes de o cenário começar, então **toda conferência de contagem é por diferença**, nunca comparando com zero.

### 6.7 Níveis e comandos

```powershell
npm run transpile-client
npm run test-node -- --runGlob "**/changeLedger/test/**/*.test.js"
npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"
npm run typecheck-client
npx eslint <arquivos tocados>
npm run valid-layers-check
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0012
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts
```

## 7. Critérios de aceite

1. `ChangeEvent.viewedAt` existe, opcional e documentado em português; evento sem o campo é alteração nova.
2. `markViewed` grava o instante no JSON do próprio evento, sem tocar em nenhum outro campo.
3. Marcar duas vezes não gera segunda escrita nem segundo aviso.
4. `markViewed` de id inexistente devolve `undefined` sem gravar.
5. `summarizeTimeline` acerta os quatro números com lista vazia, com um lote e com vários.
6. Lote com todas as alterações vistas não conta como novo; com uma pendente, conta.
7. `TimelineService.getSummary` responde sobre a lista em memória, sem reler o disco a cada pergunta.
8. `TimelineService.markViewed` deixa a lista devolvida por `getEvents` com o `viewedAt` atualizado.
9. `onDidMarkViewed` avisa quem observa, uma vez por marca.
10. A linha da lista diz se a alteração é nova, e a lista mostra o ponto só nas novas.
11. Ir até uma alteração nova grava a marca; ir até uma já vista não grava nada.
12. O título mostra a contagem de lotes com alteração nova e fica sem descrição quando não há nenhum.
13. O `current`/`history` derivado pela timeline não muda por causa da marca.
14. T-0012 registrado em `testes-manuais.md` com as seis partes exigidas, executado de fato e com resultado obtido real.
15. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e `npm run valid-layers-check` saem com código 0.
16. As suítes do `changeLedger` e do `watchCode` saem verdes, com as contagens novas anotadas no `overview.md`.
17. O arnês inteiro passa, e o log do produto não traz erro nem aviso do `[watchCode]`.

## 8. Divergências encontradas na execução

Nada aqui mudou o produto além do que a SPEC previa. As divergências são de detalhe e estão
registradas sem apagar o que foi previsto.

| # | Previsto | Executado | Motivo |
| --- | --- | --- | --- |
| 1 | Três conferências de linha inteira em `timelineRows.test.ts` ajustadas | **Uma** ajustada (`um evento vira uma linha`) | As outras duas conferências leem campos isolados (`row.id`, `row.attribution`), e não a linha inteira |
| 2 | O teste manual confere a contagem do título direto | Foi preciso um ajudante novo, `waitForTitleBatches`, que espera o título chegar ao número esperado | A marca e a contagem são assíncronas em relação à escrita no ledger: ler o título logo depois do `waitUntilQuiet` dava corrida |
| 3 | O cenário vai até as alterações clicando nas linhas | As fases 3 e 4 andam com **F5** e **Shift+F5** | A lista é virtualizada e **não desenha a linha fora da área visível**: o clique por índice caiu na linha errada e a primeira execução reprovou em três conferências. O produto não foi tocado — o defeito era do cenário |
| 4 | A fase 5 compara a lista inteira com o ledger | Compara **cada linha desenhada** com o ledger | Mesma causa do item 3: a linha que ficou fora da área visível não existe no DOM, e comparar totais acusaria divergência onde não há |
| 5 | O ponto é escondido com a classe `.hidden` | A classe existe, mas esconde por `visibility`, e não por `display` | O espaço do ponto fica reservado em **toda** linha: sem isso os ícones dos arquivos ficariam desalinhados entre as linhas novas e as vistas |
| 7 | A carga da lista acontece quando o corpo é desenhado | O **Tester achou um defeito de verdade**: a conferência nova da fase 0 do T-0012 mostrou que, com a view recolhida, o título vinha **vazio** — a lista só era lida quando o corpo aparecia. Corrigido voltando à etapa Developer: a carga passou para a construção da view (§4.7, item 6) | O entregável é ver de relance quantos lotes têm coisa nova, e a lista nasce recolhida (`collapsed: true`): um contador que só aparece com a lista aberta não serve para nada |
| 8 | A SPEC não previa conferência com a view recolhida | A fase 0 do T-0012 passou a conferir o título **antes** de expandir a view | É a conferência que dá sentido à decisão D1 — e foi ela que pegou o defeito do item 7 |
| 6 | — | A primeira execução do T-0012 morreu na subida, com `a observacao nao registrou nem o arquivo de sonda` | Instabilidade de subida já registrada no T-0007 (E1-T8) e no T-0011 (E1-T9): o app sobe com a observação morta, sem linha nenhuma do produto no log. Rodado de novo, passou inteiro. Não tem relação com esta tarefa |

**Contagens de teste.** A suíte do `changeLedger` foi de **144 para 158** casos (7 do módulo novo
`timelineSummary`, 4 do serviço de timeline e 3 do ledger) e a do `watchCode` de **40 para 45**
(3 do módulo novo `timelineBadge` e 2 das linhas).

**O que a tarefa deixou medido:** com a lista virtualizada, o ponto só existe para as linhas que a
lista desenhou. Não é defeito — é o mesmo comportamento de qualquer lista do VS Code —, mas é a
razão de a conferência de conferência cruzada do T-0012 ser por linha desenhada. Fica registrado
para a E2-T7, que vai decorar arquivos no Explorer e tem o mesmo limite.
