# Especificação — E2-T8 · Só o que mudou

**Plano:** `docs/watch-code/PLANS/e2-t8-so-o-que-mudou.md`
**Workflow:** High · etapa SpecWriter (2 de 5)
**Próxima etapa:** Developer

## 1. Decisões

### 1.1 Herdadas do plano

| # | Decisão | Onde no plano |
| --- | --- | --- |
| D1 | A forma do "só o que mudou" é a **view própria**, e não o filtro na árvore de verdade do Explorer | §7 |
| D2 | A view mora **dentro do container do Explorer**, recolhida | §7 |
| D3 | As pastas são **derivadas dos caminhos dos eventos**, não lidas do disco | §7 |
| D4 | O F7 é um **alternador**: abre e foca; com a view em uso, recolhe e devolve o foco | §7 |
| D5 | A derivação mora em `contrib/watchCode/common/`, sem DOM | §7 |
| D6 | O ponto de "não visto" é o mesmo da E2-T7 (`viewedAt` do evento) | §7 |
| D7 | Clique simples só seleciona; Enter e duplo clique vão até a alteração mais recente e marcam **só ela** | §7 |
| D8 | Sem configuração nova e sem persistir estado | §7 |
| D9 | Textos da interface em inglês, via `localize` | §7 |

### 1.2 Decisões locais desta etapa

| # | Decisão | Por quê |
| --- | --- | --- |
| L1 | **Uma raiz por pasta do workspace**, com o nome da pasta | É o desenho do Explorer, e é o que resolve multi-raiz sem inventar agrupamento; a chave de todo nó é o recurso (`toString()`), a mesma da decoração da E2-T7 |
| L2 | **O nó é dado puro**: strings, booleanos e filhos, sem `URI` dentro | O teste compara o resultado inteiro com uma asserção só; o `URI` guarda cache interno e não é comparável de forma estável. A view resolve o recurso com `resourcesOf` na hora de abrir |
| L3 | **Uma linha por arquivo**, e não por alteração | A árvore responde "só o que mudou"; a leitura cronológica continua sendo a lista da timeline |
| L4 | **O abridor vira módulo compartilhado** (`ChangeOpener`), usado pela lista e pela árvore | O salto é o mesmo comportamento provado na E2-T4; duplicar as 40 linhas de abertura seria pior do que extrair |
| L5 | **A ordem é a do Explorer**: pastas antes de arquivos, cada grupo por `compareFileNames` | Quem lê a árvore já conhece essa ordem da árvore de arquivos |
| L6 | **Sem contador no título da view** | O ponto no arquivo já diz o que falta ver; o contador por lote é da lista (E2-T6) |
| L7 | **Removido é `afterHash === undefined` no evento mais recente do arquivo** | É a mesma leitura da E2-T4 (`planReveal`) e do contrato do evento |
| L8 | **A árvore é reconstruída a cada aviso do serviço** e entregue por `setChildren(null, roots)` | A derivação é pura e barata; a árvore do workbench casa os nós pelo `identityProvider` e **preserva o que estava aberto** |
| L9 | **Um renderer só**, com o ícone trocando entre pasta e arquivo | O Explorer separa por template porque tem ações de arquivo e de pasta; aqui não há nenhuma |
| L10 | **A view não guarda cópia da lista**: guarda o evento por id, como a lista já faz | O salto precisa do evento inteiro (faixa de linhas, hash, hora), e o id é o que o nó carrega |

## 2. Comportamento esperado

