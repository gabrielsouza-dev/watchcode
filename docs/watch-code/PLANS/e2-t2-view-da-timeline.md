# Plano — E2-T2 · View da timeline

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T2 — View da timeline |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E2 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e2-t2-view-da-timeline.md |

## 1. Objetivo

Dar ao desenvolvedor a superfície onde a linha do tempo aparece: um container
próprio na Activity Bar com a lista virtualizada das alterações, uma linha por
evento — arquivo, linhas, hora e origem — com os estados de vazio e de erro.

Em uma frase: **a E2-T1 entregou a lista de eventos; a E2-T2 mostra ela.**

## 2. Escopo

### Entra

1. Container próprio na Activity Bar (`workbench.view.watchCode`), com ícone de
   codicon e o container montado por um `ViewPaneContainer`.
2. Uma view (`watchCode.timeline`) com `ViewPane` e lista virtualizada
   (`WorkbenchList`), uma linha por evento.
3. Linha do evento: nome do arquivo, com o diretório, as linhas, a hora e a
   origem na descrição secundária.
4. Carga pela porta da E2-T1 (`ITimelineService.getEvents()`) e atualização
   **incremental** pelo `onDidChange` — sem reler o ledger a cada evento.
5. Estado vazio ("nenhuma alteração observada ainda") e estado de erro (mensagem
   + ação de tentar de novo, que funciona porque o serviço volta a ler o disco
   quando a carga falha).
6. Registro da contribuição em `workbench.common.main.ts`, junto das outras do
   produto.
7. Derivação da linha em módulo puro, importável por teste sem DOM.
8. Testes automatizados da derivação da linha e das transições de estado.
9. Teste manual da superfície, em `docs/watch-code/testes-manuais.md`.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Comandos Anterior/Próximo, keybindings e o conceito de evento ativo | Dependem da lista pronta e do foco | **E2-T3** |
| Abrir o arquivo e revelar as linhas ao clicar na linha | Precisa de `IEditorService` e da navegação | **E2-T4** |
| Diff, hunks, decorações e modos de visualização | É a E3; a view mostra o evento, não o conteúdo | **E3** |
| Agrupar por sessão na lista | Agrupar é outra tarefa; o `sessionId` já vem no evento | **E5-T3** |
| Aviso de atualidade (`current`/`history`) na linha | A transição na prática e o aviso são o assunto da tarefa | **E5-T1** |
| Selo de novo/visualizado | Muda o **contrato do evento** (campo gravado) | **E2-T6** |
| Ícone próprio do produto | A identidade visual é uma tarefa só dela | **E7-T1** |
| Filtro por arquivo na interface | Não existe tarefa no backlog para o filtro | **Decisão D4** |
| Preencher `linesChanged` | É o cálculo de diff | **E3-T1** |

### Fronteira com a E2-T1

A view **só pergunta**; não ordena, não deriva status e não fala com o disco. Se
a view precisar de algo que o `ITimelineService` não oferece, isso é sinal de
que o escopo escorregou para a E2-T3 ou para o filtro (D4) — e a resposta é
parar, não engordar o serviço.

## 3. Contexto

### O que já existe e será consumido

| Artefato | Papel na E2-T2 |
| --- | --- |
| `ITimelineService.getEvents()` | **A fonte da lista.** Devolve todos os eventos do workspace em ordem cronológica crescente, com o status já derivado. |
| `ITimelineService.onDidChange` | O aviso de gravação, com o evento acrescentado e o id do rebaixado. |
| `ChangeEvent` | `fileUri` (caminho relativo ao workspace, com `/`), `linesChanged?`, `timestamp` (epoch ms), `source`, `attribution`, `status`, `beforeHash?`/`afterHash?`. |
| `workbench/browser/parts/views/viewPane.js` | `ViewPane`, com `renderBody`, `onDidChangeBodyVisibility` e `updateBodySize`. |
| `workbench/browser/parts/views/viewPaneContainer.js` | `ViewPaneContainer`, usado com `mergeViewWithContainerWhenSingleView` (é o que a busca faz, em `search.contribution.ts:56`). |
| `platform/list/browser/listService.js` | `WorkbenchList` e `IListRenderer`/`IListVirtualDelegate`. |
| Container registrado no `IViewContainersRegistry` | Ordem na Activity Bar: Explorer `0`, Search `1`, SCM `2`. A nossa entra em `3`. |
| `contrib/watchCode/browser/observationControl.contribution.ts` | O padrão da casa: `extends Disposable implements IWorkbenchContribution`, `localize` para os textos e `registerWorkbenchContribution2`. |
| `contrib/watchCode/browser/hiddenViews.contribution.ts` | O mecanismo declarativo da E0. Só contempla **containers**; a D2 decide se ele cresce para views. |
| `docs/watch-code/testes-manuais.md` | Registro único; a view é superfície, então esta tarefa **precisa** de teste manual. |

