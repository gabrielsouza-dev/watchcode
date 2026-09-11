# Plano — E2-T4 · Salto ao local

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T4 — Salto ao local |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog §6, etapa E2: "Salto ao local — abrir o arquivo, revelar e selecionar as linhas; tratar arquivo ausente e entrada `history`" |
| Saída | Este documento → SpecWriter |
| Depende de | E2-T3 (feito) |

## 1. Objetivo

Ir do evento ao código em **um** gesto: com o evento ativo escolhido na linha do
tempo, o arquivo abre e as linhas alteradas ficam visíveis e selecionadas — e,
quando não há o que abrir, o produto diz isso em vez de não fazer nada.

É o critério de aceite 4 do produto: *"O desenvolvedor consegue ir do evento à
linha alterada em uma única ação."*

## 2. Escopo

### Entra

- Resolver o caminho relativo do evento (`fileUri`) no arquivo do workspace.
- Abrir o arquivo, revelar e selecionar as linhas de `linesChanged`.
- Tratar as três situações em que não há o que revelar: arquivo removido pelo
  próprio evento, arquivo que já não existe no disco e evento **sem** intervalo
  de linhas.
- Tratar a entrada `history` (o arquivo mudou desde a alteração registrada).
- A alternância da rolagem do salto, por configuração do produto (D4).
- Teste de unidade da decisão e teste manual T-0008 na janela.

### Não entra

- Diff, cores, documentos virtuais `aih-before:`/`aih-after:` — **E3**.
- Aviso de proposta desatualizada e transições de status na interface — **E5-T1**.
- Selo de novo/visualizado (E2-T6), decoração no Explorer (E2-T7), "só o que
  mudou" (E2-T8).
- Tecla nova. A fileira de F1 a F12 já foi decidida com o usuário na E2-T3, e o
  gesto do salto é o F5 que já existe.
- Comandos de apoio da timeline — **E8-T3**.
- Multiraiz: o evento guarda só o caminho relativo, e a resolução usa a primeira
  pasta do workspace, a mesma regra do `changeRecorderService` (§5.2).

## 3. Contexto — o que já existe

### 3.1 O evento ativo (E2-T3)

`contrib/watchCode/browser/timelineView.ts` já tem tudo de que o salto precisa,
e nada disso é usado ainda:

| Onde | O que é |
| --- | --- |
| `timelineView.ts:328` | `get activeEvent(): ChangeEvent \| undefined` — o evento inteiro, não só a linha |
| `timelineView.ts:172` | `onDidChangeActive` — porta pública, **sem consumidor** |
| `timelineView.ts:157-158` | `events: Map<string, ChangeEvent>` — é dele que sai o `linesChanged` |
| `timelineView.ts:333-353` | `moveActive` (F5/Shift+F5) e `onDidSelect` (clique, setas, Home/End) — os **dois** lugares que mudam o evento ativo, com o mesmo trio de linhas repetido |

A E2-T3 deixou registrado na spec (§2.6) que o comando abre a view **sem roubar o
foco**, exatamente para "o salto para o editor (E2-T4) não precisar desfazer
nada".

### 3.2 O que o evento diz

`platform/changeLedger/common/changeEvent.ts`:

- `fileUri` — caminho **relativo à raiz do workspace** (`workspaceWatcherService.ts:197`,
  via `relativePath(folder.uri, resource)`).
- `linesChanged` — `readonly [startLine, endLine][]`, 1-based e inclusivo nas duas
  pontas; **ausente** quando não foi possível calcular; pode ter várias faixas.
- `afterHash` ausente = o evento registra uma **remoção**.
- `status` — `'current'` ou `'history'`, derivado pelo `timelineService`
  (`timelineService.ts:159-183`): por arquivo, o evento mais recente é o atual.

### 3.3 Como se resolve o caminho relativo

`changeRecorderService.ts:188-192`:

```ts
const folder = change.folderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
return folder ? URI.joinPath(folder, change.fileUri) : URI.file(change.fileUri);
```

