# Plano — E2-T8 · Só o que mudou

**Tarefa:** E2-T8 — Só o que mudou (`docs/watch-code/Workflow/overview.md:320`)
**Workflow:** High (implementação: contrato novo, componente novo e teste manual)
**Depende de:** E2-T7 (feito) — e, pela cadeia da etapa, E2-T6, E2-T4, E2-T3, E2-T2, E2-T1 e E1-T6

## 1. Objetivo

Dar ao desenvolvedor uma árvore que só tem o que o agente tocou — as pastas e os arquivos
alterados, sem o resto do repositório —, aberta e focada por uma tecla só, o **F7**.

## 2. Escopo

**Dentro:**

1. Uma view própria, "Changed Only", com uma árvore de pastas e arquivos derivada do ledger.
2. A tecla **F7** mostrando e focando essa árvore, e recolhendo quando ela já está em uso.
3. O ponto de "ainda não visto" (E2-T7) em cada arquivo da árvore.
4. Abrir o arquivo e cair na alteração, pelo mesmo caminho de salto da E2-T4.
5. Atualização ao vivo: escrita nova do agente entra na árvore sem recarregar a janela.
6. Módulo de derivação puro (sem DOM), testado no `test-node`.

**Fora:**

1. **Filtrar a árvore de arquivos do Explorer.** É a opção B da D1, maior e mais cara; se o
   usuário preferir o pedido literal, vira tarefa própria.
2. Agrupar a linha do tempo por sessão, filtro por nome, e os comandos de apoio `newest`/
   `oldest`/`focus`/`filterByActiveFile` — esses são da E5-T3 e da E8-T3.
3. Modos de visualização do diff (E3-T4) e qualquer coisa de escrita: a IDE não edita código.
4. Configuração nova para persistir o estado da árvore: a view nasce recolhida, como a lista da
   timeline, e o estado do recolhimento é do próprio VS Code.

## 3. Contexto

| Fato conferido | Onde |
| --- | --- |
| O F7 está livre no editor comum e foi **reservado** para o comando desta tarefa na revisão da fileira de F1 a F12 | `docs/watch-code/PLANS/e2-t3-anterior-proximo.md:99` e `:239` |
| A recomendação registrada é a view própria, e não o gancho no core | `docs/watch-code/PLANS/e2-t2-view-da-timeline.md:258-270` e `overview.md:320` |
| A lista do produto já mora **dentro do container do Explorer**, recolhida abaixo da árvore | `src/vs/workbench/contrib/watchCode/browser/timeline.contribution.ts:16` e `:40` |
| O padrão de view do produto é `ViewPane` desenhando o corpo sob demanda, com a leitura feita na construção | `src/vs/workbench/contrib/watchCode/browser/timelineView.ts:185` e `:249` |
| O índice de arquivos tocados (chave = recurso, valor = visto/não visto) já existe e é puro | `src/vs/workbench/contrib/watchCode/common/timelineFileDecoration.ts:23` e `:49` |
| `isUnviewed` é a regra única de "ainda não visto" | `src/vs/platform/changeLedger/common/timelineSummary.ts` (usado em `timelineRows.ts:50`) |
| Remoção é `afterHash` ausente, e o plano de salto já trata "removido" e "sumiu" | `src/vs/platform/changeLedger/common/changeEvent.ts:60` e `common/changeReveal.ts:25` |
| O separador de caminho do produto normaliza barra e prefixo `./` | `src/vs/platform/changeLedger/common/filePath.ts` |
| O Explorer de verdade filtra por **nome**, com `FilesFilter`, e é isso que a opção B mexeria | `src/vs/workbench/contrib/files/browser/views/explorerViewer.ts:1228` e `:1386` |
| A árvore virtualizada do workbench está pronta para uso | `src/vs/platform/list/browser/listService.ts:1045` |
| Contribuição de workbench só existe se o módulo for **importado** | `src/vs/workbench/workbench.common.main.ts:478-482` (lição da E2-T7) |

**Fluxo de dados:** `ITimelineService.getEvents()` → derivação pura (pastas + arquivos) → árvore
desenhada na view. A view não lê disco por conta própria, não ordena por conta própria e não
guarda cópia da lista: ela pergunta ao serviço e mostra o que a derivação devolve. O estado
"não visto" sai do próprio evento (`viewedAt`), como na E2-T6, e a tecla só abre e foca.

## 4. Dependências

