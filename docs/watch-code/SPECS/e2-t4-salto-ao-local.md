# Especificação — E2-T4 · Salto ao local

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T4 — Salto ao local |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Plano | @docs/watch-code/PLANS/e2-t4-salto-ao-local.md |
| Saída | Este documento → implementação → validação → relatório |

## 1. Referência

O plano fixou o **quê**, o **porquê** e as oito decisões, todas aprovadas pelo
usuário: o salto acompanha o evento ativo, mais Enter e duplo clique; o foco fica
onde estava; a aba é de pré-visualização; a rolagem é alternável com "centraliza
sempre" como padrão; a primeira faixa; aviso para arquivo ausente; `history` salta
sem aviso; nenhum comando novo.

Esta especificação fixa o **como**, com o mecanismo verificado no código do fork.

## 2. Comportamento esperado

### 2.1 O salto

Escolhido o evento ativo, o produto abre o arquivo do evento e coloca a seleção
na faixa de linhas alteradas. A abertura é **uma só chamada**:

```ts
this.editorService.openEditor({
	resource,
	options: {
		preserveFocus: true,
		pinned: false,
		revealIfOpened: true,
		ignoreError: true,
		selection: { startLineNumber, startColumn: 1, endLineNumber, endColumn: Number.MAX_SAFE_INTEGER },
		selectionRevealType
	}
});
```

**Por que a seleção vai por opção, e não aplicada depois.** `openEditor` chega em
`editorPanes.doSetInput` (`editorPanes.ts:425-447`), que trata os dois casos:

- entrada nova → `editorPane.setInput(...)` → `textResourceEditor.ts:86-89` chama
  `applyTextEditorOptions`;
- entrada **já aberta** → volta cedo, mas chama `editorPane.setOptions(options)`
  (`editorPanes.ts:443`) → `textCodeEditor.ts:82-88` chama `applyTextEditorOptions`.

Ou seja: a opção vale nos dois casos, sem precisar pegar o controle do editor
depois. E `applyTextEditorOptions` (`editorOptions.ts:22-49`) faz exatamente o que
o salto precisa: aplica a seleção com a fonte `NAVIGATION` e revela.

### 2.2 Os três gatilhos, e um único ponto de entrada

| Gatilho | Caminho | Opções de abertura |
| --- | --- | --- |
| F5 / Shift+F5 (foco em qualquer lugar) | `navigate` → `moveActive` | padrão: `preserveFocus: true`, `pinned: false` |
| clique e setas na lista | `onDidSelect` | padrão |
| Enter | `onDidOpen` (teclado) | as do evento: `preserveFocus: true`, `pinned: false` |
| duplo clique | `onDidOpen` (mouse) | as do evento: `preserveFocus: false`, `pinned: true` |

A duplicação da E2-T3 sai: `moveActive` e `onDidSelect` passam a chamar o mesmo
método privado.

```ts
/** Grava o evento ativo, acompanha a seleção, salta e avisa quem observa. */
private setActiveEvent(id: string, editorOptions?: IEditorOptions): void

/** Abre o arquivo do evento e revela as linhas alteradas. */
private async reveal(event: ChangeEvent | undefined, editorOptions?: IEditorOptions): Promise<void>
```

- `moveActive` e `onDidSelect` chamam `setActiveEvent(id)`.
- `onDidOpen` (`this.list.onDidOpen`) chama `setActiveEvent(row.id, event.editorOptions)`
  quando a linha ainda não é o evento ativo, e `reveal(...)` direto quando já é —
  é isso que faz o Enter funcionar numa linha parada.
- As opções do evento vêm do `ResourceNavigator` (`listService.ts:705-756`): teclado
  e clique único abrem em pré-visualização sem roubar o foco; duplo clique abre
  fixo e com o foco. É a leitura que o usuário aprovou na D1/D2/D3 e o que sustenta
  a promessa de que o duplo clique guarda a aba.
- Duas chamadas seguidas em clique e setas (a seleção muda e o `onDidOpen` dispara)
  caem no mesmo evento, com as mesmas opções: a segunda é idempotente — mesmo
  arquivo, mesma seleção, mesmo editor. Fica registrado em vez de virar caso
  especial.

`onDidChangeActive` continua disparando **uma vez** por mudança de evento ativo, no
fim de `setActiveEvent`, e continua sem consumidor externo.

### 2.3 O que o salto faz, passo a passo