O `folderUri` existe no instante da captura, mas **não é persistido no evento**:
na releitura da linha do tempo só resta `fileUri`. O salto usa a mesma regra do
recorder — primeira pasta do workspace — para não inventar uma segunda verdade.

### 3.4 Quem dispara o gesto

A lista é uma `WorkbenchList` (`timelineView.ts:214-227`). Em
`platform/list/browser/listService.ts:689-716`, o `ResourceNavigator` já traduz
clique, setas e Enter num `onDidOpen` — mas **só quando a lista tem o foco**.
Isso não cobre o gesto central do produto: o `F5` apertado com o foco no editor,
que é justamente onde o desenvolvedor está (`timelineNavigation.contribution.ts:69-74`
abre a view sem foco e chama `view.navigate`).

Consequência para o desenho: **pendurar o salto no `onDidOpen` deixaria o F5 sem
salto**. O ponto certo é o evento ativo — os dois lugares de §3.1.

## 4. Desenho proposto

### 4.1 Duas metades, como na E2-T3

O módulo já tem o padrão: decisão pura em `common/`, efeito em `browser/`.

**Decisão (nova, pura, testável no `test-node`)** —
`contrib/watchCode/common/changeReveal.ts`:

```ts
/** O que o salto deve fazer com um evento. */
export type RevealPlan =
	| { readonly kind: 'file'; readonly range?: ChangeLineRange }
	| { readonly kind: 'missing'; readonly because: 'removed' | 'absent' };

/** Decide o que fazer, sem tocar em disco, em editor ou em serviço. */
export function planReveal(event: ChangeEvent, fileExists: boolean): RevealPlan;
```

Regras, todas cobertas por teste:

| Entrada | Plano |
| --- | --- |
| `afterHash` ausente (remoção registrada) | `missing / removed` |
| `fileExists === false` | `missing / absent` |
| com arquivo, `linesChanged` ausente ou vazio | `file`, sem faixa |
| com arquivo, uma faixa | `file`, com a faixa |
| com arquivo, várias faixas | `file`, com **a primeira** |
| `status: 'history'` | igual a `current` — o status não muda o salto (decisão D7) |

**Efeito (na view)** — `timelineView.ts`:

1. A duplicação de §3.1 sai: `moveActive` e `onDidSelect` passam a chamar um
   `setActiveEvent(id)` privado, que grava o id, sincroniza a seleção, **salta** e
   por fim dispara `onDidChangeActive`.
2. O salto resolve a pasta (`IWorkspaceContextService`), pergunta ao
   `IFileService` se o arquivo existe, chama `planReveal` e então:

   - **`file`** — `IEditorService.openEditor({ resource, options })` com
     `revealIfOpened`; com faixa, a seleção vai da primeira à última linha dela e a
     rolagem a deixa visível.
   - **`missing`** — `INotificationService` com um texto por motivo, e **nenhum
     editor aberto**.

3. **O segundo gatilho: o `onDidOpen` da lista.** Sem ele, apertar Enter numa
   linha que já é o evento ativo não faria nada, porque a seleção não mudou
   (`listService.ts:758-773` é quem emite). O `onDidOpen` chama o mesmo salto, e é
   por onde passam Enter e duplo clique.

4. Uma guarda contra corrida: o id do evento que pediu a abertura é comparado ao
   evento ativo quando a promessa volta; se já mudou (F5 em rajada), a abertura
   antiga não sobrescreve a nova.

O `openerService` que a `ViewPane` já injeta **não serve**: ele resolve links, não
abre editor com seleção. Os serviços novos entram pelo construtor, como o
`ITimelineService` já entrou (`timelineView.ts:195`).

### 4.2 O que o usuário vê

| Gesto | Antes (E2-T3) | Depois (E2-T4) |
| --- | --- | --- |
| F5 / Shift+F5 (foco no editor) | a view abre e a primeira linha fica selecionada | a view abre, a linha fica selecionada **e o arquivo abre nas linhas alteradas** |
| clique / setas na lista | a linha selecionada vira o evento ativo | idem, e o arquivo abre |
| evento de arquivo removido | nada | aviso de que não há o que abrir |
| Enter / duplo clique na linha | seleciona (se ainda não era) | seleciona e salta, mesmo que já fosse o evento ativo |