- `ITimelineService` (`getEvents`, `onDidChange`, `onDidMarkViewed`, `markViewed`) — E2-T1/E2-T6.
- Índice de arquivos tocados e regra de "não visto" — E2-T7 e E2-T6.
- Salto ao local (`planReveal`, `IEditorService`, faixa de linhas) — E2-T4.
- Registro de views no container do Explorer e `IViewsService.openView` — E2-T2.
- Nada de novo em `src/vs/platform/changeLedger`: a tarefa é de leitura.

## 5. Etapas

| # | Etapa | Entrega | Como se prova |
| --- | --- | --- | --- |
| 1 | Derivação da árvore, em módulo puro sob `contrib/watchCode/common/` | Pastas e arquivos a partir dos eventos: uma raiz por pasta do workspace, pastas antes de arquivos, ordem alfabética, arquivo removido marcado, arquivo pendente marcado | Testes de unidade no `test-node`, com `deepStrictEqual` no resultado inteiro |
| 2 | A view "Changed Only" | `ViewPane` com árvore virtualizada, ícone por arquivo, ponto do não visto, tooltip com o caminho completo e a hora da última alteração; estados vazio e de erro com "tentar de novo" | Código + teste manual |
| 3 | Registro da view no container do Explorer | View recolhida abaixo da árvore, ao lado da timeline; **import do módulo** no `workbench.common.main.ts` | App aberto: a view aparece e expande |
| 4 | Comando e tecla **F7** | `watchCode.changedOnly.toggle` na Paleta: expande e foca; quando a view já está focada, recolhe e devolve o foco ao editor. Sem `when` (a tecla é do produto e a primeira vez que ela é apertada é justamente quem quer ver o que mudou) | Teste manual: F7 abre, F7 de novo fecha, e o F7 do editor de diff continua sendo "próxima diferença" |
| 5 | Abrir o arquivo pela árvore | Enter e duplo clique abrem a alteração **mais recente** daquele arquivo, caem na faixa de linhas e marcam essa alteração como vista; arquivo removido avisa em vez de abrir | Teste manual, com o ledger conferido no disco |
| 6 | Atualização ao vivo | `onDidChange` e `onDidMarkViewed` reconstroem a árvore sem recarregar a janela; a escrita que chega com a view recolhida não se perde | Teste manual com escrita externa durante a execução |
| 7 | Validação e registro | `transpile-client`, testes do módulo, `typecheck-client`, `eslint`, `hygiene`, `valid-layers-check`; cenário novo no arnês (`T-0014`); `testes-manuais.md` e `overview.md` | Saída real dos comandos no relatório |

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| O F7 roubar o "próxima diferença" do editor de diff — e a E3, que é toda de diff, chega depois | Conferir os donos da tecla no fork antes de registrar, com `when` e peso escolhidos a partir do que a verificação mostrar (mesmo método da E2-T3) |
| A view nasce recolhida e o corpo nunca é desenhado | Carregar e derivar na construção, como a timeline faz desde a E2-T6 — o defeito daquela tarefa foi exatamente este |
| O módulo da view não ser importado e a view não existir | Import em `workbench.common.main.ts` como etapa explícita, e a primeira execução do teste manual confere a presença da view |
| A árvore parecer redundante com a lista da timeline | São duas leituras do mesmo ledger, e isso fica escrito: a lista é cronológica, por evento; a árvore é por arquivo, e é ela que responde "só o que mudou" |
| Arquivo removido ou sumido na árvore | Reuso do `planReveal`: avisa em vez de abrir |
| Workspace com mais de uma pasta | Uma raiz por pasta do workspace, como o Explorer; a chave de cada nó é o recurso, não o caminho relativo |

## 7. Decisões

### D1 — A forma do "só o que mudou": view própria (decidida nesta etapa)

| Opção | O que é | Preço |
| --- | --- | --- |
| **A (escolhida)** | Uma view própria com a árvore só dos arquivos tocados, dentro do Explorer, recolhida; o F7 abre e foca | Um segundo lugar de olhar: o Explorer de verdade continua mostrando tudo, e quem esconde é a árvore do produto |
| B | Filtrar a árvore de verdade do Explorer: o F7 esconde os não tocados na própria árvore | Mexe em `contrib/files` — o caminho que desenha a árvore —, e passa a ser nossa a manutenção do que já existe ali: `files.exclude`, busca, revelar o arquivo ativo, pastas compactadas e arrastar |

A decisão é a **A**, e o motivo é o preço da B: o Explorer é a superfície de navegação que a E0
preservou de propósito, e um erro ali aparece como "a IDE escondeu meus arquivos". A informação
que a tarefa promete — ver só o que mudou — é entregue igual pela árvore do produto, sem esse
risco. A opção A já era a recomendada em duas fontes (D6 do plano da E2-T2 e a linha do backlog),
e o pedido literal da B, se o usuário o quiser, é tarefa própria: é maior e toca o core.