### Fatos verificados no código do fork

- **O nome já está ocupado.** `ITimelineService` também é o nome do serviço
  nativo de timeline (`contrib/timeline/common/timeline.ts`), cuja view tem id
  `'timeline'` (`TimelinePaneId`) e vive **dentro do container do Explorer**,
  com `when: TimelineHasProviderContext`.
- **A Timeline nativa aparece no nosso fork.** `extensions/git/src/timelineProvider.ts`
  existe: com um repositório git, o Explorer mostra a lista do histórico do
  arquivo ativo — ou seja, hoje já há uma "Timeline" na janela.
- **`linesChanged` não tem produtor em produção.** A varredura em `src/vs`
  encontra o campo no contrato (`changeEvent.ts:62`), no parser do anúncio e em
  testes — o watcher da E1-T4 não calcula intervalo de linha. O diff é E3-T1.
- **O registro do serviço é do desktop:**
  `registerSingleton(ITimelineService, TimelineService, Delayed)` está em
  `workbench/services/changeLedger/electron-browser/changeLedgerService.ts:26`,
  importado por `workbench.desktop.main.ts`. A view resolve no desktop, como a
  barra de status do produto já resolve.
- **As contribuições do produto vivem em `contrib/watchCode/browser/`** e são
  importadas em `workbench.common.main.ts` (linhas 478 e 479). É o arquivo que
  ganha a linha nova.
- **Nenhuma contribuição do produto tem CSS hoje.** Uma lista precisa de altura
  definida; o padrão do fork é um `media/*.css` importado pelo pane (ex.:
  `scmRepositoriesViewPane.ts:6`, com o `renderBody` montando o container da
  lista em `471`).
- **A observação desligada não apaga a lista.** O que está no ledger continua
  legível; a view mostra o histórico independentemente do estado da observação.

## 4. Dependências

- **E2-T1 (pronta)** — `ITimelineService` com `getEvents()` e `onDidChange`.
- **E1-T6 (pronta)** — o ledger grava eventos com antes/depois corretos, o que
  dá conteúdo real para a lista.
- **E0-T4 (pronta)** — `contrib/watchCode` existe e é o lugar da interface do
  produto.
- **Nenhuma dependência nova.** Tudo que a view usa já está no fork:
  `WorkbenchList`, `ViewPane` e os registries de view. Não entra biblioteca,
  não entra serviço de terceiro, não muda contrato nenhum.

## 5. Etapas

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | Registro da view | A view registrada conforme o **desenho escolhido na D5** (dentro do Explorer, no painel ou em container próprio à direita), ainda desenhando só o corpo vazio. Se houver container próprio, o ícone é de codicon. |
| 2 | Derivação da linha | Módulo puro que transforma `ChangeEvent[]` em linhas prontas: rótulo do arquivo, diretório, linhas, hora e origem. Sem DOM, sem serviço. |
| 3 | Lista virtualizada | `WorkbenchList` no corpo do pane, com delegate de altura fixa, renderer de duas linhas e o CSS que dá altura ao corpo. |
| 4 | Estados | Vazio, erro (com "tentar de novo") e a transição entre eles; o erro só aparece se a carga rejeitar. |
| 5 | Atualização incremental | `onDidChange` acrescenta a linha via `list.splice` — a lista não é relida nem reconstruída a cada evento. |
| 6 | Registro e convivência | Linha nova em `workbench.common.main.ts`; a Timeline nativa é tratada conforme a **D2**. |
| 7 | Testes automatizados | Suíte do módulo puro (formatação e estados) no `test-node`. |
| 8 | Teste manual | Entrada nova em `testes-manuais.md`, com objetivo, pré-condições, passos, resultado esperado e situação. |
| 9 | Validação | `transpile-client`, suíte do módulo, `eslint`, `hygiene` e `valid-layers-check`; a superfície é conferida na aplicação rodando. |

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| `ITimelineService` existe duas vezes no fork (`platform/changeLedger` e `contrib/timeline`) | Importar só o nosso. Se algum dia os dois conviverem no mesmo arquivo, um deles entra com alias. |
| Duas listas chamadas "Timeline" na mesma janela (a nativa no Explorer e a nossa) | É a **D2**; a decisão sai antes do código. |
| A barra lateral secundária nasce escondida e o produto ficaria sem porta de entrada | O produto define `workbench.secondarySideBar.defaultVisibility: 'visibleInWorkspace'` como **default** — sobrescrevível pelo usuário. |
| O produto passa a ocupar a barra da direita, que o usuário pode querer para outra coisa | O container continua móvel pelo "Move to" do próprio VS Code, e a escolha do usuário é persistida. |
| Lista sem altura não aparece | O corpo do pane recebe `media/*.css` com a altura da lista — é o padrão do fork para listas em view. |
| Redesenhar a lista a cada evento custaria caro | Atualização incremental por `splice`; a leitura do ledger acontece uma vez, na primeira carga. |
| Evento gravado antes de a lista carregar | Já resolvido na E2-T1: o serviço guarda o que chega cedo e entrega junto na primeira carga. A view só redesenha. |
| A linha fica sem conteúdo útil (linhas e origem) | A **D3** decide o que a linha mostra enquanto não há dado. |
| O CSS de view pane mexer no layout das outras views | O seletor é escopado no container da nossa view, não em classe genérica (`.monaco-workbench`). |
| Teste de UI não roda no `test-node` | A derivação da linha sai em módulo sem DOM; a superfície em si fica no teste manual. |
| A E2-T3 precisar do evento ativo e a view não expor nada | Registrado na **T5**: a view não promete API nesta tarefa; se a E2-T3 precisar, ela acrescenta o serviço, com nome próprio. |

