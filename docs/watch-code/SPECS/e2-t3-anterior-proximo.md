# Especificação — E2-T3 · Anterior/Próximo

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T3 — Anterior/Próximo |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Plano | @docs/watch-code/PLANS/e2-t3-anterior-proximo.md |
| Saída | Este documento → implementação → validação → relatório |

## 1. Referência

O plano da tarefa fixou o **quê** e o **porquê**: um evento ativo único na view da
linha do tempo, comandos de anterior/próximo, teclas F5 e Shift+F5 (D5 revista com
o usuário), botões no título da view (D6) e carga sob demanda, porque a pane
recolhida não desenha o corpo (fato verificado no §3 do plano).

Esta especificação fixa o **como**, ao nível que a implementação não precise
decidir mais nada.

## 2. Comportamento esperado

### 2.1 O evento ativo

A view passa a ter **um** evento ativo: o id do evento em que o desenvolvedor
parou. Ele é estado da view (D1), não do serviço.

- Não existe evento ativo até o usuário navegar ou clicar numa linha.
- O evento ativo **não se move sozinho**: a chegada de um evento novo acrescenta
  uma linha e deixa o cursor onde estava.
- Recolher a view **não** perde o evento ativo: ele vive no modelo, não no DOM.
- Se o evento ativo sumir da lista (recarga do ledger pelo "Try Again"), ele
  passa a valer como "sem evento ativo" — a regra do passo cuida disso.

### 2.2 Carga sob demanda

A leitura da linha do tempo deixa de depender do corpo desenhado.

- A primeira das duas coisas que acontecer carrega a lista: o corpo ser desenhado
  ou um comando de navegação ser executado.
- A carga continua acontecendo **uma vez**. Navegar não relê o ledger.
- Quando o corpo é desenhado **depois** de a lista já ter sido carregada, ele
  preenche a lista com o que já existe em memória, em vez de carregar de novo, e
  repõe a seleção do evento ativo.

### 2.3 O passo

```
próximo   →  o id seguinte na lista de eventos, em ordem cronológica crescente
anterior  →  o id anterior na lista
```

Regras de borda (D4 = A):

| Situação | "próximo" | "anterior" |
| --- | --- | --- |
| Lista vazia | nada acontece | nada acontece |
| Sem evento ativo (ou id que não está mais na lista) | primeiro da lista | último da lista |
| No meio da lista | o seguinte | o anterior |
| No primeiro | **para** (continua no primeiro) | primeiro |
| No último | último | **para** (continua no último) |

Não há volta ao começo em nenhuma ponta. A lista de ids é a ordem em que os
eventos chegaram do serviço: o passo **não ordena** nada (D3 = A: todos os
eventos, inclusive `history` e repetições do mesmo arquivo).

### 2.4 Sincronia com a lista

Duas vias, mão única, sem laço:

- **O passo escreve na lista**: move a seleção para o índice do evento ativo e
  revela o item (`reveal`), para que ele apareça mesmo fora da área visível.
- **A lista escreve no estado**: quando o usuário clica numa linha, usa as setas
  ou Home/End, a seleção resultante vira o evento ativo — e a navegação continua
  de onde o clique deixou.

A seleção da lista é **única**: a criação da lista passa a declarar
`multipleSelectionSupport: false`. Sem isso, Ctrl+clique criaria vários eventos
ativos e o conceito deixaria de existir.

### 2.5 Comandos, teclas e botões

| Comando | Título | Tecla | Onde aparece |
| --- | --- | --- | --- |
| `watchCode.timeline.previous` | "Previous Change" | **Shift+F5** | Paleta, título da view |
| `watchCode.timeline.next` | "Next Change" | **F5** | Paleta, título da view |

- Categoria na Paleta: **Watch Code**, que é o rótulo com que a E1-T5 já apresenta
  os comandos do produto.
- No título da view, os dois entram no grupo `navigation`, com `order` 10
  (anterior, ícone de seta para cima) e 20 (próximo, seta para baixo) — "acima" é
  o que veio antes, "abaixo" é o que veio depois.
- Os dois só aparecem quando **há alterações** e a view é a nossa.
- A tecla **não** tem `when`: é a tecla do produto, e a primeira vez que ela é
  apertada é justamente quem lê a linha do tempo. Amarrá-la a "há alterações"
  criaria um ovo e galinha — a chave só vale depois da carga, e a carga só
  acontece quando alguém desenha a view ou navega (ver a divergência 4).
- Ela entra com `KeybindingWeight.WorkbenchContrib + 10`: o F5 já tem dono no fork
  (`debug.openView`) e o peso padrão empataria com ele.

### 2.6 O que o comando faz com a view (D2 = A)

Antes de mover o evento ativo, o comando **abre a view sem roubar o foco**:
`IViewsService.openView(id, false)` expande a pane e, se a barra lateral estiver
em outro container, ativa o Explorer. O foco do teclado **não** vai para a lista —
o usuário continua onde estava, e o salto para o editor (E2-T4) não vai precisar
desfazer nada.

Consequência aceita e registrada: com a view recolhida, a tecla a abre — é o único
retorno visível enquanto não existe o salto.

