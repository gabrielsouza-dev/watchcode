# SPEC — E2-T2 · View da timeline

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T2 — View da timeline |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Entrada | @docs/watch-code/PLANS/e2-t2-view-da-timeline.md |
| Próxima etapa | Developer |

## 1. Referência

Plano: @docs/watch-code/PLANS/e2-t2-view-da-timeline.md. Decisões aprovadas:
**D1=A** (a lista é do produto), **D2=B** (a Timeline nativa sai),
**D3=A** (a linha mantém os quatro campos), **D4=A** (workspace inteiro),
**D5 = desenho 1** (view dentro do container do Explorer, recolhível).
A **D6** (marcar os arquivos alterados no Explorer) fica **fora desta tarefa** e
não bloqueia nada aqui.

## 2. Comportamento esperado

### 2.1 Onde a view mora

Uma view nova é registrada **dentro do container do Explorer**, logo abaixo da
árvore de arquivos, no mesmo lugar que a Timeline nativa ocupa hoje. O container
já existe e não é tocado: nenhum container novo, nenhuma barra de atividades nova.

- id da view: `watchCode.timeline`
- `order: 3` (depois de Open Editors `0`, árvore `1` e da Timeline nativa `2`, que
  sai conforme 2.6)
- `collapsed: true` — nasce recolhida
- `canToggleVisibility: true` e `canMoveView: true` — pode ser ocultada e movida de
  lugar pelo próprio VS Code, com a escolha persistida pelo container
- sem `when`: aparece sempre que o Explorer estiver aberto, com ou sem workspace

O recolher/expandir e o ocultar são os do `ViewPaneContainer`: não há código novo
para isso. O entregável "com opção de recolher a view" é atendido pelo
`collapsed: true` mais os gestos nativos do título da view.

### 2.2 Carga

A lista é montada **uma vez**, na primeira vez que o corpo da view fica visível:

1. `ITimelineService.getEvents()` — a porta da E2-T1.
2. Cada evento vira uma linha (`TimelineRow`) por derivação pura.
3. `list.splice(0, list.length, rows)`.

Nada de ler o disco: a view não conhece ledger, watcher nem hash.

### 2.3 Atualização incremental

`onDidChange` acrescenta **uma** linha, com `splice` no fim da lista. A lista não
é relida nem reconstruída a cada gravação.

Corrida coberta: um evento gravado **entre** o pedido da carga e a montagem da
lista não pode se perder nem entrar duas vezes. Por isso toda notificação que
chega com a carga em andamento fica num buffer; ao fim da carga, o buffer é
aplicado **depois** do `splice` inicial, com conferência por `id` — o mesmo
raciocínio que o serviço usa na E2-T1 (`recordedEarly`).

Notificação que chega com a lista já montada é aplicada na hora, também com
conferência por `id`, e é ignorada se o evento já estiver na lista.

### 2.4 A linha

Duas faixas, altura fixa de `44` px:

| Faixa | Conteúdo |
| --- | --- |
| 1 | ícone de arquivo (`Codicon.file`) + **nome do arquivo** |
| 2 | diretório · linhas · hora · origem |

Regras de conteúdo (D3=A, T1, T3):

- **diretório**: parte do caminho antes do último `/`; vazio → o trecho some.
- **linhas**: `12` quando início e fim coincidem, `12-14` quando não, e vários
  intervalos separados por `,`. Sem `linesChanged` → o trecho some. Hoje o campo
  não tem produtor (o diff é E3-T1), então na prática ele costuma sumir.
- **hora**: `HH:MM` local, como o produtor quer ("quando, hoje").
- **origem**: "Disk" para `attribution: 'observed'` e "Hook" para `'hook'`. Sem
  hook (hoje), é sempre "Disk".
- **tooltip** (hover gerenciado) no corpo da linha: caminho relativo completo,
  data e hora completas (`YYYY-MM-DD HH:MM`), linhas e origem.
- **status** (`current`/`history`) **não** aparece — é a E5-T1 (T4).

Os trechos vazios não deixam separador solto: juntam-se só os presentes, com
` · `.

### 2.5 Estados

| Estado | Quando | O que aparece |
| --- | --- | --- |
| Lista | há eventos | a lista |
| Vazio | carga concluída sem nenhum evento | lista escondida e a mensagem "No changes were observed yet." |
| Erro | `getEvents()` rejeitou | mensagem "The timeline could not be read." + botão **Try Again** |

O botão repete a carga. Isso funciona porque o serviço da E2-T1 limpa o estado de
carga quando a leitura falha e volta ao disco na consulta seguinte.

### 2.6 Aposentar a Timeline nativa (D2=B)

A view nativa (`timeline`, dentro do Explorer) deixa de aparecer, pelo mesmo
caminho declarativo da E0 — mas para **view**, não para container: a lista
existente só cobre containers, e o container do Explorer é do VS Code e fica.

### 2.7 Textos

Todos em inglês, via `localize`, como o resto do produto.

## 3. Contratos