1. Resolve o recurso: `joinPath(pasta, event.fileUri)`, com a primeira pasta do
   workspace — a mesma regra do `changeRecorderService.resolveResource`
   (`changeRecorderService.ts:188-192`). Sem pasta, `URI.file(fileUri)`.
2. Pergunta ao `IFileService` se o recurso existe.
3. Chama `planReveal(event, existe)` (§3.1).
4. **Se o evento ativo mudou durante os awaits, para aqui** — ver §2.6.
5. `file` → `openEditor` da §2.1. `missing` → aviso (§2.4).

### 2.4 Quando não há o que abrir (D6)

| Motivo | Texto (`localize`, inglês) |
| --- | --- |
| `removed` — o evento registra uma remoção (`afterHash` ausente) | "This change removed the file. Nothing to open." |
| `absent` — o arquivo do evento já não está no disco | "The file of this change is no longer in the workspace." |

Via `INotificationService.info(message)` — não modal e sem ação. Nenhum editor é
aberto em nenhum dos dois casos.

### 2.5 Evento `history` (D7)

Salta igual a `current`: nenhum aviso, nenhum caminho separado. `planReveal` **não
lê** `event.status`. Quando a faixa já não existir no arquivo, o editor valida a
posição e limita à última linha — comportamento do próprio editor, conferido no
T-0008.

### 2.6 Corrida (F5 em rajada)

`reveal` é assíncrona e começa com uma leitura do disco. A guarda é uma linha:

```ts
if (event.id !== this.activeId) {
	return; // outro evento já é o ativo: quem manda é ele
}
```

Logo depois do `await this.fileService.exists(...)`. Nada de fila nem de
cancelamento: a abertura que perdeu a corrida simplesmente não acontece, e a que
ganhou acontece na ordem em que o usuário pediu.

### 2.7 A rolagem é configurável (D4)

`selectionRevealType` recebe:

| `watchCode.timeline.centerOnReveal` | Valor | Efeito |
| --- | --- | --- |
| `true` (padrão) | `TextEditorSelectionRevealType.Center` | centraliza sempre |
| `false` | `TextEditorSelectionRevealType.CenterIfOutsideViewport` | só rola quando as linhas estão fora da área visível |

Vale registrar: `Center` já é o padrão do próprio VS Code
(`platform/editor/common/editor.ts:523-524`), então o modo aprovado como padrão é
também o que acontece se a configuração não existir.

### 2.8 Textos

Todos por `localize`, em inglês, com o prefixo `watchCode.timeline.`. Nenhum texto
novo aparece na linha da lista; as duas strings desta tarefa são as do aviso de
§2.4, mais o título e a descrição da configuração de §3.2.

## 3. Contratos

### 3.1 Módulo novo, puro

`src/vs/workbench/contrib/watchCode/common/changeReveal.ts` — sem DOM, sem
serviço, sem `localize`, testável no `test-node`:

```ts
/** Por que não há o que abrir. */
export type RevealMissReason = 'removed' | 'absent';

/** O que o salto deve fazer com um evento. */
export type RevealPlan =
	| { readonly kind: 'file'; readonly range: ChangeLineRange | undefined }
	| { readonly kind: 'missing'; readonly because: RevealMissReason };

/**
 * Decide o salto, sem tocar em disco, em editor ou em serviço.
 *
 * O status do evento não entra na conta: um evento histórico salta igual a um
 * atual (decisão D7).
 */
export function planReveal(event: ChangeEvent, fileExists: boolean): RevealPlan
```

Regras, na ordem em que são avaliadas:

1. `afterHash === undefined` → `{ kind: 'missing', because: 'removed' }`. A remoção
   tem precedência: o arquivo pode até existir de novo, mas a alteração registrada
   foi removê-lo.
2. `!fileExists` → `{ kind: 'missing', because: 'absent' }`.
3. Caso contrário → `{ kind: 'file', range }`, com `range = event.linesChanged?.[0]`
   (a primeira faixa — D5), `undefined` quando não há faixas.

O campo `range` é **sempre** declarado, inclusive quando é `undefined`: é o que
mantém a comparação de instantâneo nos testes sem ambiguidade.

### 3.2 Configuração nova

`src/vs/workbench/contrib/watchCode/browser/timelineConfiguration.contribution.ts`
— módulo de registro, avaliado por causa do import da view:

```ts
/** Diz se o salto centraliza a alteração na tela, em vez de rolar só o necessário. */
export const CENTER_ON_REVEAL_SETTING = 'watchCode.timeline.centerOnReveal';
```