### 2.7 Textos

Todos por `localize`, em inglês, com o prefixo `watchCode.timeline.` que a E2-T2
já usa. Nenhum texto novo aparece na linha; a única string nova é a dos dois
títulos dos comandos.

## 3. Contratos

### 3.1 Módulo novo

`src/vs/workbench/contrib/watchCode/common/timelineNavigation.ts` — sem DOM, sem
serviço, sem `localize`, testável no `test-node`:

```ts
/** Para onde o evento ativo anda. */
export type NavigationDirection = 'next' | 'previous';

/**
 * O id que passa a ser o evento ativo.
 *
 * Sem evento ativo — ou com um id que já não está na lista — o passo entra pela
 * ponta: "próximo" começa no primeiro, "anterior" no último. Nas pontas o passo
 * para, sem dar a volta.
 */
export function stepActiveId(ids: readonly string[], activeId: string | undefined, direction: NavigationDirection): string | undefined
```

Devolve `undefined` só quando a lista está vazia.

### 3.2 Chave de contexto

```ts
/** Diz se ha alteracoes na linha do tempo; comanda a visibilidade dos botoes e a tecla. */
export const TIMELINE_HAS_EVENTS = new RawContextKey<boolean>('watchCodeTimeline.hasEvents', false);
```

Exportada por `timelineView.ts` (quem escreve) e importada pela contribuição dos
comandos (quem lê). O caminho do import é de mão única — comandos → view —, então
não há ciclo.

Ela é ligada ao **serviço global** de contexto, e não ao escopado da view: é assim
que a tecla continua valendo com o foco no editor.

### 3.3 API nova da view

Acrescentada à `WatchCodeTimelineView` da E2-T2, sem mudar nada do que já existe:

```ts
/** Ponto de entrada dos comandos: garante a carga e move o evento ativo. */
async navigate(direction: NavigationDirection): Promise<void>;

/** Avisa quem observa quando o evento ativo muda. */
readonly onDidChangeActive: Event<ChangeEvent | undefined>;

/** O evento ativo, quando existe. */
get activeEvent(): ChangeEvent | undefined;
```

`onDidChangeActive` e `activeEvent` **não têm consumidor nesta tarefa** (T5 do
plano): são a porta que a E2-T4 vai usar.

### 3.4 O que **não** muda

`ITimelineService`, `ChangeEvent`, o registro da view, o CSS, o renderer, o
delegate de altura e os textos da linha ficam como estão.

## 4. Alterações por arquivo

| Arquivo | Ação | O que muda |
| --- | --- | --- |
| `contrib/watchCode/common/timelineNavigation.ts` | **criar** | `NavigationDirection` e `stepActiveId`, sem dependência de DOM |
| `contrib/watchCode/browser/timelineView.ts` | alterar | Chave de contexto exportada; `multipleSelectionSupport: false`; mapa de id → evento; evento ativo, passo, seleção e `reveal`; `renderBody` preenche a lista com o que já está em memória; `navigate`, `activeEvent` e `onDidChangeActive` |
| `contrib/watchCode/browser/timelineNavigation.contribution.ts` | **criar** | Os dois `registerAction2`: id, título, ícone, tecla, `when` e o `run` que abre a view e navega |
| `workbench.common.main.ts` | alterar | Uma linha de import, ao lado da contribuição da timeline |
| `contrib/watchCode/test/common/timelineNavigation.test.ts` | **criar** | A regra do passo, no `test-node` |
| `docs/watch-code/e2e/run-manual-tests.ts` | alterar | Cenário **T-0006** |
| `docs/watch-code/testes-manuais.md` | alterar | Registro do T-0006 |

Nada fora disso: nem o serviço da timeline, nem o ledger, nem o `product.json`.

## 5. Casos de borda e erro

| Caso | Comportamento |
| --- | --- |
| Lista vazia e a tecla apertada | O comando abre a view (o vazio tem sua mensagem) e o passo não move nada |
| Ledger com falha de leitura | A view mostra o erro e o "Try Again", como na E2-T2; `hasEvents` continua falso, então nem a tecla nem os botões aparecem |
| Evento ativo que sumiu depois de uma recarga | Vale como "sem evento ativo": o próximo passo entra pela ponta |
| View recolhida e a tecla apertada | A carga acontece sob demanda, o passo anda e a view é aberta na mesma hora |
| View desenhada depois de a lista já ter carregado | O corpo usa as linhas já em memória e repõe a seleção |
| Corrida entre a carga e um evento novo | Continua resolvida pela E2-T2 (fila `pending` + `splice`); o passo usa a lista já atualizada |
| Ctrl+clique na linha | Não cria segundo evento ativo: a lista não aceita seleção múltipla |
| `getViewWithId` devolvendo nulo | O comando usa o que `openView` devolver e, se for nulo, não faz nada — sem exceção na Paleta |

## 6. Plano de testes

### 6.1 Unidade — regra do passo (T1-T9)

`contrib/watchCode/test/common/timelineNavigation.test.ts`, no `test-node`,
seguindo o estilo da E2-T2 (uma asserção de instantâneo por teste, com
`assert.deepStrictEqual`):