### 4.3 A rolagem é alternável (D4)

A decisão do usuário foi **ter os dois modos, com o "centraliza sempre" como
padrão**. Isso é uma configuração do produto, e é a primeira do Watch Code:

```json
"watchCode.timeline.centerOnReveal": {
	"type": "boolean",
	"default": true,
	"description": "..."
}
```

- `true` (padrão, modo B) — o salto **sempre** centraliza as linhas na tela.
- `false` (modo A) — a rolagem só se move quando as linhas estão fora da área
  visível.

O esquema entra por `registry.registerConfiguration`, ao lado do registro da view
(`timeline.contribution.ts`, que já é o módulo de registro da timeline). O
`IConfigurationService` a view **já tem**: a `ViewPane` recebe o serviço no
construtor (`viewPane.ts:383`) e a nossa view o repassa ao `super`
(`timelineView.ts:189`), então a alternância não injeta serviço nenhum.

## 5. Dependências

1. **E2-T3 (feito)** — `activeEvent` e o mapa `events`.
2. `ITimelineService` (E2-T1) — já é o que a view consulta; o salto não lê o ledger.
3. Serviços de plataforma que a view passa a injetar: `IEditorService`,
   `IWorkspaceContextService`, `IFileService`, `INotificationService`.
4. `IConfigurationService` para a D4 — já disponível na `ViewPane`, sem injeção
   nova.
5. Nenhum contrato novo em `platform/changeLedger`: `ChangeEvent` fica como está.

## 6. Etapas

| # | Etapa | Entregável |
| --- | --- | --- |
| T1 | Módulo puro `common/changeReveal.ts` | `RevealPlan` e `planReveal` |
| T2 | Testes de unidade da decisão | `test/common/changeReveal.test.ts` |
| T3 | Fiação na view | `setActiveEvent`, os dois gatilhos, resolução de recurso, abertura com seleção, guarda de corrida |
| T3b | A configuração da rolagem (D4) | Esquema em `timeline.contribution.ts` e leitura na view |
| T4 | Tratamento de ausente e `history` | Aviso por motivo; `history` salta como `current` |
| T5 | Teste manual T-0008 | Cenário no arnês + registro em `testes-manuais.md` |
| T6 | Validação | `transpile-client`, `test-node`, `eslint`, `hygiene`, `valid-layers-check`, T-0008 |
| T7 | Documentação | Backlog do `overview.md` |

## 7. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| F5 em rajada abre arquivos fora de ordem | Guarda de corrida (§4.1, item 3): só a abertura do último evento ativo vale |
| Rolagem e foco roubados a cada passo, irritando quem só quer ler a lista | D2: o foco nunca sai de onde está. D4: quem não quiser a centralização desliga `watchCode.timeline.centerOnReveal` |
| Faixa de linhas apontando para além do fim do arquivo (caso clássico de `history`) | O editor valida a posição e limita à última linha; o T-0008 confere isso na janela, com uma entrada histórica de verdade |
| A configuração nova aparecer na interface de Configurações como se fosse mais uma opção do VS Code | Ela nasce sob a chave `watchCode.`, com descrição própria; é a primeira opção do produto, e o custo de uma linha de esquema é menor que o de um comportamento sem saída |
| Caminho relativo de outra pasta da raiz (multiraiz) resolvendo no arquivo errado | Limitação conhecida e registrada; a regra é a mesma do `changeRecorderService`, e o produto assume uma pasta raiz (padrão 12 do guia) |
| Custo de abrir editor dentro do laço de seleção da lista | A abertura é uma promessa; a lista não espera por ela, e o `openEditor` só troca o conteúdo de um editor que o workbench já mantém |
| Aviso de arquivo ausente virar ruído em navegação longa | O aviso só existe para evento cujo arquivo não está no disco — situação que já é anômala por si |

