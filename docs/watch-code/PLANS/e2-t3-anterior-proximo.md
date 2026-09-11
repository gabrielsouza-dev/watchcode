# Plano — E2-T3 · Anterior/Próximo

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T3 — Anterior/Próximo |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E2 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e2-t3-anterior-proximo.md |

## 1. Objetivo

Dar ao desenvolvedor um **cursor sobre a linha do tempo**: um evento ativo, que
anda para o anterior e para o próximo por comando, por tecla e por clique na
lista — e que será a posição de onde a E2-T4 abre o arquivo.

Em uma frase: **a E2-T2 mostrou a lista; a E2-T3 dá um lugar nela onde ficar parado.**

## 2. Escopo

### Entra

1. O conceito de **evento ativo** na view: id, evento correspondente e aviso de
   mudança. Sem contrato novo.
2. Os comandos `watchCode.timeline.previous` e `watchCode.timeline.next`, na
   Paleta de Comandos e no título da view.
3. Dois botões no título da view, escondidos quando não há alteração nenhuma.
4. Keybindings, conforme a **D5**.
5. Duas vias de sincronia: o comando move a seleção da lista; a seleção da lista
   (clique, setas, Home/End) passa a ser o evento ativo.
6. **Carga sob demanda**: a lista passa a poder ser lida sem o corpo desenhado.
   Sem isso, navegar com a view recolhida — o estado em que ela nasce — não faz
   nada, porque não existe lista.
7. Uma context key que responde "há alterações para navegar", alimentada pela view.
8. Testes automatizados da regra do passo, em módulo puro, no `test-node`.
9. Teste manual da navegação na aplicação rodando.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Abrir o arquivo, revelar e selecionar as linhas | É o salto, não a navegação | **E2-T4** |
| Tratar entrada `history` e arquivo ausente | Só existe no momento do salto | **E2-T4** |
| Percorrer uma sessão inteira, em sequência, de ponta a ponta | É o fechamento da etapa | **E2-T5** |
| Selo de novo/visualizado | Muda o contrato do evento | **E2-T6** |
| Agrupar por sessão na lista | Outra tarefa | **E5-T3** |
| Filtro por arquivo | Não há tarefa para o filtro no backlog | **Decisão D4 da E2-T2** |
| Barra de status com "3 de 12" | Não pedido; a lista já mostra a seleção | **Não há tarefa** |
| Persistir o evento ativo entre sessões | A E2-T2 não persiste nada e não foi pedido | **Não há tarefa** |

### Fronteira com a E2-T4

A navegação responde **onde eu estou**; a E2-T4 responde **me mostre**. Nesta
tarefa, nada abre: nem editor, nem `reveal` de linha, nem foco roubado para o
editor. O gancho natural do salto é o `onDidOpen` da lista (Enter e duplo
clique), que fica **intocado** aqui de propósito: quem o liga é a E2-T4, e o
evento ativo que ela vai consumir já sai pronto daqui.

## 3. Contexto

### O que já existe e será consumido

| Artefato | Papel na E2-T3 |
| --- | --- |
| `WatchCodeTimelineView` (E2-T2) | Onde o estado mora: `rows`, `list`, `load()` e a assinatura de `onDidChange`. |
| `WorkbenchList` | Seleção, `setSelection`, `reveal` e `onDidChangeSelection`. É o componente que desenha o evento ativo. |
| `IViewsService.getViewWithId` / `openView(id, focus?)` | Como um comando disparado da Paleta ou de uma tecla alcança a view. |
| `registerAction2` + `MenuId.ViewTitle` | O padrão do fork para botão de título de view, com o `view` já no contexto. |
| `observationControl.contribution.ts` | O padrão da casa para comando: id exportado, texto por `localize`, categoria "Watch Code". |
| `docs/watch-code/e2e/run-manual-tests.ts` | O arnês. A sessão expõe `page`, então `page.keyboard.press` dá a tecla. |
| `docs/watch-code/testes-manuais.md` | Registro único; navegação com tecla é superfície, então a tarefa **precisa** de teste manual. |

### Fatos verificados no código do fork

