# Plano — E2-T1 · Serviço de timeline

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T1 — Serviço de timeline |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E2 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e2-t1-servico-de-timeline.md |

## 1. Objetivo

Dar à interface uma **única porta de leitura** da linha do tempo: consultas em
ordem cronológica, filtro por arquivo, o cálculo de `current`/`history` e um
evento que avisa quando a linha do tempo muda.

Em uma frase: **o ledger grava; a timeline conta a história — e avisa quem está
olhando quando ela muda.**

## 2. Escopo

### Entra

1. Contrato `ITimelineService`, com consultas de leitura sobre o ledger.
2. Ordem cronológica crescente nas consultas (o desempate já é estável).
3. Cálculo de `current`/`history` por arquivo, no momento da consulta.
4. Filtro por arquivo e busca por id de evento.
5. Estado observável: um evento que avisa que a linha do tempo mudou, emitido
   quando o ledger grava.
6. Registro do serviço junto do ledger, no mesmo arquivo de registro que já
   existe.
7. Testes automatizados de tudo acima, na suíte do módulo.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| View, lista, árvore ou Activity Bar | A tarefa é o serviço; a superfície é a tarefa seguinte | **E2-T2** |
| Comandos Anterior/Próximo e keybindings | Dependem da lista e do evento ativo | **E2-T3** |
| Abrir o arquivo e revelar as linhas | Precisa de `IEditorService`, que é da camada de workbench | **E2-T4** |
| Agrupamento em sessões na interface | O `sessionId` já vem no evento; agrupar é outra tarefa | **E5-T3** |
| Selo de novo/visualizado | Muda o **contrato do evento** (campo gravado) | **E2-T6** |
| Conferir o hash do arquivo no disco para decidir `current`/`history` | É a regra de atualidade na prática, com aviso na interface | **E5-T1** |
| Recuperação do que foi escrito com a observação desligada | Limitação aceita na E1-T5; o ledger não vê o que não observou | — |
| Cálculo de diff, hunks e decorações | É a E3; a timeline entrega evento, não conteúdo | **E3-T1** |

### Fronteira com o ledger (E1-T2)

O ledger já sabe **gravar e ler** eventos, e já aplica a regra de atualidade no
ato da gravação (o anterior do mesmo arquivo é rebaixado para `history`). A
E2-T1 **não muda o ledger**: acrescenta a ele um aviso de gravação e coloca
sobre ele um serviço de consulta que deriva o status a partir do conjunto de
eventos. Nada do que já está gravado muda de forma ou de lugar.

## 3. Contexto

### O que já existe e será consumido

| Artefato | Papel na E2-T1 |
| --- | --- |
| `IChangeLedgerService.readAll()` | **A fonte.** Devolve todos os eventos do workspace, já ordenados por `timestamp` com o `id` como desempate (`compareEvents`). |
| `IChangeLedgerService.readByFile(fileUri)` | Já resolve o filtro por arquivo: usa o índice do arquivo e, sem ele, varre os eventos. |
| `IChangeLedgerService.readById(eventId)` | Busca pontual, devolvendo `undefined` quando não existe. |
| `ChangeLedgerService.record()` | **O único caminho de escrita.** Devolve `IRecordEventResult` com o evento gravado e o id do rebaixado. |
| `ChangeEvent.status` | Já é gravado (`current` na gravação, `history` no rebaixamento) — mas é um retrato do instante da gravação. |
| `ChangeEvent.fileUri` | Caminho **relativo ao workspace**, com separador `/`, produzido por `relativePath` no watcher. |
| `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts` | Onde `IChangeLedgerService`, `IWorkspaceWatcherService` e `IChangeRecorderService` são registrados; importado por `workbench.desktop.main.ts` (linha 80). |
| `src/vs/platform/changeLedger/test/common/` | Padrão de teste do módulo: `FileService` real sobre `InMemoryFileSystemProvider`, armazenamento isolado por teste e `ensureNoDisposablesAreLeakedInTestSuite`. |

### Fatos verificados no código do fork