## 8. Decisões

Todas aprovadas pelo usuário antes da implementação.

| # | Questão | Decisão |
| --- | --- | --- |
| **D1** | Quando o salto acontece | **A** — acompanha o evento ativo (F5, Shift+F5, clique, setas), **acrescido do Enter e do duplo clique** na lista, que não mudam a seleção quando a linha já é o evento ativo |
| **D2** | Foco do teclado | **A** — fica onde estava. O usuário justificou: navega a lista pelas setas e salta com Enter, então devolver o foco ao editor atrapalharia o gesto seguinte |
| **D3** | Aba | **A** — pré-visualização: percorrer a sessão reusa a mesma aba |
| **D4** | Rolagem | **os dois modos, alternáveis**, com o **B (centraliza sempre) como padrão** — vira a configuração `watchCode.timeline.centerOnReveal` (§4.3) |
| **D5** | Evento com várias faixas | **A** — a primeira faixa |
| **D6** | Arquivo ausente | **A** — aviso não modal, nada abre |
| **D7** | Entrada `history` | **A** — salta igual a `current`, sem aviso |
| **D8** | Comando novo na Paleta | **A** — nenhum |

## 9. Critérios de aceite

1. Com o evento ativo escolhido, o arquivo do evento abre e a faixa de
   `linesChanged` fica selecionada e visível.
2. O gesto é um só: o F5 com o foco no editor já leva ao arquivo da alteração.
3. Evento **sem** `linesChanged` abre o arquivo sem seleção, sem erro.
4. Evento de **remoção** e evento cujo arquivo sumiu do disco produzem aviso, e
   nenhum editor é aberto.
5. Entrada `history` salta sem aviso e sem exceção, mesmo que a faixa já não
   exista no arquivo.
6. O foco do teclado e a aba seguem a decisão aprovada em D2 e D3: o foco fica
   onde estava e a aba é de pré-visualização.
6b. A configuração `watchCode.timeline.centerOnReveal` existe, nasce `true`,
   aparece na interface de Configurações e muda de fato a rolagem do salto nos
   dois valores.
6c. O Enter numa linha que já é o evento ativo salta de novo.
7. F5 em rajada termina no arquivo do último evento ativo.
8. `planReveal` está coberto por teste de unidade, com um caso por linha da
   tabela do §4.1.
9. `ChangeEvent`, `ITimelineService` e a API da view entregue na E2-T3 continuam
   compatíveis; nada fora de `contrib/watchCode` e da documentação é alterado.
10. `transpile-client`, `test-node`, `eslint`, `hygiene`,
    `valid-layers-check` e o T-0008 verdes.
11. O teste manual T-0008 fica registrado em `docs/watch-code/testes-manuais.md`
    com resultado obtido e situação.

## 10. Decisão tomada durante a execução

| # | Questão | Decisão |
| --- | --- | --- |
| **D9** | `ChangeEvent.linesChanged` é declarado e lido, mas **ninguém o grava**: o salto não tinha faixa para revelar, e a coluna de linhas da timeline nunca mostrou nada. Quem é o produtor, já que a E3-T1 é a dona natural dele e vem depois? | **Antecipar um produtor mínimo** agora, no gravador: compara o "antes" com o "depois" e grava uma faixa (`changedLineRange`). A E3-T1 troca por hunks no mesmo campo, sem mudar contrato. As opções eram: enxugar a E2-T4 (o salto só abriria o arquivo) ou antecipar a E3-T1 inteira. |

## 11. Nota sobre o teste manual

O T-0008 reaproveita o arnês de `docs/watch-code/e2e/run-manual-tests.ts`: os
helpers de lista (`waitForTimelineRow`, `timelineSelectedNames`), o clique na
linha (como no passo 7 do T-0006), e os leitores de editor que a E8-T1 deixou
(`activeEditorName`, `editorPosition`). O que só a janela prova: qual arquivo
virou a aba ativa, em que linha o cursor caiu, se o foco ficou onde estava e se o
aviso de arquivo ausente aparece.