## 7. Decisões pendentes

> **D1, D2, D3 e D4 aprovadas** (A, B, A e A). O usuário acrescentou dois pedidos
> sobre a D4: **onde a lista aparece** (D5) e **como o Explorer mostra as
> alterações** (D6). Nada é implementado antes da resposta dessas duas.

### D1 — Onde a view vive

| Opção | O que é | Custo |
| --- | --- | --- |
| **A (recomendada)** | Container próprio "Watch Code" na Activity Bar, com a view dentro | Uma entrada nova na barra; é o que o backlog pede ("lista na Activity Bar") e dá ao produto um lugar só dele |
| B | A view dentro do container do Explorer, junto da árvore de arquivos | Não mexe na Activity Bar, mas divide espaço com a Timeline nativa e mistura o produto com a navegação de arquivos |
| C | Registrar nosso pane no lugar da Timeline nativa (id `'timeline'`, dentro do Explorer) | Some com a lista nativa por substituição, mas amarra o produto a um container do VS Code e a um id que não é nosso |

> **Aprovada: A**, com uma revisão pedida pelo usuário: o **lugar** da lista muda,
> e ele pode deixar de ser um container nosso — ver a **D5**.

### D2 — O que fazer com a Timeline nativa do VS Code

Com o git, o Explorer já mostra uma "Timeline" (histórico de commits do arquivo
ativo), servida pela extensão embutida.

| Opção | O que é | Custo |
| --- | --- | --- |
| A | Não mexer: as duas convivem, com nomes parecidos | Risco zero, mas duas listas com o mesmo nome na mesma janela |
| **B (recomendada)** | Esconder a Timeline nativa, como a E0 escondeu o que não é do produto | Uma lista só na janela; exige o mecanismo da E0 crescer de containers para **views** (deregistrar por id no container do Explorer) |

> **Aprovada: B.**

Se a D2 for B, o trabalho entra nesta tarefa: é o mesmo tipo de ajuste da E0 e
não vale uma tarefa própria.

### D3 — O que a linha mostra enquanto não há dado

Dois dos quatro campos do entregável estão vazios hoje: **linhas** (`linesChanged`
não tem produtor até a E3-T1) e **origem** (`attribution` é sempre `observed`
até o hook da E6).

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | A linha mantém os quatro campos desde já; sem dado, as linhas aparecem como `—` e a origem como "Disco". A coluna passa a valer sozinha quando a E3-T1 e a E6 chegarem |
| B | A linha mostra só arquivo e hora agora; linhas e origem entram quando houver dado | 
| C | Preencher as linhas agora | Fora de escopo: é o cálculo de diff da E3-T1 |

> **Aprovada: A.**

### D4 — O que a lista mostra

| Opção | O que é | Custo |
| --- | --- | --- |
| **A (recomendada)** | A lista mostra o **workspace inteiro**, em ordem cronológica; o filtro por arquivo fica para uma tarefa própria | Não fecha a porta do guia §8.6 ("timeline do workspace inteiro, com filtro por arquivo"), mas o filtro precisa entrar no backlog |
| B | A lista segue o **editor ativo** e filtra pelo arquivo aberto | Filtro já na E2-T2, com `getEventsForFile`; mas esconde o resto do workspace, que é o que a tarefa pede |