- O `ChangeLedgerService` **não expõe evento nenhum** hoje: nenhum `Emitter` no
  arquivo. Quem quiser saber de uma gravação só descobre relendo o disco.
- O `record()` é o ponto único por onde passa todo evento gravado — o recorder é
  o único chamador, e o recorder é o único que fala com o ledger.
- `readAll()` faz uma leitura de arquivo por evento (`resolve` do diretório +
  `readById` de cada filho): é barato uma vez, caro a cada redesenho de lista.
- O índice por arquivo (`index/<chave>.json`) já guarda `currentEventId`, o que
  confirma que a regra "o último do arquivo é o atual" é a regra do produto.
- `linesChanged` é opcional no contrato e hoje o recorder não o preenche; a
  timeline não pode depender dele para ordenar nem para filtrar.

## 4. Dependências

- **E1-T6 (pronta)** — o ledger grava e lê eventos com antes/depois corretos; o
  arnês ponta a ponta prova doze invariantes.
- **E1-T2 (pronta)** — `IChangeLedgerService` com `readAll`, `readByFile` e
  `readById`.
- **E0-T4 (pronta)** — `contrib/watchCode` já existe para a interface da E2-T2,
  mas **não é tocado** nesta tarefa.
- **Nenhuma dependência nova.** O serviço usa `Event`/`Emitter` da base e os
  serviços de plataforma já disponíveis; não precisa de git, de watcher nem de
  hook.

## 5. Etapas

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | Avisar da gravação | `IChangeLedgerService` ganha `onDidRecord: Event<IRecordEventResult>`, emitido ao fim de `record()`, depois de gravar e de rebaixar |
| 2 | Criar o contrato | `ITimelineService` em `platform/changeLedger/common/timelineService.ts`, com as consultas e o evento |
| 3 | Carregar uma vez | Primeira consulta lê o ledger e guarda a lista em memória; as seguintes não tocam o disco |
| 4 | Derivar o status | Cada consulta devolve os eventos com `current`/`history` recalculados por arquivo |
| 5 | Consultar | Lista completa, lista por arquivo e busca por id, sempre em ordem crescente |
| 6 | Acompanhar | `onDidChange` avisa do evento acrescentado e do rebaixado; a lista em memória é atualizada na hora, sem reler o disco |
| 7 | Registrar o serviço | `registerSingleton(ITimelineService, ...)` no arquivo de registro do ledger |
| 8 | Testar | Suíte de unidade do módulo cobrindo carga, ordem, derivação, filtro, atualização e casos de borda |
| 9 | Validar | Suíte do módulo, `compile`, `eslint` e `hygiene` verdes |

## 6. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Duas fontes para o mesmo status (o gravado e o derivado) | Divergência silenciosa entre o que está no disco e o que a interface mostra | O status gravado continua sendo do ledger; a timeline é a **autoridade de leitura** e recalcula. Um teste cobre o caso de dois `current` gravados para o mesmo arquivo |
| Lista em memória envelhecendo | A interface mostra uma linha do tempo que não existe mais | O único caminho de escrita é o `record()`, e ele avisa; nada mais escreve no diretório de eventos. A carga inicial é uma leitura só, na primeira consulta |
| Custo da primeira consulta em histórico grande | Abertura lenta da view | É uma leitura por evento, uma vez por sessão da janela; o limite e a limpeza do armazenamento são da E5-T3 |
| Inscrição no evento sem descarte | Vazamento a cada janela aberta | O serviço é um `Disposable` e os testes usam `ensureNoDisposablesAreLeakedInTestSuite` |
| Mudança fora da observação (janela fechada, observação desligada) | A entrada continua `current` com o arquivo já diferente no disco | Limitação **aceita e documentada** na E1-T5; a conferência contra o disco é a **E5-T1** |

**Impacto arquitetural:** baixo e contido. Um arquivo novo em
`platform/changeLedger/common/`, **um** membro novo no contrato do ledger (um
evento) e uma linha de registro. Não altera o formato do evento gravado, o
ledger, o watcher, o recorder nem o baseline.