### D2 a D9 — Decisões locais (reversíveis, sem aprovação pendente)

| # | Decisão | Por quê |
| --- | --- | --- |
| D2 | A view mora **dentro do container do Explorer**, recolhida, ao lado da lista da timeline | É a mesma escolha da D5 da E2-T2: o produto não cria container próprio na barra de atividades, e ali o recolher, o ocultar e o mover são comandos do próprio VS Code |
| D3 | As pastas da árvore são **derivadas dos caminhos dos eventos**, não lidas do disco | Ler o disco traria de volta a árvore inteira, que é justamente o que a tarefa esconde; a pasta existe na árvore porque tem alteração embaixo |
| D4 | O F7 é um **alternador**: expande e foca; com a view já focada, recolhe e devolve o foco ao editor | Uma tecla, um sentido — e o mesmo desenho do F5/Shift+F5 da E2-T3 |
| D5 | A derivação mora em `contrib/watchCode/common/`, sem DOM | É o mesmo padrão da T2 da E2-T2: assim ela é testada no `test-node` |
| D6 | O ponto de "não visto" é o mesmo da E2-T7, calculado do `viewedAt` do evento | Um arquivo com duas alterações continua pendente enquanto uma delas não for visitada |
| D7 | Clique simples só seleciona; **Enter e duplo clique** vão até a alteração mais recente do arquivo, e marcam **só ela** como vista | É o gesto de "ir até a alteração" da E2-T6, e as outras alterações do arquivo continuam pendentes — que é a leitura correta |
| D8 | Sem configuração nova: a árvore nasce recolhida e nada é persistido | Persistir estado de filtro é assunto dos modos de visualização (E3-T4) |
| D9 | Textos da interface em inglês, via `localize` | Consistência com o resto do produto (T6 da E2-T2) |

### Decisões pendentes

1. **D1** foi decidida nesta etapa pela regra "decisão óbvia não se pergunta" (o preço da B é risco
   para a superfície que a E0 preservou). Se o usuário preferir o pedido literal — o F7 escondendo
   os arquivos na árvore de verdade —, a B vira tarefa própria, antes ou depois desta.
2. Nada mais bloqueia a implementação. O `when` e o peso do F7 não são decisão de produto: saem da
   verificação dos donos da tecla no fork, na etapa de especificação.

## 8. Critérios de aceite

1. A view "Changed Only" existe no container do Explorer e nasce recolhida.
2. A árvore mostra **só** pastas e arquivos com alteração no ledger: nenhum arquivo intocado aparece.
3. A pasta aparece na árvore quando tem alteração embaixo, e some quando a última alteração dela sai.
4. Arquivo com alteração não vista carrega o ponto; ir até a alteração apaga o ponto e mantém o arquivo na árvore.
5. Arquivo removido aparece marcado, e abri-lo avisa em vez de abrir um editor vazio.
6. Enter e duplo clique abrem o arquivo na faixa de linhas da alteração mais recente.
7. Escrita nova do agente entra na árvore sem recarregar a janela, inclusive com a view recolhida.
8. O **F7** abre e foca a árvore; apertado de novo com a view em uso, recolhe e devolve o foco.
9. O F7 do editor de diff continua sendo "próxima diferença".
10. Sem alteração nenhuma, a árvore mostra o estado vazio; com a leitura do ledger falhando, mostra o erro e a ação de tentar de novo.
11. A suíte do módulo passa com os testes novos da derivação, e `transpile-client`, `typecheck-client`, `eslint`, `hygiene` e `valid-layers-check` ficam verdes.
12. Nenhum arquivo fora de `contrib/watchCode`, do registro em `workbench.common.main.ts` e da documentação é tocado.
13. O teste manual da superfície fica registrado em `docs/watch-code/testes-manuais.md`, executado de fato, com resultado obtido e situação.

## 9. Rastreabilidade

| Origem | Onde aparece neste plano |
| --- | --- |
| E2-T8 no backlog | Objetivo, escopo, D1, critérios 1 a 3 e 8 |
| D6 do plano da E2-T2 (a recomendação) | D1 |
| Reserva do F7 na E2-T3 | Decisão D4, critérios 8 e 9 |
| Selo de "não visto" da E2-T6/E2-T7 | Decisão D6, critérios 4 e 7 |
| Salto ao local da E2-T4 | Etapa 5, critério 6 |
| Lições da E2-T6 e da E2-T7 (view recolhida e import) | Riscos, etapas 3 e 6 |