> **Aprovada: A**, com o pedido adicional do usuário: com a lista aberta, o
> **Explorer continua aberto à esquerda** e a timeline abre **à direita**, com o
> Explorer indicando os arquivos alterados e um botão para ocultar os não
> alterados. O pedido virou as decisões **D5** e **D6**.

### D5 — Onde a lista mora

Dois pedidos do usuário, na ordem: (1) a lista abre **à direita**, com o Explorer
intacto à esquerda; (2) talvez seja melhor **acoplar no Explorer**, com a lista no
**canto inferior esquerdo**, junto da árvore de arquivos.

O que o fork permite, verificado:

- A barra de atividades é amarrada a **um** local (`activitybarPart.ts:266` passa
  `this.location`), e a barra lateral secundária tem barra própria
  (`auxiliaryBarPart.ts:213`). Um ícone nosso na barra da **esquerda** só existe
  se o container for nosso — e aí clicar nele **troca** o Explorer: é o
  comportamento da barra, não uma escolha nossa.
- Não há gancho para "ícone na barra que abre outra coisa": os dois itens fixos
  do rodapé (contas e engrenagem) vêm de menus fechados
  (`MenuId.AccountsContext` e `MenuId.GlobalActivity`, o dropdown da engrenagem).
- Uma view **dentro do container do Explorer** fica logo abaixo da árvore de
  arquivos, recolhível — é exatamente onde a Timeline nativa mora hoje
  (`timeline.contribution.ts:65`), vaga que a D2=B libera.
- `canMoveView: true` deixa o dev **arrastar a view de lugar** (painel ou barra
  secundária), com a escolha gravada.

| Desenho | Como fica | Entrada | Custo |
| --- | --- | --- | --- |
| **1 (escolhido)** | View **dentro do container do Explorer**, **recolhida**, abaixo da árvore, com o recolher/expandir do próprio título | Já está ali: o Explorer está sempre aberto | Menor de todos: sem container novo, sem default de visibilidade. **Sem ícone próprio** na barra de atividades |
| 2 | Container no **painel** (`ViewContainerLocation.Panel`), embaixo do editor | Aba do painel, ao lado de Output/Terminal | Divide altura com o terminal; sem ícone próprio |
| 3 | Container próprio na **barra lateral secundária** (à direita), com `workbench.secondarySideBar.defaultVisibility: 'visibleInWorkspace'` | Ícone na barra do lado direito | Entrega o primeiro pedido; a lista fica longe do Explorer |

> **Aprovada: desenho 1**, com o pedido explícito de que a view **possa ser
> recolhida**.

Os três desenhos usam a **mesma view** e o mesmo código; o que muda é o
`registerViews`/`registerViewContainer` e onde os botões de navegação aparecem.
Trocar depois é barato — a view é móvel.

O recolher sai de graça e em dois níveis, os dois persistidos pelo container: o
**recolher/expandir do título** (o estado inicial vem do `collapsed: true` do
descritor) e o **ocultar** (`canToggleVisibility`). Nada novo a construir.

**Efeito colateral a registrar:** no desenho 1 o produto **não** tem ícone na barra
de atividades, então o alvo da **E7-T1** ("ícone da view na Activity Bar") muda de
lugar: sobra o ícone do produto no build e o ícone da view no título. Fica
registrado para a E7-T1 ajustar o próprio entregável — não é trabalho desta tarefa.

### D6 — Arquivos alterados no Explorer

Dois pedidos distintos, com custos bem diferentes:

**(a) Indicar as alterações no Explorer.** É nativo e barato:
`IDecorationsService.registerDecorationsProvider`
(`workbench/services/decorations/common/decorations.ts:64`) aceita um provider que
devolve `IDecorationData` — letra/ícone, cor e tooltip por recurso. É o mesmo
mecanismo que o git usa para o "M" dos arquivos modificados.

**(b) Ocultar os itens não alterados dentro do Explorer.** Não existe gancho. O
Explorer filtra por **nome**, com `FilesFilter` e `ExplorerFindProvider`
(`explorerView.ts:502`), não por predicado. As alternativas:

| Opção | O que é | Custo |
| --- | --- | --- |
| **A (recomendada)** | Uma segunda view no lado direito, "Changed files": árvore só com os arquivos alterados, agrupados por pasta | Uma view própria; **não toca no core do Explorer** (que a E0 preservou) |
| B | Abrir um gancho de visibilidade no Explorer do fork: um filtro registrado que `ExplorerDataSource`/`FilesFilter` consultam, com botão no título do Explorer | Entrega o pedido literal — é o Explorer de verdade, filtrado — mas mexe em `contrib/files` e no caminho de renderização da árvore de arquivos |
| C | `files.exclude` com o glob dos inalterados | Não recomendo: exigiria listar todo arquivo inalterado e escreveria na configuração do usuário |

Recomendação: **(a) como tarefa própria (E2-T7)** e **(b) pela opção A, como
E2-T8** — duas tarefas novas no backlog, para a E2-T2 não inchar. Se você preferir
a (b) pela opção B, ela é maior e merece tarefa própria também.

> **Pendente.** Não bloqueia a E2-T2: a lista fica de pé sem a marca nos arquivos,
> e as duas tarefas só entram no backlog com a aprovação do usuário.

## 8. Decisões técnicas locais

Reversíveis, consistentes com o padrão do fork e **sem** aprovação pendente:

| # | Decisão | Por quê |
| --- | --- | --- |
| T1 | Uma linha por evento, altura fixa, com duas faixas: arquivo em cima; diretório, linhas, hora e origem embaixo | Cabe o entregável inteiro sem virar tabela; altura fixa é o que a lista virtualizada espera |
| T2 | A derivação da linha mora em módulo sem DOM, sob `contrib/watchCode/common/` | Assim ela é testada no `test-node`; teste de view não roda lá |
| T3 | Hora em `HH:MM` local, com a data completa no tooltip | O que se procura na lista é "quando, hoje"; a data exata fica a um hover |
| T4 | Sem selo de `current`/`history` na linha | O aviso de atualidade é o assunto da E5-T1; antecipar aqui seria decidir o desenho dela por acidente |
| T5 | A view não expõe API nem evento ativo nesta tarefa | Escopo: quem navega é a E2-T3 |
| T6 | Textos da interface em inglês, via `localize`, como o resto do produto | Consistência com a contribuição da E1-T5 |
| T7 | A lista nasce com a seleção padrão do `WorkbenchList` (foco e teclado funcionando) | É de graça no componente e não é navegação: nada é aberto nem revelado |

## 9. Critérios de aceite

1. A lista aparece no lugar escolhido na D5, e o Explorer continua disponível — aberto e intacto, no desenho 1 (dentro dele) e nos desenhos 2 e 3.
2. A view lista todas as alterações do workspace, da mais antiga para a mais
   recente.
3. Cada linha mostra arquivo, diretório, linhas, hora e origem.
4. Uma alteração feita no workspace com o app aberto aparece na lista **sem
   recarregar a janela**.
5. Com o ledger vazio, a lista mostra o estado vazio — não um erro, não uma tela
   em branco.
6. Com a leitura do ledger falhando, a lista mostra o erro e a ação de tentar de
   novo; a tentativa seguinte pode dar certo.
7. Nenhuma releitura do ledger por evento: a lista é atualizada por `splice`.
8. A view não ordena, não deriva status e não lê o disco por conta própria.
9. A suíte do módulo passa, com os testes novos da derivação da linha e dos
   estados.
10. `transpile-client`, `eslint`, `hygiene` e `valid-layers-check` verdes.
11. O teste manual da superfície está registrado em `testes-manuais.md` com
    resultado obtido e situação.
12. Nenhum arquivo fora de `contrib/watchCode`, do registro em
    `workbench.common.main.ts` e da documentação é tocado.

## 10. Rastreabilidade

| Origem | Onde aparece neste plano |
| --- | --- |
| Guia §2.3 ("linha do tempo cronológica") | Objetivo, etapas 1-3 |
| Guia §3.1 ("Timeline view → navegação → diff") | Etapa 1; navegação fica para a E2-T3 |
| Guia §4.1 (`ChangeEvent`) | Contexto e T1 |
| Guia §8.6 ("timeline do workspace inteiro, com filtro por arquivo") | D4 |
| Guia §9 ("UI com perfil isolado") | Etapas 8 e 9 |
| Backlog E2-T2 ("lista virtualizada na Activity Bar com arquivo, linhas, hora e origem; estados vazio e de erro") | Escopo, critérios 1-6 |
| Backlog E2-T3 ("seleção do evento ativo na lista") | T5 e o risco correspondente |
| Pedido do usuário: Explorer aberto, timeline à direita, arquivos alterados indicados no Explorer | D5 (lugar do container) e D6 (decoração e "só os alterados") |
| `CLAUDE.md` (teste manual registrado, sem subagentes, nada fora do escopo) | Etapa 8 e critérios 11-12 |