## 7. Decisões pendentes

### D1 — De onde sai o `current`/`history`

> **Aprovada: A.** O status é derivado do próprio ledger, sem ler o disco na
> consulta; a conferência contra o disco fica para a E5-T1. Decisão do usuário:
> "pode seguir suas recomendações".

**Recomendação: A.**

- **A.** Derivado do próprio ledger: por arquivo, o evento mais recente é
  `current` e os anteriores são `history`. Nenhuma leitura de disco na consulta.
- **B.** Conferido contra o disco a cada consulta: o evento só é `current` se o
  hash do arquivo no disco ainda for igual ao `afterHash`.

Por que A: a E1-T5 fixou que o que for escrito com a observação desligada **não
entra no ledger** — sem evento novo, a conferência contra o disco só produziria
um arquivo **sem** entrada atual, que é pior para quem navega do que uma entrada
desatualizada. Além disso, a conferência exige ler e hashear arquivos a cada
consulta, e a tarefa do guia que trata disso é literalmente a **E5-T1**
("transições `current`/`history` na prática, avisos na UI"). A derivação por A é
a mesma regra que o ledger já aplica ao gravar (o índice guarda o
`currentEventId`), agora aplicada na leitura — e é o que torna a consulta
idempotente e testável sem disco.

**Consequência de A:** um arquivo alterado com a janela fechada continua
mostrando a última entrada como atual até a E5-T1. É a limitação já aceita na E1.

### D2 — Onde o serviço mora

> **Aprovada: A.** O serviço mora em
> `platform/changeLedger/common/timelineService.ts`, registrado no mesmo arquivo
> que registra o ledger.

**Recomendação: A.**

- **A.** `src/vs/platform/changeLedger/common/timelineService.ts`, registrado no
  mesmo arquivo que registra o ledger, no workbench.
- **B.** Uma pasta de serviço nova no workbench
  (`workbench/services/timeline/...`).
- **C.** Dentro da contribuição de interface (`contrib/watchCode`).

Por que A: a timeline é um modelo de leitura **sobre o ledger** e não precisa de
serviço nenhum de interface — só de `IChangeLedgerService`. Ficar no mesmo módulo
mantém a consulta junto do dado, reaproveita a suíte de testes que já existe e
evita uma pasta de serviço para um arquivo. C colocaria regra de leitura dentro
da camada de interface, que é justamente o que a E2-T2 vai consumir.

### D3 — Como a timeline fica sabendo da gravação

> **Aprovada: A.** O ledger ganha `onDidRecord` e a timeline emite `onDidChange`
> a partir dele. É o único acréscimo de contrato da tarefa.

**Recomendação: A.**

- **A.** O ledger passa a expor `onDidRecord`; a timeline escuta e emite
  `onDidChange` com o evento acrescentado e o rebaixado.
- **B.** A timeline relê o ledger a cada consulta e o consumidor faz polling.
- **C.** A timeline escuta o `IChangeRecorderService` em vez do ledger.

Por que A: **é** um acréscimo de contrato (um evento no ledger), por isso está
aqui e não nas decisões técnicas. O `record()` é o único ponto por onde passa
todo evento gravado, então um aviso ali é completo por construção; B gasta
leitura de disco a cada redesenho e ainda assim pode perder o instante da
mudança; C faria a timeline depender de quem grava em vez de onde está gravado,
e ficaria cega para qualquer outra origem de gravação.

### D4 — Onde as sessões são montadas

> **Aprovada: A.** A E2-T1 não monta sessões: entrega os eventos com o
> `sessionId`. O agrupamento por sessão na linha do tempo é a E5-T3.

**Recomendação: A.**

- **A.** A E2-T1 **não** monta sessões: entrega os eventos, que já carregam o
  `sessionId`. Agrupar por sessão na linha do tempo é a **E5-T3**, e o
  agrupamento por turno com hook é a **E6-T3**.
- **B.** A E2-T1 já entrega `getSessions()` e um evento de sessão.