| # | Caso |
| --- | --- |
| T1 | Lista vazia devolve `undefined` nas duas direções |
| T2 | Sem evento ativo, "próximo" devolve o primeiro |
| T3 | Sem evento ativo, "anterior" devolve o último |
| T4 | "Próximo" anda um na ordem, a partir do meio |
| T5 | "Anterior" anda um para trás, a partir do meio |
| T6 | No primeiro, "anterior" fica no primeiro; no último, "próximo" fica no último |
| T7 | Id que não está na lista se comporta como sem evento ativo |
| T8 | Lista de um elemento devolve ele mesmo nas duas direções |
| T9 | A ordem recebida é preservada, sem reordenar |

### 6.2 Manual — na aplicação rodando (T-0006)

O teste manual é obrigatório: tecla, foco de teclado e seleção de lista não têm
como ser provados fora da janela. No arnês, com o app em perfil isolado e a
observação ligada:

1. Sem nenhuma alteração (`beforeWarmUp`), conferir que os dois botões **não**
   aparecem no título da view.
2. Com a view **recolhida** e o foco no editor, apertar **F5**: a view abre
   (`aria-expanded=true`), o foco continua no editor e a primeira alteração fica
   selecionada.
3. Apertar F5 de novo: a seleção anda uma linha.
4. Apertar **Shift+F5**: volta uma linha.
5. Clicar na última linha e apertar F5: a seleção **não** sai do lugar (não dá a
   volta).
6. Clicar na primeira linha e apertar Shift+F5: também não sai do lugar.
7. Clicar numa linha do meio e apertar F5: a navegação continua a partir dela.
8. Com alterações na lista, os dois botões aparecem no título.

Comandos:

```
npm run transpile-client
npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"
npx eslint <arquivos alterados>
node --experimental-strip-types build/hygiene.ts
npm run valid-layers-check
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0006
```

## 7. Divergências do plano

1. **O plano (T5) dizia "sem consumidor novo"; a view ganhou um mapa de
   `ChangeEvent`.** O evento ativo precisa entregar o `ChangeEvent` (com
   `linesChanged`) para a E2-T4, e a view só guardava as linhas derivadas. É
   memória já existente no serviço, indexada por id — não é contrato novo nem
   releitura de disco.
2. **O plano falava em "peso de contribuição do workbench" (D5); a verificação
   mostrou que o peso padrão empataria com `debug.openView`.** A decisão passou a
   ser `WorkbenchContrib + 10`, o mesmo remédio que o próprio debug usa (T8).
4. **A tecla perdeu o `when` de "há alterações".** A especificação previa
   condicionar o F5 à chave de contexto, mas a chave é escrita pela própria view
   quando ela lê a lista — e a view só lê a lista quando o corpo é desenhado ou
   quando um comando navega. Com a view recolhida (o estado em que ela nasce), a
   tecla nunca chegava ao comando. O teste manual T-0006 reprovou exatamente
   assim, na primeira execução. A chave continua comandando os **botões**, que
   vivem numa view já desenhada; a **tecla** ficou incondicional.
5. **A tecla deixou de ser F7.** Revisto com o usuário: a fileira de F1 a F12 foi
   inteira repensada, o F5 ficou livre e passou a ser o gesto central do produto.
   Registrado na D5.

## 8. Critérios de aceite verificáveis

1. Existe um evento ativo, e ele é único: a lista é criada sem seleção múltipla.
2. `stepActiveId` implementa a tabela do §2.3, provada pelos testes T1-T9.
3. A navegação percorre **todos** os eventos, na ordem do serviço, inclusive
   `history`.
4. Com a view aberta, o passo move a seleção da lista e revela o item.
5. Clique, setas e Home/End na lista passam a ser o evento ativo, e a navegação
   continua de onde pararam.
6. Com a view recolhida, a tecla funciona: a lista é lida sob demanda, o passo
   anda e a view é aberta sem receber o foco.
7. Os dois comandos aparecem na Paleta com a categoria "Watch Code" e no título da
   view, e **não** aparecem quando não há alterações.
8. As teclas são F5 e Shift+F5, sem `when`, com peso maior que o do dono atual do
   F5 — e o teste manual prova que a tecla chega ao comando com a view recolhida.
9. Navegar **não** relê o ledger, e a carga sob demanda não duplica a carga do
   desenho.
10. `onDidChangeActive` e `activeEvent` existem e não têm consumidor nesta tarefa.
11. `ITimelineService`, `ChangeEvent` e a API da view entregue na E2-T2 continuam
    compatíveis.
12. Os 9 testes novos passam e a suíte de `watchCode` continua verde.
13. `transpile-client`, `eslint` nos arquivos alterados, `hygiene`,
    `valid-layers-check` e o T-0006 verdes.
14. Nada fora de `contrib/watchCode`, do import em `workbench.common.main.ts` e da
    documentação é alterado.

## 9. Decisões pendentes

Nenhuma. As seis do plano foram aprovadas pelo usuário (D1 a D6, com a revisão da
tecla na D5), inclusive as quatro que faltavam fechar no fim da etapa de
planejamento.