| # | Situação | O que acontece |
| --- | --- | --- |
| 1 | Ledger sem nenhuma alteração | O corpo mostra `No changes were observed yet.`; nenhuma árvore é desenhada |
| 2 | A leitura do ledger falha | O corpo mostra `The Changed Only view could not be read.` e o botão `Try Again`; a tentativa seguinte pode dar certo |
| 3 | Arquivo tocado na raiz do workspace | O nó da pasta do workspace fica aberto e o arquivo aparece como filho |
| 4 | Arquivo tocado dentro de subpastas | Cada segmento do caminho vira um nó de pasta, na ordem do caminho |
| 5 | Duas alterações no mesmo arquivo | **Um** nó de arquivo; o ponto aparece se **alguma** alteração não foi vista; `removed` vale pelo evento mais recente |
| 6 | F7 com a view recolhida, ou com o foco fora dela | A view expande e recebe o foco; o primeiro nó já vem aberto |
| 7 | F7 com o foco dentro da view | A view recolhe e o foco volta para o editor ativo; sem editor aberto, o foco fica onde estava |
| 8 | F7 com o foco no editor de diff | A tecla **não** é do produto ali: o `when` da ligação exclui o contexto do diff, e o VS Code segue com `Go to Next Difference` |
| 9 | Clique, Enter ou duplo clique num arquivo | Abre a alteração **mais recente** do arquivo em pré-visualização, sem roubar o foco, seleciona a faixa alterada (centralizando conforme `watchCode.timeline.centerOnReveal`) e grava `viewedAt` naquela alteração |
| 10 | Enter num arquivo cuja alteração mais recente foi a remoção | Avisa `This change removed the file. Nothing to open.` e não abre editor |
| 11 | Enter num arquivo que sumiu do disco sem ter sido removido pelo agente | Avisa `The file of this change is no longer in the workspace.` |
| 12 | Abrir um nó de pasta | Abre ou fecha a pasta, como em qualquer árvore; não abre editor |
| 13 | Escrita do agente com a árvore aberta | O arquivo entra na árvore sem recarregar a janela, e o ponto aparece |
| 14 | Escrita do agente com a árvore recolhida | O aviso é ouvido mesmo assim (a escuta nasce na construção); ao abrir, o arquivo já está lá |
| 15 | A lista da timeline marca uma alteração como vista (F5, clique) | O ponto daquele arquivo some na árvore, porque o índice é derivado do mesmo evento |
| 16 | Escrita nova num arquivo já visto | O ponto volta para aquele arquivo |
| 17 | Janela sem pasta aberta | Estado vazio, como no caso 1 |

## 3. Fatos conferidos

| Fato | Onde |
| --- | --- |
| `ObjectTree` recebe a raiz por `setChildren(null, roots)` | `src/vs/base/browser/ui/tree/objectTree.ts:54` |
| A árvore casa os nós pelo `identityProvider` e **preserva o que estava aberto** numa troca de filhos | `src/vs/base/browser/ui/tree/objectTreeModel.ts:130-183` |
| `WorkbenchObjectTree` já existe, com `identityProvider`, `accessibilityProvider` e `overrideStyles` | `src/vs/platform/list/browser/listService.ts:862-886` |
| `ViewPane` tem `setExpanded` e `isExpanded`, e o corpo é desenhado sob demanda | `src/vs/workbench/browser/parts/views/viewPane.ts:437` e `:638` |
| Foco dentro da view se pergunta com `DOM.isAncestorOfActiveElement` — é o que o Explorer faz | `src/vs/workbench/contrib/files/browser/views/explorerView.ts:422` |
| `IViewsService.openView(id, focus)` é o ponto de entrada, e o padrão do produto é abrir **sem** roubar o foco e entregar a ação à view | `src/vs/workbench/services/views/common/viewsService.ts:32` e `src/vs/workbench/contrib/watchCode/browser/timelineNavigation.contribution.ts:69-74` |
| Donos do F7 no fork: diff (`when: isInDiffEditor`), destaque de símbolo (`editorTextFocus`), modo acessível do chat (contexto do chat), e o acorde `Alt+Shift+F7` | `src/vs/editor/browser/widget/diffEditor/commands.ts:213-217`, `src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts:934-938`, `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingEditorActions.ts:321-325` e `:350-354` |
| `Action2` registra a tecla como `and(precondition, keybinding.when)`, então a ligação do diff só é candidata **dentro** do diff | `src/vs/platform/actions/common/actions.ts:772` |
| Pesos: `EditorContrib = 100`, `WorkbenchContrib = 200` | `src/vs/platform/keybinding/common/keybindingsRegistry.ts:63-68` |
| Comparador de nomes do Explorer | `src/vs/base/common/comparers.ts:40` (`compareFileNames`) |
| Ícones usados: `Codicon.folder`, `Codicon.file`, `Codicon.trash`, `Codicon.circleFilled` | `src/vs/base/common/codiconsLibrary.ts` |
| O container do Explorer vem de `VIEW_CONTAINER` | `src/vs/workbench/contrib/files/browser/explorerViewlet.ts`, já usado por `timeline.contribution.ts:12` |
| Contribuição só existe se o módulo for importado | `src/vs/workbench/workbench.common.main.ts:478-482` (lição da E2-T7) |
| `isUnviewed`, `normalizeFileUri`, `resourcesOf`, `planReveal`, `formatFullTime` já existem e são o que a árvore reusa | `timelineSummary.ts`, `platform/changeLedger/common/filePath.ts`, `common/timelineFileDecoration.ts:49`, `common/changeReveal.ts:25`, `common/timelineRows.ts:89` |