- **Pane recolhida não desenha o corpo.**
  `base/browser/ui/splitview/paneview.ts:298` — o `renderBody` só roda se a pane
  estiver expandida, e recolher chega a tirar o `.pane-body` do DOM (linha 195).
  Como a view nasce recolhida (D5 da E2-T2), **hoje a lista não é lida nem
  montada enquanto ninguém expandir a view**. Este é o fato que decide a etapa 1:
  navegar com a view fechada exige que a leitura não dependa do desenho.
- **A pane existe desde o começo, mesmo recolhida.**
  `viewPaneContainer.ts:787` cria a view e chama `pane.render()` para **toda**
  view do container, expandida ou não; o que é adiado é só o corpo. Ou seja,
  `IViewsService.getViewWithId('watchCode.timeline')` devolve a view desde o
  início, com o construtor já executado — é por isso que a assinatura de
  `onDidChange` feita na E2-T2 já está viva antes de qualquer expansão.
- **Recolher não destrói o que já foi desenhado.** O `renderBody` acontece uma vez
  (`_bodyRendered`) e o mesmo elemento de corpo volta na reexpansão
  (`append(this.element, this.body)`). A lista e a seleção sobrevivem; o que se
  perde é só a altura, até o próximo `layout`.
- **O F5 já tem dono no fork: `debug.openView`.** Sem depurador instalado — o
  `js-debug` saiu na E0-T2 e o `product.json` não tem mais o item —
  `CONTEXT_DEBUGGERS_AVAILABLE` é falso, e quem assume o F5 é
  `debugCommands.ts:1169`, com `weight: KeybindingWeight.WorkbenchContrib`.
  Pegar o F5 exige peso maior, e o próprio fork já resolveu esse mesmo conflito
  assim: `debug.continue` usa `WorkbenchContrib + 10` com o comentário "use a
  stronger weight to get priority over start debugging F5 shortcut"
  (`debugCommands.ts:686`).