**Nenhum contrato novo.** A tarefa não altera `ITimelineService`, `ChangeEvent`
nem o ledger: consome `getEvents()` e `onDidChange` como estão.

Tipos internos da tarefa, em `contrib/watchCode/common/timelineRows.ts`:

```ts
/** Linha pronta para desenhar: nada aqui depende de DOM ou de serviço. */
export interface TimelineRow {
	readonly id: string;
	readonly fileUri: string;
	/** Último segmento do caminho. */
	readonly fileName: string;
	/** Caminho até o arquivo, sem o nome; vazio quando o arquivo está na raiz. */
	readonly folderPath: string;
	/** '12', '12-14' ou vários intervalos separados por vírgula; vazio quando não há. */
	readonly lines: string;
	/** Hora local no formato HH:MM. */
	readonly clock: string;
	/** Data e hora locais no formato YYYY-MM-DD HH:MM, para o tooltip. */
	readonly fullTime: string;
	/** Como o evento foi obtido — é a "origem" mostrada na linha. */
	readonly attribution: ChangeEventAttribution;
}

export function buildTimelineRows(events: readonly ChangeEvent[]): TimelineRow[];
export function splitFilePath(fileUri: string): { fileName: string; folderPath: string };
export function formatLineRanges(linesChanged?: readonly ChangeLineRange[]): string;
export function formatClockTime(timestamp: number): string;
export function formatFullTime(timestamp: number): string;
```

Constantes de interface, em `contrib/watchCode/browser/timeline.contribution.ts`:

```ts
/** Id da view da timeline, exposto para o registro e para os testes. */
export const TIMELINE_VIEW_ID = 'watchCode.timeline';
```

E a altura da linha, junto do delegate, em `timelineView.ts`:
`TIMELINE_ROW_HEIGHT = 44`.

## 4. Alterações por arquivo

### 4.1 `src/vs/workbench/contrib/watchCode/common/timelineRows.ts` (novo)

Derivação pura, sem DOM, sem serviço, sem `localize`: só `ChangeEvent` entra,
`TimelineRow` sai. É o que permite testar a linha no `test-node`.
Comentários em português, código em inglês.

### 4.2 `src/vs/workbench/contrib/watchCode/browser/timelineView.ts` (novo)

`WatchCodeTimelineView extends ViewPane`:

- injeta `ITimelineService` e usa `IInstantiationService` para instanciar a
  `WorkbenchList` (o padrão de `openEditorsView.ts:260`);
- `renderBody(container)`: corpo com a classe `watch-code-timeline`, cria a lista
  (delegate, renderer e `accessibilityProvider`) e o nó da mensagem; dispara a
  primeira carga na primeira visibilidade do corpo;
- a notificação de `onDidChange` alimenta o buffer ou a lista (2.3);
- renderer `IListRenderer<TimelineRow, ...>` com o layout de 2.4 e o hover
  gerenciado (`this.hoverService.setupManagedHover`, como o próprio `ViewPane` faz
  no título);
- delegate com altura fixa; `identityProvider` por `id`;
- `accessibilityProvider` com rótulo por linha (arquivo, hora, origem) e rótulo do
  widget.

### 4.3 `src/vs/workbench/contrib/watchCode/browser/timeline.contribution.ts` (novo)

Registra a view no container do Explorer:

```ts
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
```

É o mesmo caminho da Timeline nativa (`timeline.contribution.ts:10,65`).

### 4.4 `src/vs/workbench/contrib/watchCode/browser/media/timelineView.css` (novo)

Altura do corpo e da lista, o layout das duas faixas, o corte por reticências e a
cor discreta da mensagem (`var(--vscode-descriptionForeground)`). Seletor escopado
em `.watch-code-timeline`, para não vazar para outras views.

### 4.5 `src/vs/workbench/contrib/watchCode/common/hiddenViews.ts` (alterado)

Ganha `HIDDEN_VIEW_IDS` com o id da Timeline nativa (`'timeline'`), com o
comentário do porquê (é o histórico de arquivo do VS Code; a lista do produto
ocupa o lugar).

### 4.6 `src/vs/workbench/contrib/watchCode/browser/hiddenViews.contribution.ts` (alterado)

Passa a esconder também as **views** da lista acima: procura em todos os
containers registrados (`viewsRegistry.getViews(container)`), desregistra as que
casarem e repete no `onViewsRegistered`, para pegar view registrada depois desta
contribuição — a Timeline nativa vem de um módulo carregado depois.

### 4.7 `src/vs/workbench/workbench.common.main.ts` (alterado)

Uma linha, junto das outras duas do produto (hoje nas linhas 478-479):
`import './contrib/watchCode/browser/timeline.contribution.js';`

### 4.8 `docs/watch-code/testes-manuais.md` (alterado)

Entrada nova do teste manual, no formato do arquivo (objetivo, pré-condições,
passos, resultado esperado, resultado obtido, situação).

## 5. Casos de borda e tratamento de erro