```ts
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'watchCode',
	title: localize('watchCode.configurationTitle', "Watch Code"),
	type: 'object',
	properties: {
		[CENTER_ON_REVEAL_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('watchCode.timeline.centerOnRevealDescription', "Center the change on the screen when jumping to it. When off, the view only scrolls if the lines are outside the visible area.")
		}
	}
});
```

O nó `watchCode` é o do produto: as próximas opções entram nele, sem nó novo.

**Módulo separado de propósito.** A chave é escrita no módulo de registro e lida
na view. Se ela morasse em `timeline.contribution.ts`, a view importaria o módulo
que importa a view — ciclo com `registerViews([... new SyncDescriptor(WatchCodeTimelineView)])`
rodando no topo do módulo, ou seja, classe ainda não avaliada. O módulo novo não
importa a view: o ciclo não existe.

**Quem avalia o módulo:** `timelineView.ts` o importa. A view é importada por
`timeline.contribution.ts`, que por sua vez é importado por
`workbench.common.main.ts` desde a E2-T2 — nenhuma linha nova naquele arquivo.

### 3.3 O que **não** muda

`ChangeEvent`, `ITimelineService`, `timelineNavigation.ts`, `timelineRows.ts`, o
registro da view, o CSS, o renderer, o delegate, os comandos de navegação e os
textos da linha. `navigate` continua com a mesma assinatura e o mesmo
comportamento; o que muda é o que acontece depois de o evento ativo andar.

## 4. Alterações por arquivo

| Arquivo | Ação | O que muda |
| --- | --- | --- |
| `contrib/watchCode/common/changeReveal.ts` | **criar** | `RevealPlan`, `RevealMissReason` e `planReveal` |
| `contrib/watchCode/browser/timelineConfiguration.contribution.ts` | **criar** | `CENTER_ON_REVEAL_SETTING` e o esquema |
| `contrib/watchCode/browser/timelineView.ts` | alterar | Serviços novos no construtor; `setActiveEvent`; `reveal`; `resolveResource`; `notifyMissing`; `onDidOpen`; leitura da configuração |
| `contrib/watchCode/test/common/changeReveal.test.ts` | **criar** | A decisão, no `test-node` |
| `docs/watch-code/e2e/run-manual-tests.ts` | alterar | Cenário **T-0008** |
| `docs/watch-code/testes-manuais.md` | alterar | Registro do T-0008 |
| `docs/watch-code/Workflow/overview.md` | alterar | Status da E2-T4 no backlog |

Nada fora disso: nem o serviço da timeline, nem o ledger, nem o `product.json`, nem
`workbench.common.main.ts`.

Serviços injetados a mais na view: `IEditorService`, `IWorkspaceContextService`,
`IFileService`, `INotificationService`. O `IConfigurationService` já vem da
`ViewPane` (`viewPane.ts:383`) e a view o repassa ao `super`
(`timelineView.ts:189`).

Imports novos na view: `URI`/`joinPath` (`base/common/resources.js`),
`IEditorOptions` (`platform/editor/common/editor.js`),
`TextEditorSelectionRevealType` (mesmo módulo), `IEditorService`
(`workbench/services/editor/common/editorService.js`), `IFileService`
(`platform/files/common/files.js`), `IWorkspaceContextService`
(`platform/workspace/common/workspace.js`), `INotificationService`
(`platform/notification/common/notification.js`), `planReveal` e
`CENTER_ON_REVEAL_SETTING`.

## 5. Casos de borda e erro

| Caso | Comportamento |
| --- | --- |
| Lista vazia, evento ativo ausente | `reveal(undefined)` volta sem fazer nada — nenhuma exceção |
| Evento sem `linesChanged` | Abre o arquivo sem `selection`; o editor fica onde estava |
| `linesChanged` com várias faixas | A primeira decide a seleção (D5); as outras são a E3-T3 |
| Faixa além do fim do arquivo | O editor valida a posição e limita à última linha |
| Arquivo apagado entre o `exists` e o `openEditor` | `ignoreError: true` engole o erro de abertura; nenhuma exceção sobe |
| Arquivo que é uma pasta (defeito conhecido da E1-T6) | `exists` é verdadeiro e a abertura não mostra nada; o defeito é da captura, não do salto, e segue registrado |
| Arquivo com editor que não é de texto (imagem, binário) | Abre; a opção de seleção é ignorada pelo editor que não é de texto |
| Pasta do workspace inexistente (nenhuma raiz) | `URI.file(fileUri)` — o mesmo critério do `changeRecorderService` |
| F5 em rajada | Só a última abertura vale (§2.6) |
| View recolhida | O salto não depende de a lista estar desenhada; ele nasce do evento ativo |
| `openEditor` devolvendo `null` | Nada acontece; nenhuma exceção |
| Evento ativo que sumiu da lista depois de uma recarga | Regra da E2-T3: vale como "sem evento ativo"; o salto não roda |