## 4. Contratos

### 4.1 `common/changedFiles.ts` (novo)

```ts
export interface ChangedFileNode {
	readonly kind: 'file';
	/** Chave do nó na árvore: o recurso em `toString()`, igual à decoração da E2-T7. */
	readonly id: string;
	/** Último segmento do caminho. */
	readonly name: string;
	/** Caminho relativo, como o ledger grava. */
	readonly fileUri: string;
	/** Qual pasta do workspace este nó representa (índice em `folders`). */
	readonly folderIndex: number;
	/** Alteração mais recente do arquivo: é ela que o salto abre. */
	readonly eventId: string;
	/** Há alteração não vista neste arquivo. */
	readonly unviewed: boolean;
	/** A alteração mais recente foi a remoção do arquivo. */
	readonly removed: boolean;
}

export interface ChangedFolderNode {
	readonly kind: 'folder';
	readonly id: string;
	readonly name: string;
	readonly children: readonly ChangedTreeNode[];
}

export type ChangedTreeNode = ChangedFolderNode | ChangedFileNode;

/** Uma raiz por pasta do workspace, com os arquivos tocados que existem embaixo dela. */
export function buildChangedTree(events: readonly ChangeEvent[], folders: readonly URI[]): ChangedFolderNode[];
```

Regras da derivação:

1. Cada pasta do workspace vira uma raiz, com o nome dela (`basename`); sem pastas, o resultado é vazio.
2. O caminho relativo é normalizado por `normalizeFileUri` (barra invertida e prefixo `./` saem) e quebrado em segmentos; cada segmento intermediário vira um nó de pasta, e o último, um nó de arquivo.
3. Um arquivo com várias alterações vira **um** nó: `eventId` é o da alteração mais recente (maior `timestamp`; empate fica com o que vem depois na lista, que é a ordem cronológica do serviço), `unviewed` é verdadeiro se **alguma** alteração não tiver `viewedAt`, e `removed` olha só a mais recente.
4. Evento cujo caminho normalizado fica vazio é ignorado.
5. Pasta sem nenhum arquivo embaixo não aparece.
6. Ordem: pastas antes de arquivos, cada grupo por `compareFileNames`.

### 4.2 `browser/changeOpener.ts` (novo)

O trecho de abertura que hoje vive dentro da `WatchCodeTimelineView` passa a ser um serviço injetável, usado pelas duas views.

```ts
export interface IChangeOpenOptions {
	/** Opções de abertura do gatilho; sem elas valem pré-visualização e foco onde estava. */
	readonly editorOptions?: IEditorOptions;
	/** Diz se a abertura ainda interessa: a lista cancela quando o evento ativo muda. */
	readonly shouldContinue?: () => boolean;
}

export class ChangeOpener {
	constructor(
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@INotificationService notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITimelineService timelineService: ITimelineService,
	) { }

	/** Abre o recurso, revela a faixa da alteração e avisa quando não há o que abrir. */
	async open(event: ChangeEvent | undefined, resource: URI, options?: IChangeOpenOptions): Promise<void>;

	/** Grava que o desenvolvedor foi até esta alteração; falhar aqui não muda o que ele vê. */
	async markViewed(eventId: string): Promise<void>;
}
```

Regras:

1. O plano do salto continua sendo `planReveal(event, fileExists)` — a remoção registrada tem precedência sobre o arquivo que sumiu.
2. Sem opções do gatilho valem `{ preserveFocus: true, pinned: false }`; a abertura usa `revealIfOpened` e `ignoreError`.
3. `shouldContinue` falso cancela a abertura depois do disco responder (é assim que a lista evita uma abertura atrasada).
4. A faixa é limitada ao que o arquivo tem hoje, e a centralização segue `watchCode.timeline.centerOnReveal`.

### 4.3 `browser/changedOnlyView.ts` (novo)

```ts
export const CHANGED_ONLY_VIEW_ID = 'watchCode.changedOnly';

export class WatchCodeChangedOnlyView extends ViewPane {
	/** O gesto do F7: abre e foca; com a view em uso, recolhe e devolve o foco ao editor. */
	async toggle(): Promise<void>;
}
```

A view nasce recolhida, escuta `onDidChange` e `onDidMarkViewed` **na construção** (antes da primeira leitura, como a lista aprendeu na E2-T6), lê o ledger uma vez por `getEvents()` e reconstrói a árvore a cada aviso.