| Caso | Comportamento |
| --- | --- |
| Ledger sem nenhum evento | Estado vazio, não erro |
| Falha na leitura do ledger | Estado de erro + **Try Again**; a próxima tentativa pode dar certo |
| Falha de novo, depois do erro | Mensagem continua; a tentativa seguinte é possível |
| Evento gravado durante a carga | Buffer aplicado depois do `splice`, sem duplicar (2.3) |
| Evento repetido na notificação | Ignorado, por `id` |
| Arquivo na raiz do workspace | Linha 2 sem o diretório, sem separador solto |
| `linesChanged` ausente ou vazio | Trecho das linhas ausente |
| Vários intervalos de linha | `12-14, 20, 30-31` |
| Caminho com barra invertida ou prefixo `./` | Normalizado antes de partir o nome |
| Arquivo removido (sem `afterHash`) | Linha normal; o "sem depois" é assunto do diff (E3) |
| View recolhida ou oculta | Nada quebra; a lista continua recebendo os eventos |
| Sem workspace aberto | Lista vazia → estado vazio |

## 6. Plano de testes

### Automatizado (`test-node`), em `contrib/watchCode/test/common/timelineRows.test.ts`

| # | Teste |
| --- | --- |
| T1 | Um evento vira uma linha, com id, arquivo e origem preservados |
| T2 | A ordem cronológica da entrada é preservada |
| T3 | Entrada vazia → nenhuma linha |
| T4 | Caminho aninhado: nome e diretório separados |
| T5 | Arquivo na raiz: diretório vazio |
| T6 | Separador do Windows e prefixo `./` são normalizados |
| T7 | `linesChanged` ausente → linhas vazias |
| T8 | Linha única, intervalo e vários intervalos |
| T9 | Hora no formato `HH:MM`, com zero à esquerda |
| T10 | Data e hora completas no formato do tooltip |
| T11 | `observed` e `hook` chegam à linha como estão (a tradução é do renderer) |

Os testes que já existem do `hiddenViews` continuam passando com a lista nova: a
contribuição ganhou uma responsabilidade, não perdeu nenhuma.

### Manual (`docs/watch-code/testes-manuais.md`)

Um teste só: abrir o app, conferir que a view aparece **recolhida** abaixo da
árvore, expandir, rodar o script externo que altera arquivos
(`docs/watch-code/e2e/write-changes.ts`) e ver as linhas aparecerem **sem recarregar
a janela**, com arquivo, linhas, hora e origem; conferir o estado vazio num
workspace limpo; conferir que a Timeline nativa não aparece mais.

### Comandos

```
npm run transpile-client
npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"
npx eslint <arquivos alterados>
node --experimental-strip-types build/hygiene.ts
npm run valid-layers-check
```

## 7. Divergências do plano

1. **O plano (etapa 1) falava em container próprio com ícone no Activity Bar; a D5
   escolheu o desenho 1.** Não há container novo nem ícone na barra: a view entra
   no container do Explorer. Registrado; a **E7-T1** herda o ajuste do alvo do
   ícone.
2. **A linha usa "Disk"/"Hook" para `attribution`, e não o `source`.** O `source` é
   sempre `agent` (a IDE não escreve código), então a coluna "origem" só tem
   informação útil em `attribution` — que é o que o guia 3.2 chama de origem por
   eliminação.
3. **A data do tooltip é `YYYY-MM-DD HH:MM`, não o formato do sistema.** É
   determinística e testável; formatação dependente de locale não é.

## 8. Critérios de aceite verificáveis

1. A view `watchCode.timeline` é registrada no container do Explorer, com
   `order: 3`, `collapsed: true` e `canToggleVisibility`.
2. O corpo da view cria uma `WorkbenchList` com delegate de altura fixa e um
   renderer; a lista recebe todas as linhas de `getEvents()`, na ordem devolvida.
3. Uma notificação de `onDidChange` acrescenta uma linha por `splice`, sem reler a
   lista; evento já presente é ignorado; evento da corrida da carga não se perde e
   não duplica.
4. A linha mostra nome, diretório, linhas, hora e origem, sem separador solto
   quando faltar trecho.
5. Estado vazio e estado de erro com **Try Again** funcionando.
6. Nenhuma releitura do ledger pela view; nenhum acesso a disco, hash ou watcher.
7. `hiddenViews` passa a esconder a view nativa `timeline`, por lista declarativa,
   sem tocar no container do Explorer.
8. Os testes de `timelineRows` (T1-T11) passam; a suíte de `watchCode` continua
   verde.
9. `transpile-client`, `eslint` nos arquivos alterados, `hygiene` e
   `valid-layers-check` verdes.
10. A view aparece no app rodando, recolhida, e a Timeline nativa não aparece
    mais — com o resultado registrado no teste manual.
11. Nada fora de `contrib/watchCode`, `workbench.common.main.ts` e
    `docs/watch-code` é alterado.
12. Nenhum contrato existente muda: `ITimelineService` e `ChangeEvent` ficam como
    estão.

## 9. Decisões pendentes

Nenhuma desta tarefa. A **D6** (marcar arquivos alterados no Explorer e ocultar os
não alterados) segue pendente no plano e vira tarefa própria depois — não bloqueia
nem altera nada aqui.