## 6. Plano de testes

### 6.1 Unidade — a decisão (T1 a T9)

`contrib/watchCode/test/common/changeReveal.test.ts`, no `test-node`, no estilo da
E2-T2/T3: uma asserção de instantâneo por teste, com `assert.deepStrictEqual` e um
construtor de evento de teste.

| # | Caso | Esperado |
| --- | --- | --- |
| T1 | Evento de remoção (`afterHash` ausente), arquivo existente | `{ kind: 'missing', because: 'removed' }` |
| T2 | Evento comum, arquivo inexistente | `{ kind: 'missing', because: 'absent' }` |
| T3 | Remoção **e** arquivo inexistente | `removed` — a remoção tem precedência |
| T4 | Sem `linesChanged` | `{ kind: 'file', range: undefined }` |
| T5 | `linesChanged` vazio | `{ kind: 'file', range: undefined }` |
| T6 | Uma faixa | `{ kind: 'file', range: [12, 14] }` |
| T7 | Várias faixas | `{ kind: 'file', range: [12, 14] }` — a primeira |
| T8 | `status: 'history'` com o mesmo resto | Plano idêntico ao de `current` |
| T9 | Evento parcial (sem `beforeHash`) | Nada muda no plano |

### 6.2 Manual — na aplicação rodando (T-0008)

Obrigatório: foco de teclado, aba e rolagem não têm como ser provados fora da
janela. No arnês, com o app em perfil isolado e a observação ligada, sobre um
arquivo de várias linhas (a alteração troca **uma** linha, para o número conferido
não ter ambiguidade — a seleção deixa o cursor no fim da última linha alterada):

1. Um F5 com o foco no editor abre o arquivo da alteração e o cursor cai na linha
   alterada (`status.editor.selection`).
2. Andar com as setas na lista troca o arquivo de destino e **o foco continua na
   lista**.
3. Apertar Enter numa linha que já é o evento ativo salta de novo.
4. Percorrer dois arquivos mantém **uma** aba só (pré-visualização).
5. Duplo clique fixa a aba (a contagem de abas passa a crescer).
6. Um arquivo removido pelo script: a linha existe na timeline, o salto **não**
   abre nada e o aviso aparece.
7. Uma entrada `history` (arquivo alterado duas vezes) salta sem erro, com o
   cursor dentro do arquivo.
8. Com `watchCode.timeline.centerOnReveal: false` no `.vscode/settings.json` do
   workspace preparado, um salto para uma linha já visível **não** mexe na
   rolagem.

Comandos:

```
npm run transpile-client
npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"
npx eslint <arquivos alterados>
node --experimental-strip-types build/hygiene.ts
npm run valid-layers-check
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0008
```

## 7. Divergências do plano

1. **A duplicação de gatilhos em clique e setas.** O plano previa "evento ativo
   muda" e "Enter/duplo clique". Como o `ResourceNavigator` tambem dispara
   `onDidOpen` em mudança de seleção por teclado (`listService.ts:689-716`), um
   clique e uma seta chegam aos dois caminhos. A segunda chamada é idempotente e
   ficou registrada em §2.2, em vez de virar um caso especial com estado extra.
2. **A configuração da D4 nasce num módulo novo**
   (`timelineConfiguration.contribution.ts`) e não em `timeline.contribution.ts`,
   por causa do ciclo view → contribution → view (§3.2). O plano dizia apenas
   "ao lado do registro da view".
3. **As opções de abertura do duplo clique são levadas em conta.** O plano não
   falava do assunto; usar as do `IOpenEvent` foi o que preservou a promessa de
   que o duplo clique fixa a aba, sem contrariar D2 e D3 nos outros gestos.
4. **`Center` já é o padrão do VS Code** para `selectionRevealType`
   (`platform/editor/common/editor.ts:523-524`): o modo B da D4 não precisa de
   configuração para valer, só o modo A precisa pedir `CenterIfOutsideViewport`.