- **F7, F9 e F10 estão livres no editor comum; o F8 só tem o `gotoError`.** As
  ligações de F7 que sobram têm contexto (`isInDiffEditor` para "próxima
  diferença", símbolo destacado sob o cursor para o highlighter). O F8 percorre
  diagnósticos — e a fork não produz nenhum: nenhuma extensão embarcada roda
  servidor de linguagem (as pastas `json`, `css`, `html` e `typescript-basics`
  não têm `main`) e o painel de Problemas foi ocultado na E0.
- **A seleção da lista é múltipla por padrão.**
  `base/browser/ui/list/listWidget.ts:1170` — `multipleSelectionSupport: true`.
  A E2-T2 não passou a opção. Um "evento ativo" **único** pede
  `multipleSelectionSupport: false` na criação da lista.
- **`IViewsService.openView(id, focus)`** (`services/views/browser/viewsService.ts:302`)
  ativa o container e expande a view; sem `focus`, não rouba o foco. Não existe
  "expanda sem mexer no resto": se a barra lateral estiver na Busca, o Explorer
  passa a ser o container ativo.
- **O título da view aceita ações.** `ViewPane.renderHeader` monta uma
  `WorkbenchToolBar` sobre `MenuId.ViewTitle` (`viewPane.ts:455-479`), e o
  precedente dentro do **mesmo container** é a OpenEditorsView
  (`contrib/files/browser/views/openEditorsView.ts:930`): `registerAction2` com
  `menu: { id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', ...) }`.
- **A lista já navega com as setas.** ↑/↓/Home/End são do próprio componente. O
  que falta não é andar dentro da lista: é o comando que atravessa a lista **de
  fora** (tecla global, botão no título) e o evento ativo como estado do modelo,
  que sobrevive ao recolher.
- **Nada em produção consome hoje um "evento ativo".** É a primeira tarefa que
  cria esse conceito; a E2-T4 é a primeira consumidora.

## 4. Dependências

- **E2-T2 (pronta)** — a view, a lista, a carga única e a atualização por `splice`.
- **E2-T1 (pronta)** — `getEvents()` e `onDidChange`, já consumidos pela view.
- **E0-T4 (pronta)** — `contrib/watchCode/browser` é o lugar da interface do produto.
- **Nenhuma dependência nova.** Nada de biblioteca, nada de serviço de terceiro.
  Nenhum contrato existente muda: `ITimelineService` e `ChangeEvent` ficam como
  estão, e a regra do passo nasce num módulo novo do produto.

## 5. Etapas

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | Carga sob demanda | A leitura da linha do tempo deixa de depender do corpo desenhado: o primeiro a precisar (o desenho do corpo ou a navegação) dispara a carga, uma vez só. |
| 2 | Evento ativo | `activeId`, o evento correspondente e o aviso de mudança na view, mais o passo anterior/próximo sobre a lista de eventos. |
| 3 | Regra do passo em módulo puro | A decisão "de onde para onde" isolada de DOM e de serviço, com as regras de borda da **D4**. |
| 4 | Sincronia com a lista | O passo atualiza a seleção e revela o item; a seleção vinda do usuário vira evento ativo. Sem laço. |
| 5 | Seleção única | `multipleSelectionSupport: false` na criação da lista. |
| 6 | Context key | A chave que diz se há alterações para navegar, mantida pela view. |
| 7 | Comandos e botões | Os dois comandos na Paleta e no título da view, com ícone e visibilidade condicionada. |
| 8 | Keybindings | Conforme a **D5**. |
| 9 | Testes | Suíte da regra do passo no `test-node`; cenário no arnês; registro em `testes-manuais.md`. |
| 10 | Validação | `transpile-client`, suíte do módulo, `eslint`, `hygiene` e `valid-layers-check`; navegação conferida na aplicação rodando. |

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| Navegar com a view recolhida não mostrar nada (não há corpo, não há lista) | A **D2** decide se o comando abre a view. Em qualquer caso, o estado do evento ativo **não** depende do DOM. |
| O F5 já tem dono no fork (`debug.openView`) e um empate de peso não é garantido | O comando entra com `KeybindingWeight.WorkbenchContrib + 10`, o mesmo remédio que o próprio debug usa para si; quem prova é o teste manual, que aperta a tecla de verdade |
| Dois caminhos escrevendo na seleção (comando e lista) entrarem em laço | Mão única com guarda: o comando escreve e a lista avisa; o aviso da própria escrita é ignorado. |
| `getViewWithId` devolver nulo porque o container nunca foi criado | O comando cai para `openView(id, false)`, que cria o container e expande a view. |
| Navegar e, no meio, chegar um evento novo: o cursor anda sozinho? | Não. O evento ativo só se move por ação do usuário; evento novo entra na lista e o cursor fica onde estava. |
| O evento ativo apontar para um id que saiu da lista (recarga por "tentar de novo") | A regra do passo trata id ausente: sem evento ativo, o primeiro comando posiciona pelas pontas. |
| `openView` trocar o container ativo da barra (Busca → Explorer) | Consequência aceita na **D2**, e sem roubar o foco. |
| Recolher e reexpandir perder a seleção | O corpo e a lista sobrevivem ao recolher; o estado do ativo é do modelo, não do DOM. |
| A tentação de pôr o estado de navegação no `ITimelineService` | A **D1** mantém na view. Promover a serviço só quando existir um segundo consumidor de verdade. |
| Dois comandos novos poluindo a Paleta com nomes parecidos | Categoria "Watch Code", títulos em title-case e id com prefixo do produto. |

## 7. Decisões pendentes

### D1 — Onde o evento ativo mora

> **Aprovada: A.**

- **A (recomendada)** — **na view**, com um aviso de mudança para quem quiser
  observar. Nenhum contrato novo, nenhum serviço novo; a E2-T4 lê da própria view.
- **B** — no `ITimelineService`, junto dos eventos. Muda um contrato existente e
  põe estado de interface dentro do modelo de leitura da linha do tempo.
- **C** — só na lista (`WorkbenchList`), sem estado próprio. Menor custo, mas o
  evento ativo deixa de existir enquanto a view nunca foi expandida — e a E2-T4
  precisaria dele justamente aí.

### D2 — O que o comando faz com a view quando o usuário aperta a tecla

> **Aprovada: A.**

- **A (recomendada)** — **abre a view sem roubar o foco**: a lista aparece com a
  seleção andando, o usuário continua onde estava. Se a barra estiver na Busca, o
  Explorer passa a ser o container ativo.
- **B** — não mexe em visibilidade nenhuma: o evento ativo anda em silêncio e só
  se vê com a view já aberta.
- **C** — abre **e** foca a lista.

Observação para a decisão: enquanto não existe o salto (E2-T4), **A é o único
desenho em que apertar a tecla dá algum retorno visível**. Na E2-T4 o salto passa
a ser o retorno principal, e a view pode continuar sendo aberta do mesmo jeito.

### D3 — Quais eventos a navegação percorre

> **Aprovada: A.**

- **A (recomendada)** — **todos os eventos**, em ordem cronológica, inclusive os
  `history` e as repetições do mesmo arquivo. É o que a E2-T5 precisa ("percorrer
  em sequência todas as alterações de uma sessão") e o mais simples de explicar.
- **B** — só os `current` (um por arquivo).
- **C** — pula eventos consecutivos do mesmo arquivo.

### D4 — Onde o evento ativo começa e o que acontece nas pontas

> **Aprovada: A.**

- **A (recomendada)** — começa **sem evento ativo**; o primeiro "próximo" pega o
  **mais antigo** (topo da lista) e o primeiro "anterior" pega o mais recente
  (pé da lista). Nas pontas, o comando **para**: não dá a volta.
- **B** — começa no mais recente, e "anterior" anda para trás a partir dele.
- **C** — igual a A, mas **dá a volta** nas pontas (do último "próximo" volta ao
  primeiro), como o F7 do diff review faz.

Em A, B e C: clicar numa linha passa a ser o evento ativo, e a navegação
continua de onde o clique deixou.

### D5 — Keybindings

> **Aprovada: A, com a tecla revista em conversa: F5 (próxima) e Shift+F5
> (anterior).**

- **A (recomendada na primeira versão)** — F7 e Shift+F7, com
  `when: watchCodeTimeline.hasEvents` e peso de contribuição do workbench.
  Verificado: no editor comum as duas teclas estávam livres, e dentro do editor
  de diff o F7 continua sendo "próxima diferença".
- **B** — nenhuma tecla nesta tarefa: só botões e Paleta. Zero risco de conflito,
  mas o entregável da tarefa pede keybindings.
- **C** — outra combinação, também verificada livre: `Alt+F7` / `Ctrl+Alt+F7`.

**Revisão do usuário, no mesmo dia:** a fileira de F1 a F12 foi revista inteira,
com um critério explícito — *fica a tecla que serve para ler, navegar, comparar ou
propor; sai a que escreve ou executa*. Dele saiu F2 (renomear), F5/Shift+F5/Ctrl+F5
(depurar), F9/Shift+F9 (pontos de interrupção), F10 (passar por cima), Shift+F11
(step out) e as superfícies de agente ocultadas na E0 (Alt+F9, Alt+F8, Ctrl+F9).
Ficaram F1 (Paleta), F3/F4 (localizar e busca), F6 (painéis), F11 (tela cheia) e
F12, que volta a significar "ir para a definição" com o retorno do servidor de
linguagem em modo leitura (tarefa própria, registrada à parte).

Com a fileira livre, **o F5 passa a ser a tecla do gesto central do produto** —
andar pelas alterações que o agente fez. O F7 fica reservado para outro comando
do produto, e por isso esta tarefa **não** registra tecla secundária: uma tecla,
um sentido.

Continua valendo o que a verificação mostrou: o F5 **já tem dono** no fork, então
o nosso comando entra com peso maior (T8).

### D6 — Onde ficam os botões

> **Aprovada: A.**

- **A (recomendada)** — **no título da view**, como seta para cima (anterior) e
  seta para baixo (próximo), no lugar em que a Busca e a OpenEditorsView põem os
  botões delas. Foi o que indiquei no relatório da E2-T2 ao dizer que "o lugar dos
  botões já está pronto".
- **B** — numa faixa própria no pé da lista, dentro do corpo da view.

Se a sua ideia de "botão avançar e voltar" era o pé da lista (B), é só dizer: o
desenho do corpo muda, o resto do plano não.

## 8. Decisões técnicas locais

Reversíveis, consistentes com o padrão do fork e **sem** aprovação pendente:

| # | Decisão | Por quê |
| --- | --- | --- |
| T1 | Ids `watchCode.timeline.previous` / `watchCode.timeline.next`, categoria "Watch Code", títulos "Previous Change" / "Next Change" | Mesmo prefixo e mesmo padrão da contribuição da E1-T5 |
| T2 | Ícones de seta para cima e para baixo, anterior à esquerda do próximo | É o que a Busca usa para "resultado anterior/próximo"; ordem crescente põe primeiro o que fica à esquerda |
| T3 | A regra do passo num módulo puro, sob `contrib/watchCode/common/` | Testável no `test-node`; mesma razão do módulo da linha na E2-T2 |
| T4 | Botões visíveis só com `view == watchCode.timeline` **e** a chave de "há alterações" | Sem alteração, um botão que não faz nada é ruído |
| T5 | O aviso de mudança do evento ativo é exposto pela view, sem consumidor novo agora | É a porta que a E2-T4 vai usar; criar contrato antes do consumidor seria adivinhar |
| T6 | A linha ativa usa a seleção nativa da lista, sem CSS novo | O componente já pinta o item selecionado |
| T7 | Textos da interface em inglês, por `localize` | Consistência com o resto do produto |
| T8 | O comando de avançar/voltar entra com `KeybindingWeight.WorkbenchContrib + 10` | O F5 já tem dono no fork (`debug.openView`) e o peso padrão empataria com ele |

## 9. Critérios de aceite

1. Existe um evento ativo, e ele é único: a lista não entra em seleção múltipla.
2. O comando "próximo" move o evento ativo para o seguinte na ordem cronológica,
   e o "anterior" para o anterior, com as regras de borda da **D4**.
3. Os eventos ativos possíveis são os da **D3**.
4. Com a view aberta, o passo move a seleção da lista e revela o item.
5. Clicar numa linha, ou andar com as setas dentro da lista, torna aquela linha o
   evento ativo.
6. Com a view **recolhida** ou nunca expandida, o comando funciona conforme a
   **D2**, e o estado do evento ativo não se perde ao recolher.
7. Os dois comandos aparecem na Paleta de Comandos e no título da view, com o
   `when` da **T4**; sem alteração nenhuma, os botões não aparecem.
8. Os keybindings são os da **D5** — F5 (próxima) e Shift+F5 (anterior) —, e o
   F5 chega ao comando do produto apesar do dono atual da tecla (§3).
9. A leitura da linha do tempo continua acontecendo **uma vez**: navegar não
   relê o ledger, e a carga sob demanda não duplica a carga do desenho.
10. A suíte do módulo passa, com os testes novos da regra do passo.
11. `transpile-client`, `eslint` nos arquivos alterados, `hygiene` e
    `valid-layers-check` verdes.
12. O teste manual da navegação está registrado em `testes-manuais.md` com
    resultado obtido e situação.
13. Nada fora de `contrib/watchCode`, do registro em `workbench.common.main.ts` e
    da documentação é alterado.
14. Nenhum contrato existente muda: `ITimelineService`, `ChangeEvent` e a API da
    view entregue na E2-T2 continuam compatíveis.

## 10. Rastreabilidade

| Origem | Onde aparece neste plano |
| --- | --- |
| Backlog: "Comandos, keybindings e seleção do evento ativo na lista" (E2-T3) | §2 (entra 1-4), §5 (etapas 2-8), §9 (1-8) |
| Visão: "Navegação Anterior/Próximo com salto automático para o local" (§2.4 do guia) | §2 (fronteira com a E2-T4): a navegação sai daqui; o salto automático é a E2-T4 |
| Decisão D5 da E2-T2: a view nasce recolhida | §3 (fato verificado 1) e §5 (etapa 1): é a razão da carga sob demanda |
| Decisão D6 do plano da E2-T2 (arquivos alterados no Explorer) | Fora: não interfere aqui, e segue pendente de aprovação |
| Revisão da fileira de F1 a F12, feita com o usuário | D5 (a tecla vira F5) e §3 (o F5 tem dono hoje) |
| Padrão do fork: ações de título de view (`MenuId.ViewTitle`) | §3 e T1-T4 |
| E1-T5: padrão de contribuição do produto | T1, T7 |
| E2-T4 (próxima): abrir o arquivo e revelar as linhas | §2 (fronteira) e T5: o evento ativo e o `onDidOpen` ficam prontos para ela |