### 4.4 `browser/changedOnly.contribution.ts` (novo)

```ts
export const CHANGED_ONLY_VIEW_ID = 'watchCode.changedOnly';
export const TOGGLE_CHANGED_ONLY_COMMAND_ID = 'watchCode.changedOnly.toggle';
```

- View: `container = VIEW_CONTAINER`, `order = 4` (a lista da timeline usa 3), `weight = 40`, `collapsed = true`, `canToggleVisibility = true`, `canMoveView = true`, `hideByDefault = false`, ícone `Codicon.listFilter` e nome `Changed Only`.
- Comando: `Action2` com `f1: true`, categoria `Watch Code`, e a tecla:

```ts
keybinding: {
	primary: KeyCode.F7,
	weight: KeybindingWeight.WorkbenchContrib,
	// O F7 do editor de diff continua sendo "próxima diferença": fora desse contexto a tecla é nossa.
	when: EditorContextKeys.inDiffEditor.negate(),
}
```

- O `run` abre a view **sem** foco (`openView(id, false)`) e entrega o gesto a ela (`view.toggle()`), como a navegação da E2-T3 faz.

### 4.5 DOM e classes (contrato do arnês de teste manual)

| O quê | Como aparece |
| --- | --- |
| Corpo da view | `.watch-code-changed-only` |
| Árvore | `.watch-code-changed-only .watch-code-changed-only-tree` |
| Mensagem de estado | `.watch-code-changed-only .watch-code-changed-only-message` (escondida por `.hidden` quando há árvore) |
| Linha | `.watch-code-changed-row` com `.icon`, `.name` e `.badge` |
| Ponto do não visto | `.badge` com o codicon de círculo cheio; escondido por `.badge.hidden` (fora do layout, para alinhar os ícones) |
| Arquivo removido | `.icon` com o codicon de lixeira |

A mensagem de estado reaproveita o desenho da lista: texto e, no erro, o botão `Try Again`.

## 5. Alterações necessárias

| # | Arquivo | O que muda | Por quê |
| --- | --- | --- | --- |
| 1 | `src/vs/workbench/contrib/watchCode/common/changedFiles.ts` | **Novo**: tipos e `buildChangedTree` | A derivação pura, testável no `test-node` (L2, L5, D5) |
| 2 | `src/vs/workbench/contrib/watchCode/test/common/changedFiles.test.ts` | **Novo**: os casos da §7.1 | Provar a derivação sem app |
| 3 | `src/vs/workbench/contrib/watchCode/browser/changeOpener.ts` | **Novo**: abertura e marcação de visto compartilhadas | Tirar a duplicação entre a lista e a árvore (L4) |
| 4 | `src/vs/workbench/contrib/watchCode/browser/timelineView.ts` | Passa a usar o `ChangeOpener`; saem os métodos privados de abertura, aviso e faixa | Consequência da extração; comportamento inalterado |
| 5 | `src/vs/workbench/contrib/watchCode/browser/changedOnlyView.ts` | **Novo**: a view, a árvore, o renderer, os estados e o `toggle` | O entregável |
| 6 | `src/vs/workbench/contrib/watchCode/browser/changedOnly.contribution.ts` | **Novo**: view, comando e tecla F7 | Registro e gesto |
| 7 | `src/vs/workbench/contrib/watchCode/browser/media/changedOnlyView.css` | **Novo**: o desenho do corpo, da linha, do ponto e da mensagem | A view tem desenho próprio |
| 8 | `src/vs/workbench/workbench.common.main.ts` | Um import do módulo da contribuição | Sem ele a view não existe (lição da E2-T7) |
| 9 | `docs/watch-code/e2e/run-manual-tests.ts` | **Novo** cenário `T-0014`, com os ajudantes da árvore | Provar no app |
| 10 | `docs/watch-code/e2e/README.md` | A linha do `T-0014` | Índice dos cenários |
| 11 | `docs/watch-code/testes-manuais.md` | O registro do `T-0014` (etapa Tester) | Registro único dos testes manuais |
| 12 | `docs/watch-code/Workflow/overview.md` | Status da E2-T8 e o que ficou provado e medido (etapa Reporter) | Backlog é a fonte do andamento |

Nada fora disso é tocado. Em especial, **nenhum arquivo de `contrib/files`** — é a diferença entre a opção A e a opção B da D1.