Por que A: o entregável desta tarefa no guia (§6) lista consultas cronológicas,
filtro por arquivo, cálculo de `current`/`history` e eventos observáveis —
sessão não está na lista, e "agrupamento por sessão na timeline" está escrito no
entregável da **E5-T3**. A frase do §4.3 ("quem monta a sessão é o serviço de
timeline") continua valendo: o serviço é este, e a montagem chega na E5. Fazer B
agora seria entregar uma consulta sem consumidor — a view da E2-T2 mostra
arquivo, linhas, hora e origem, não sessões.

## 8. Decisões técnicas tomadas no planejamento

Locais, reversíveis e sem impacto de contrato — não precisam de aprovação, mas
ficam registradas para rastreabilidade.

| # | Decisão |
| --- | --- |
| T1 | As consultas são **assíncronas** (`Promise`), mesmo servindo de uma lista em memória: o ledger lê do disco na primeira vez, e um retorno síncrono obrigaria a carregar tudo na construção do serviço. |
| T2 | O tipo devolvido é o próprio `ChangeEvent` — nenhum modelo de view novo. Formatar arquivo, linhas e hora é da E2-T2. |
| T3 | Ordem **crescente** (mais antigo primeiro), como o ledger já devolve: a navegação Anterior/Próximo da E2-T3 caminha no sentido do tempo, e a view inverte o que quiser. |
| T4 | O filtro por arquivo compara o caminho relativo normalizado (`\` → `/`), sem diferenciar maiúsculas de minúsculas no Windows — o caminho vem do watcher, sempre com `/`, mas quem chama pode vir de um recurso do editor. |
| T5 | `onDidChange` carrega `{ added, demoted }` (o evento gravado e o rebaixado, quando houve), e não a lista inteira: quem está olhando já tem a lista e só precisa saber o que mudou. |
| T6 | O nome do arquivo é `timelineService.ts`, com `ITimelineService`/`TimelineService`, seguindo o módulo. |

## 9. Critérios de aceite

1. `ITimelineService` devolve todos os eventos do workspace em ordem
   cronológica crescente.
2. Por arquivo, o evento mais recente é `current` e todos os anteriores são
   `history`, mesmo que o que esteja gravado no disco diga outra coisa.
3. O status derivado vale para cada consulta — lista completa, por arquivo e por
   id — e os três concordam entre si.
4. `getEventsForFile` devolve só os eventos daquele arquivo, e lista vazia para
   um arquivo sem histórico.
5. `getEvent` devolve `undefined` para id inexistente, sem lançar.
6. Toda gravação no ledger produz **um** `onDidChange`, com o evento gravado e o
   rebaixado quando houver.
7. A consulta seguinte ao aviso já reflete o evento novo, sem reler o disco.
8. Workspace sem evento nenhum: consultas devolvem lista vazia e o serviço não
   quebra.
9. `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` passa
   com os testes novos (a suíte do módulo hoje tem 98 testes).
10. `npm run compile-client` sem erro, `npx eslint` sem aviso nos arquivos
    tocados e `node --experimental-strip-types build/hygiene.ts` verde.
11. Nenhum arquivo fora de `platform/changeLedger` e `docs/watch-code` é
    alterado.
12. Nenhum arquivo do ledger muda de formato: os eventos gravados antes desta
    tarefa continuam legíveis.

## 10. Rastreabilidade

| Critério de aceite do produto | Guia | Esta tarefa |
| --- | --- | --- |
| Linha do tempo cronológica | §2.3 | etapa 3 e critério 1 |
| Regra única de `current`/`history` | §4.1 | etapa 4 e critérios 2 e 3 |
| Timeline do workspace inteiro, com filtro por arquivo | §8.6 | etapa 5 e critério 4 |
| Timeline correta mesmo depois de o código continuar mudando | §10.3 | etapas 4 e 6 |
| Histórico sobrevive ao fechar e reabrir o workspace | §8.11 | etapa 3: a carga inicial vem do que está gravado |
| Uma sessão agrupa eventos da mesma execução | §4.3 | **D4**: o `sessionId` já vem no evento; a montagem é a E5-T3 |