5. **A posição é aplicada no editor, e não pedida por opção de abertura.** O plano e
   o §2.1 previam `selection` e `selectionRevealType` nas opções do `openEditor`. Na
   janela, isso não move a vista: num arquivo **já aberto** o VS Code só reaplica as
   opções, e a rolagem que vem delas é **suave** — que não anda quando a janela não
   está desenhando quadros. O salto passou a aplicar a posição na mão
   (`setSelection` + `revealRangeInCenter*` com `ScrollType.Immediate`), e a faixa é
   limitada ao tamanho do arquivo antes de virar seleção.
6. **`selectionNavigation: true` na lista.** O §2.2 listava "clique e setas" como
   gatilhos, mas as setas moviam só o foco: a lista do workbench faz a seleção
   seguir o foco apenas quando recebe essa opção (`listService.ts:123`,
   `listCommands.ts:38-56`). Sem ela, o gesto que o usuário descreveu na D2 — andar
   com a seta e saltar com Enter — não existia.
7. **As opções padrão de abertura quando o gatilho não traz nenhuma.**
   `preserveFocus` **ausente não é o mesmo que falso**: sem opções, o VS Code abre
   focando o editor, e o F5 roubava o foco a cada passo — contra a D2. O caminho do
   F5 e o do clique passaram a usar `{ preserveFocus: true, pinned: false }` por
   padrão, e só o duplo clique (que traz as opções do `IOpenEvent`) abre fixo e com
   foco.
8. **A faixa de linhas ganhou um produtor, por decisão do usuário na execução.**
   `ChangeEvent.linesChanged` era declarado, validado e lido — e **nunca gravado**:
   o `changeRecorderService` montava o evento sem o campo. Sem faixa, o salto abria
   o arquivo e parava em `Ln 1, Col 1`. O produtor mínimo (`changedLineRange`, no
   módulo do ledger) compara o "antes" com o "depois" e grava uma faixa; a E3-T1
   troca por hunks no mesmo campo. Consequência: **arquivo novo** tem o arquivo
   inteiro como faixa, e evento **parcial** (sem "antes") fica sem faixa — o salto
   abre o arquivo sem seleção. É uma alteração no módulo do ledger, fora do
   `contrib/watchCode`, autorizada pelo usuário depois de apresentada.
9. **O teste manual virou dois cenários.** A D4 tem dois valores a comprovar, e um
   cenário só não consegue mudar a configuração no meio da execução: o **T-0008**
   cobre o padrão (centraliza sempre) e o **T-0009**, com
   `watchCode.timeline.centerOnReveal: false` no `.vscode/settings.json` do
   workspace preparado, cobre o outro valor.

## 8. Critérios de aceite verificáveis

1. O arquivo do evento ativo abre com a faixa de `linesChanged` selecionada e
   visível, em um gesto.
2. Os três gatilhos funcionam: F5/Shift+F5, clique/setas e Enter/duplo clique.
3. Enter numa linha que já é o evento ativo salta de novo.
4. O foco do teclado continua onde estava em F5, clique, setas e Enter; o duplo
   clique abre fixo e com o foco.
5. Percorrer arquivos distintos reusa a mesma aba de pré-visualização.
6. Evento sem `linesChanged` abre o arquivo sem seleção, sem erro.
7. Remoção e arquivo ausente produzem aviso, um texto por motivo, e nenhum editor
   é aberto.
8. `history` salta sem aviso e sem exceção.
9. F5 em rajada termina no arquivo do último evento ativo.
10. `planReveal` cobre a tabela de §3.1, provada por T1-T9.
11. `watchCode.timeline.centerOnReveal` existe, nasce `true`, aparece na interface
    de Configurações e muda de fato a rolagem nos dois valores.
12. `ChangeEvent`, `ITimelineService`, os comandos de navegação e a API da view
    entregue na E2-T3 continuam compatíveis.
13. Nada fora de `contrib/watchCode` e da documentação é alterado.
14. `transpile-client`, `test-node`, `eslint`, `hygiene`, `valid-layers-check` e
    o T-0008 verdes.
15. O T-0008 fica registrado em `docs/watch-code/testes-manuais.md` com resultado
    obtido e situação.

## 9. Decisões pendentes

Nenhuma. As oito decisões foram aprovadas pelo usuário antes desta especificação.