## 6. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | Ledger vazio | Mensagem de estado vazio; a árvore não é desenhada, e o corpo não fica em branco |
| B2 | Leitura do ledger falhando | Mensagem de erro com `Try Again`; a próxima tentativa volta ao disco (o serviço limpa o estado de carga na falha) |
| B3 | Evento com caminho relativo vazio depois da normalização | Ignorado na derivação |
| B4 | Workspace com duas pastas | Uma raiz por pasta, com o mesmo caminho relativo nos dois ramos quando ele existir nas duas |
| B5 | Alteração mais recente é remoção | Ícone de lixeira e aviso ao abrir; o nó continua na árvore, porque a remoção **é** a alteração |
| B6 | Arquivo sumiu do disco sem remoção registrada | Aviso de arquivo ausente, com o texto próprio |
| B7 | Janela sem pasta aberta | Estado vazio |
| B8 | Escrita chegando durante a primeira leitura | A escuta já está de pé; a reconstrução é idempotente e o arquivo aparece |
| B9 | Foco no título da view (ações), e não na árvore | Conta como "view em uso": o F7 recolhe |
| B10 | Recolher sem nenhum editor aberto | O foco fica onde estava; nada é aberto |
| B11 | Vários arquivos no mesmo instante | Uma reconstrução só, com todos eles |
| B12 | Arquivo com duas alterações, uma vista e outra não | O nó continua com o ponto |

## 7. Plano de testes

### 7.1 Unidade — `contrib/watchCode/test/common/changedFiles.test.ts`

Uma asserção por caso, comparando a árvore inteira com `assert.deepStrictEqual` (o nó é dado puro, L2):

1. Um arquivo na raiz vira filho do nó da pasta do workspace.
2. Dois arquivos na mesma pasta: a pasta aparece **uma vez**, com dois filhos.
3. Pastas aninhadas viram nós aninhados, na ordem do caminho.
4. Pastas antes de arquivos, e cada grupo em ordem alfabética.
5. Duas alterações no mesmo arquivo viram um nó, com o `eventId` da mais recente.
6. Arquivo com uma alteração vista e outra não fica `unviewed`.
7. Arquivo cuja alteração mais recente é remoção fica `removed`.
8. Arquivo removido e recriado **não** fica `removed` (a mais recente manda).
9. Sem evento nenhum, nenhuma pasta do workspace aparece — nem a pasta do workspace sem alteração.
10. Sem eventos, o resultado é vazio.
11. Duas pastas de workspace: o mesmo caminho relativo aparece nos dois ramos, com `folderIndex` diferente.
12. Caminho com barra invertida e prefixo `./` é normalizado antes de virar nó.
13. Evento com caminho vazio é ignorado.

Comando: `npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"`.

### 7.2 Manual — `T-0014` no arnês, no app de verdade

Fases e conferências (o cenário novo entra em `docs/watch-code/e2e/run-manual-tests.ts` e é transcrito em `testes-manuais.md`):

| Fase | O que faz | O que confere |
| --- | --- | --- |
| 0 | Nada é escrito ainda: olha a árvore com o ledger só com a sonda de aquecimento | O corpo existe e nasce recolhido; o F7 abre e a árvore mostra a sonda; o arquivo intocado do cenário **não** aparece |
| 1 | Escreve dois arquivos de fora, um na raiz e um numa pasta | Os dois entram na árvore sem recarregar a janela, com o nó de pasta, e com o ponto; o ledger concorda |
| 2 | Aperta F7 com a view em uso | A view recolhe e o foco volta para o editor |
| 3 | Abre a view de novo e vai até a alteração por Enter | O editor abre na faixa alterada, o evento ganha `viewedAt` no disco e o ponto some sem o arquivo sair da árvore |
| 4 | Escreve e depois apaga um arquivo de fora | O nó continua na árvore marcado como removido, e abri-lo avisa em vez de abrir editor |
| 5 | Compara a árvore inteira com o ledger | Nenhuma linha divergente, e nenhum arquivo sem evento |
| Medição | — | Número de linhas, texto do tooltip, e o rótulo da tecla na Paleta |

O cenário termina com a varredura de log que todo cenário do arnês já faz: nenhum erro nem aviso do produto.

### 7.3 Regressão

- O arnês inteiro (os treze cenários de hoje mais o `T-0014`) roda na etapa Tester: a extração da §5.4 mexe em código já provado pelas fases de salto da E2-T4, do T-0008 ao T-0010.
- `npm run transpile-client`, `npm run typecheck-client`, `npx eslint` nos arquivos tocados, `node --experimental-strip-types build/hygiene.ts` e `npm run valid-layers-check`.

## 8. Critérios de aceite verificáveis

1. Existir a view `watchCode.changedOnly` no container do Explorer, recolhida, com o ícone e o nome definidos.
2. A árvore mostrar **só** pastas e arquivos com alteração no ledger — nenhum arquivo intocado.
3. A pasta aparecer na árvore quando tiver alteração embaixo, e só então.
4. Arquivo com alteração não vista carregar o ponto; a alteração vista não.
5. Arquivo com duas alterações, uma pendente, continuar com o ponto.
6. Arquivo cuja alteração mais recente é remoção aparecer com o ícone de removido.
7. Enter e duplo clique abrirem o arquivo na faixa de linhas da alteração mais recente.
8. Abrir marcar `viewedAt` **só** na alteração aberta, no evento do disco.
9. Arquivo removido avisar em vez de abrir editor.
10. F7 abrir e focar a view; apertado com a view em uso, recolher e devolver o foco ao editor.
11. A ligação do F7 excluir o contexto do editor de diff.
12. Escrita nova entrar na árvore sem recarregar a janela, inclusive com a view recolhida.
13. Marcar como vista pela lista da timeline apagar o ponto na árvore.
14. Sem alteração, o estado vazio; com a leitura falhando, o erro e o `Try Again`.
15. A derivação ser pura, sem DOM, e testada no `test-node` com os treze casos da §7.1.
16. `transpile-client`, `typecheck-client`, `eslint`, `hygiene` e `valid-layers-check` verdes.
17. `T-0014` aprovado no app, com o resultado obtido e a situação registrados em `testes-manuais.md`, e o arnês inteiro verde.
18. Nenhum arquivo de `contrib/files` tocado, e nada fora da lista da §5.

## 9. Limites e preços

1. **O Explorer de verdade continua mostrando tudo.** Quem esconde é a árvore do produto (D1); a opção B, que filtra a árvore de arquivos, fica como tarefa própria se o usuário a quiser.
2. **O F7 do produto vale sobre o "Go to Next Symbol Highlight" do editor comum**, porque o peso do workbench é maior que o do editor e a nossa ligação não pede contexto. Dentro do editor de diff a tecla continua sendo do VS Code. Se o usuário preferir preservar o salto de símbolo, basta somar o contexto do destaque ao `when` — uma linha.
3. **Uma linha por arquivo**: a árvore não mostra as alterações individuais de um mesmo arquivo; quem faz isso é a lista.
4. **O ponto vem do `viewedAt`**: alteração gravada antes da E2-T6 conta como pendente, como no resto do produto.
5. **A árvore é virtualizada**, como o Explorer e a lista: só existe linha para o que está à vista, e é isso que o arnês consegue conferir.
6. **Multi-raiz** repete o mesmo caminho relativo nos dois ramos.
7. **Sem contador no título e sem persistência** do estado aberto ou recolhido da view.

## 10. Divergências do plano e decisões pendentes

| # | O que o plano diz | O que a especificação corrige |
| --- | --- | --- |
| 1 | Critério de aceite 3: a pasta "some quando a última alteração dela sai" | Nada sai do ledger hoje — retenção e limpeza são a E5-T3. O critério fica: a pasta existe **enquanto** tiver alteração registrada embaixo. Não muda o entregável |
| 2 | Etapa 3 do plano: "registro da view no container do Explorer" | Fica explícito que o import em `workbench.common.main.ts` é etapa própria do Developer, e que sem ele a view não existe |
| 3 | §7.1, caso 9: "pasta do workspace sem alteração não aparece" | Com mais de uma pasta do workspace o evento pertence a **todas** elas — a chave é o recurso, como na decoração da E2-T7 —, então o caso só se verifica sem evento nenhum, e virou esse. É o mesmo limite já registrado em §9, item 6 |
| 4 | §7.1, decisão D7: "clique simples só seleciona" | Não procede: o clique é o gesto de abertura do próprio VS Code (`workbench.list.openMode`, padrão de um clique), e o `ResourceNavigator` dispara `onDidOpen` no clique, no Enter e no duplo clique — o mesmo que o Explorer faz. O comportamento ficou o da plataforma, e o teste manual confere o clique e o Enter |

Nenhuma decisão nova depende do usuário. A única submetida a ele é a **D1** (a forma do "só o que mudou"), registrada no plano com o preço da alternativa B.
