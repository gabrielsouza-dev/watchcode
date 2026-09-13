# SPEC — E2-T7 · Arquivos alterados no Explorer

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T7 — Arquivos alterados no Explorer |
| Workflow | High (derivação nova, provedor novo e teste manual) |
| Etapa | SpecWriter (2 de 5) |
| Plano | [`docs/watch-code/PLANS/e2-t7-arquivos-alterados-no-explorer.md`](../PLANS/e2-t7-arquivos-alterados-no-explorer.md) |
| Entrada | O plano aprovado e a decisão do usuário: opção **C** (cor para tocado + selo só enquanto não visto) |
| Saída | Esta SPEC → etapa Developer |

## 1. Decisões

| Decisão | Escolha | O que ficou decidido |
| --- | --- | --- |
| D1 — desenho da decoração | **C** (aprovada pelo usuário) | Cor para "o agente tocou" (todo arquivo com alteração) **e** o ponto só enquanto houver alteração não vista |
| D2 — onde o provedor entra | Decidida — é o backlog | `IDecorationsService.registerDecorationsProvider`; nenhuma linha de código do Explorer é tocada |
| D3 — qual cor | Decidida — local | `editorInfoForeground` (`editorInfo.foreground`), a mesma cor do ponto da timeline (`timelineView.css:57`); nenhuma cor nova é registrada |
| D4 — qual selo | Decidida — local, com preço | `Codicon.circleFilled` (`codiconsLibrary.ts:54`), o mesmo ícone da timeline, com `weight` explícito |
| D5 — pasta | Decidida — local | A pasta só sinaliza alteração **pendente**: a decoração do arquivo já visto não participa da agregação da pasta |
| D6 — de onde vem o dado | Decidida — óbvia | Função pura sobre `ITimelineService.getEvents()`; o provedor não guarda cópia da lista de eventos |
| D7 — quando atualizar | Decidida — óbvia | `onDidChange` (alteração nova) e `onDidMarkViewed` (ponto apagado) |
| D8 — escopo do recurso | Decidida — óbvia | Só recurso sob uma pasta do workspace é decorado |

**Decisões locais tomadas durante a especificação** (técnicas, reversíveis e consistentes com o padrão do módulo):

- **L1 — a chave do índice é o recurso, não o caminho relativo.** O índice guarda `uri.toString()`, obtido com `joinPath(pasta, caminhoDoEvento)` para cada pasta do workspace — a **mesma** operação que a view da timeline já usa (`timelineView.ts:553-555`). É o que faz um caminho com espaço (`meu arquivo.ts`) casar: `joinPath` codifica o espaço e a URI que o Explorer pergunta vem codificada igual, enquanto o caminho relativo gravado pelo watcher vem cru.
- **L2 — o caminho do evento é normalizado antes de virar recurso.** `indexTouchedFiles` e `resourcesOf` chamam `normalizeFileUri` antes do `joinPath`; sem isso uma barra invertida no caminho do evento viraria `%5C` na chave e a decoração nunca casaria.
- **L3 — "tocado" é presença no índice, e o valor é o estado.** `Map<string, TouchedFileState>` com `viewed` e `unviewed`: um só dado em vez de dois booleanos que podem se contradizer.
- **L4 — o peso é explícito nos dois estados (1000, o mesmo número que o chat usa).** Sem peso, quem vence a cor na mesclagem seria a ordem de registro dos provedores, que o produto não controla (`decorationsService.ts:173-216`).
- **L5 — erro de leitura é engolido.** Se `getEvents()` rejeitar, o índice fica como estava, nenhum aviso sai e a árvore continua funcionando: a decoração é um sinal a mais, e a árvore de arquivos não pode depender dela.
- **L6 — a consulta é síncrona; quem carrega é a contribuição.** `provideDecorations` responde do índice já em memória, então a árvore nunca espera leitura. A carga acontece na construção e a cada aviso.
- **L7 — só a decoração de pendência tem `bubble: true`.** É o `bubble` que faz a decoração do filho participar da agregação da pasta (`decorationsService.ts:347-366`), e ele fica só no estado `unviewed` — é o que faz a pasta sinalizar pendência e voltar ao normal depois da visita.
- **L8 — o rótulo do provedor é "Watch Code".** É o que o VS Code mostra em telas de diagnóstico de decoração; a view já se chama Timeline, e o produto é que assina a decoração.

## 2. Comportamento esperado

### 2.1 O caminho do dado

```text
escrita externa no disco
  → ledger.record ................................ evento gravado sem viewedAt
  → ITimelineService.onDidChange .................. avisa a alteração nova
  → TimelineDecorationsProvider ................... reconstrói o índice e avisa o recurso
  → Explorer repinta .............................. arquivo com cor + ponto

desenvolvedor vai até a alteração (F5, clique, setas, Enter, duplo clique)
  → ITimelineService.markViewed ................... grava viewedAt no evento
  → onDidMarkViewed ............................... avisa a alteração vista
  → TimelineDecorationsProvider ................... reconstrói o índice e avisa o recurso
  → Explorer repinta .............................. cor permanece, ponto some
```

### 2.2 Tabela de comportamento

| # | Situação | Antes da E2-T7 | Depois da E2-T7 |
| --- | --- | --- | --- |
| 1 | Arquivo com alteração não vista | Igual a todos os outros | Cor de "tocado" **e** o ponto |
| 2 | Arquivo cujo histórico inteiro já foi visto | Igual | **Só** a cor |
| 3 | Arquivo que o agente nunca tocou | Igual | Nada |
| 4 | Nova escrita num arquivo já visto | Só a cor | O ponto volta |
| 5 | Pasta com arquivo pendente dentro | Igual | Sinal de pendência na pasta |
| 6 | Última pendência da pasta visitada | — | O sinal da pasta some; a cor do arquivo fica |
| 7 | Timeline recolhida | — | A decoração não depende da view: o dado vem do serviço |
| 8 | `explorer.decorations.colors` desligado | — | A cor some e o ponto fica (quem esconde é o `ResourceLabel`) |
| 9 | `explorer.decorations.badges` desligado | — | O ponto some e a cor fica |
| 10 | App fechado e reaberto | — | A decoração volta: o dado está no ledger, no disco |
| 11 | Arquivo fora do workspace | — | Nada: não há evento com caminho relativo que o resolva |

### 2.3 Como o Explorer usa a decoração (fatos conferidos, não supostos)

| Fato | Onde | Consequência |
| --- | --- | --- |
| As classes de decoração entram no `extraClasses` do rótulo | `workbench/browser/labels.ts:687-717` | O elemento que carrega `monaco-decoration-itemColor` e `monaco-decoration-badge` é o `.monaco-icon-label` da linha; o nome do arquivo é o `.label-name` dentro dele |
| O tooltip da decoração é colado no title do rótulo com ` • ` | `labels.ts:694-701` | O tooltip do produto aparece junto do caminho: é por ele que o teste manual lê o texto localizado |
| `colors` e `badges` são chaves separadas do VS Code | `labels.ts:707-715` | Os dois sinais da opção C podem ser desligados um a um, sem código nosso |
| Pasta pergunta com `includeChildren`; arquivo não | `labels.ts:689` | Só pasta agrega o que está embaixo dela |
| Filho só agrega se tiver `bubble` | `decorationsService.ts:347-366` | É o `bubble` (L7) que faz a pasta saber do arquivo pendente |
| Com um `ThemeIcon` no dado, a regra da bolha não é criada e o ícone é | `decorationsService.ts:89-122` | A pasta mostra o **mesmo ponto** do arquivo, com o tooltip padrão do VS Code ("Contains emphasized items") — o sinal é o ponto, e não a bolha |
| A cor vencedora é a do maior peso; as outras viram fallback; o tooltip de todos é juntado | `decorationsService.ts:89-122` e `173-216` | Nosso texto aparece junto do tooltip do git no mesmo arquivo |

## 3. Contratos

### 3.1 `changeLedger/common/filePath.ts` — módulo novo

```ts
/**
 * Normaliza o caminho relativo de um arquivo do workspace.
 *
 * Separador `/`, sem o prefixo `./` e sem espaco nas pontas: e a forma com que o
 * ledger grava o caminho e com que o resto do produto compara arquivo.
 */
export function normalizeFileUri(fileUri: string): string;
```

Movido de `timelineService.ts` (era privado) para os três usuários da mesma regra — o serviço, a linha da lista e a decoração — usarem uma só.

### 3.2 `watchCode/common/timelineFileDecoration.ts` — módulo novo

```ts
/** Estado de um arquivo que o agente tocou, do ponto de vista da árvore. */
export type TouchedFileState = 'viewed' | 'unviewed';

/**
 * Índice dos arquivos tocados, pela chave do recurso (`uri.toString()`).
 *
 * Estar no índice é "o agente tocou neste arquivo"; o valor diz se ainda há
 * alteração não vista. Um arquivo com várias alterações é "não visto" enquanto
 * **uma** delas estiver pendente. Sem pasta de workspace, o índice sai vazio.
 */
export function indexTouchedFiles(events: readonly ChangeEvent[], folders: readonly URI[]): Map<string, TouchedFileState>;

/** Recursos de um caminho relativo do ledger, um por pasta do workspace. */
export function resourcesOf(folders: readonly URI[], fileUri: string): URI[];
```

### 3.3 `watchCode/browser/timelineDecorations.contribution.ts` — módulo novo

```ts
/** Id da contribuição do provedor de decoração. */
export const TIMELINE_DECORATIONS_ID = 'workbench.contrib.watchCode.timelineDecorations';

/** Dado do arquivo que o agente tocou e o desenvolvedor já viu. */
const TOUCHED_DECORATION: IDecorationData = {
	weight: 1000,
	color: editorInfoForeground,
	tooltip: localize('watchCode.decoration.touched', "Changed by the agent")
};

/** Dado do arquivo que o agente tocou e o desenvolvedor ainda não viu. */
const UNVIEWED_DECORATION: IDecorationData = {
	weight: 1000,
	color: editorInfoForeground,
	letter: Codicon.circleFilled,
	bubble: true,
	tooltip: localize('watchCode.decoration.unviewed', "Changed by the agent and not viewed yet")
};

export class TimelineDecorationsProvider extends Disposable implements IDecorationsProvider {

	readonly label: string;
	readonly onDidChange: Event<readonly URI[]>;

	provideDecorations(uri: URI): IDecorationData | undefined;
}
```

O provedor é registrado por uma `IWorkbenchContribution` que injeta `ITimelineService`, `IWorkspaceContextService` e `IDecorationsService` no construtor — sem acesso por `IInstantiationService` fora do construtor, como manda o padrão da casa.

## 4. Alterações por arquivo

### 4.1 `src/vs/platform/changeLedger/common/filePath.ts` — **novo**

O `normalizeFileUri` do §3.1, com o comentário em português explicando a forma canônica do caminho relativo.

### 4.2 `src/vs/platform/changeLedger/common/timelineService.ts`

A função privada `normalizeFileUri` (linhas 242-245) sai do arquivo e passa a ser importada do módulo novo. Nenhuma outra linha muda: `getEvents`, `getEventsForFile`, `getEvent`, `getSummary`, `markViewed`, `onDidChange` e `onDidMarkViewed` ficam como estão.

### 4.3 `src/vs/workbench/contrib/watchCode/common/timelineRows.ts`

`splitFilePath` passa a usar `normalizeFileUri` em vez de repetir a normalização na própria linha (linha 57). O comportamento é o mesmo: separador `/`, sem `./` e sem espaços nas pontas.

### 4.4 `src/vs/workbench/contrib/watchCode/common/timelineFileDecoration.ts` — **novo**

O módulo puro do §3.2, sem serviço, sem disco e sem interface:

```ts
export function indexTouchedFiles(events, folders) {
	const index = new Map<string, TouchedFileState>();

	for (const event of events) {
		const state: TouchedFileState = event.viewedAt === undefined ? 'unviewed' : 'viewed';

		for (const uri of resourcesOf(folders, event.fileUri)) {
			const key = uri.toString();

			// Não visto ganha de visto: uma pendência basta para o arquivo estar pendente.
			if (state === 'unviewed' || !index.has(key)) {
				index.set(key, state);
			}
		}
	}

	return index;
}
```

`resourcesOf` normaliza o caminho (L2) e devolve `joinPath(pasta, caminho)` para cada pasta; sem pastas, devolve lista vazia.

### 4.5 `src/vs/workbench/contrib/watchCode/browser/timelineDecorations.contribution.ts` — **novo**

1. Os dois dados de decoração do §3.3, criados uma vez e reaproveitados (o serviço guarda a referência por recurso).
2. `label` = "Watch Code" (L8); `onDidChange` como `Emitter<readonly URI[]>` registrado no `Disposable` da classe.
3. `provideDecorations(uri)`: consulta o índice por `uri.toString()` e devolve `UNVIEWED_DECORATION`, `TOUCHED_DECORATION` ou `undefined` (L6 — síncrono, sem tocar no disco).
4. Índice privado, pastas do workspace lidas de `IWorkspaceContextService.getWorkspace().folders` e preservadas em campo próprio.
5. `reload()`: lê `getEvents()`, refaz o índice e avisa a **união** das chaves antigas e novas — é o que repinta a árvore já desenhada quando a carga termina (o serviço já guardou "nenhuma decoração" para quem perguntou antes).
6. `refresh(fileUri)`: refaz o índice e avisa **só** os recursos daquele caminho (`resourcesOf`).
7. Assinaturas: `timelineService.onDidChange(change => void this.refresh(change.added.fileUri))`, `timelineService.onDidMarkViewed(event => void this.refresh(event.fileUri))` e `contextService.onDidChangeWorkspaceFolders(...)` refazendo as pastas e chamando `reload()`.
8. Erro: `reload` e `refresh` engolem a rejeição da leitura (L5) e nada avisam. Se a contribuição já foi descartada (`this._store.isDisposed`), a resposta tardia não toca no índice nem avisa.
9. `TimelineDecorationsContribution extends Disposable implements IWorkbenchContribution`, com `static readonly ID = TIMELINE_DECORATIONS_ID`, registrando provedor e contribuição em `DisposableStore` e subindo com `registerWorkbenchContribution2(..., WorkbenchPhase.AfterRestored)` — a mesma fase do indicador da observação.

### 4.6 `src/vs/workbench/contrib/watchCode/test/common/timelineFileDecoration.test.ts` — **novo**

A suíte do §6.1, no padrão das suítes existentes do módulo (`suite` e `test`, `assert.deepStrictEqual` comparando o mapa inteiro).

### 4.7 `docs/watch-code/e2e/run-manual-tests.ts`

Cenário **T-0013** (§6.3) com os ajudantes de leitura da árvore. Nenhum cenário existente muda de comportamento.

### 4.8 `docs/watch-code/testes-manuais.md`

Teste **T-0013** (§6.3), acrescentado ao registro acumulativo.

## 5. Casos de borda e tratamento de erro

| # | Caso | Comportamento |
| --- | --- | --- |
| B1 | Nenhum evento no ledger | Índice vazio; nenhuma decoração; nada é avisado |
| B2 | Janela sem pasta de workspace | Sem pastas não há recurso a resolver: índice vazio e nenhuma decoração (L1) |
| B3 | Arquivo fora do workspace | Não está no índice: o provedor devolve `undefined` |
| B4 | Caminho com espaço ou acento | A chave vem de `joinPath` codificado, e a consulta do Explorer também: casa (L1) |
| B5 | Caminho do evento com barra invertida | `normalizeFileUri` antes do `joinPath` transforma em `/`; sem isso a chave sairia com `%5C` (L2) |
| B6 | Ledger ilegível | A promessa de `getEvents()` é engolida (L5): índice anterior mantido, nenhum aviso, árvore intacta |
| B7 | Três alterações do mesmo arquivo, duas vistas | Fica `unviewed`: uma pendente basta |
| B8 | Aviso de alteração enquanto a carga inicial ainda corre | A carga joga o índice inteiro; o aviso seguinte já vem do índice novo |
| B9 | Pasta do workspace trocada (ou removida) | As pastas são relidas e o índice refeito; a união de chaves do `reload` limpa a decoração que não existe mais |
| B10 | `explorer.decorations.colors` ou `.badges` desligado | O VS Code desenha o que a chave permite; o produto não trata nada |
| B11 | Duas pastas do workspace com o mesmo caminho relativo | As duas chaves existem no índice e as duas linhas ficam decoradas — limite registrado no plano (multi-raiz) |
| B12 | Janela fechando com leitura em voo | A resposta tardia não toca no índice nem avisa (guarda de descarte, §4.5) |
| B13 | Alteração cujo arquivo foi removido do disco | O índice continua com a chave; a árvore não pergunta por arquivo que não mostra, então nada aparece e nada quebra |

## 6. Plano de testes

### 6.1 Unidade — `timelineFileDecoration.test.ts` (novo, 8 casos)

1. Lista de eventos vazia devolve mapa vazio.
2. Um evento sem `viewedAt` sai como `unviewed`.
3. Um evento com `viewedAt` sai como `viewed`.
4. Três alterações do mesmo arquivo, duas vistas, saem como `unviewed`.
5. Três alterações do mesmo arquivo, todas vistas, saem como `viewed`.
6. Dois arquivos diferentes saem com um estado cada.
7. Sem pasta de workspace, o mapa sai vazio.
8. `resourcesOf` devolve um recurso por pasta — e o caminho normalizado, com barra invertida virando `/`.

### 6.2 Unidade — suítes existentes

`timelineRows.test.ts` e a suíte do `changeLedger` continuam verdes sem teste novo: a mudança do §4.2 e do §4.3 é extração de função, e o comportamento é o mesmo — é o que elas provam.

### 6.3 Manual — `run-manual-tests.ts`, cenário T-0013

Registrado em `docs/watch-code/testes-manuais.md`, com arquivos de código (`.ts`, `.js`, `.cs`, como manda o `CLAUDE.md`). Seis fases, todas conferidas no app de verdade:

| Fase | O que faz | O que confere |
| --- | --- | --- |
| 0 | Janela aberta, nada tocado no passo | O arquivo de sonda (`aquecimento.ts`, escrito depois da subida) aparece na árvore com cor **e** ponto; o arquivo intocado do `prepare` não aparece decorado; a decoração existe **sem** a timeline ter sido aberta |
| 1 | Escrita externa em `decorado.ts` (`.ts`) | A linha do arquivo ganha cor e ponto; o evento no disco **não** tem `viewedAt` |
| 2 | F5 (ir até a alteração) | O ponto some daquela linha, a **cor permanece**, o `viewedAt` está no JSON do evento |
| 3 | Segunda escrita em `decorado.ts` | O ponto **volta** ao arquivo que já era visto |
| 4 | Escrita em `pasta-e2t7/arquivo.js`; depois visitar a alteração | A pasta aparece com o sinal de pendência; depois da visita o sinal da pasta some, e a linha do arquivo continua com a cor |
| 5 | Medição (não reprova) | Quantas linhas da árvore estão decoradas, e o texto do tooltip da linha decorada (prova do texto localizado) |

**Leitura da árvore no arnês** (fatos do §2.3, não suposição):

```text
linhas da arvore:  .explorer-folders-view .monaco-list-row
nome:              <linha> .label-name
cor:               <linha> [class*="monaco-decoration-itemColor"]
ponto:             <linha> [class*="monaco-decoration-badge"]
tooltip:           title (ou aria-label) do <linha> .monaco-icon-label
```

A sonda de aquecimento do arnês (`aquecimento.ts`) escreve antes de o cenário começar, então **toda conferência de contagem é por diferença**, nunca comparando com zero.

### 6.4 Níveis e comandos

```powershell
npm run transpile-client
npm run test-node -- --runGlob "**/changeLedger/test/**/*.test.js"
npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"
npm run typecheck-client
npx eslint <arquivos tocados>
npm run valid-layers-check
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0013
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts
```

## 7. Critérios de aceite

1. Existe um provedor registrado em `IDecorationsService`, e **nenhum** arquivo do Explorer foi alterado.
2. Arquivo com alteração no ledger recebe decoração com cor; arquivo sem alteração não recebe nada.
3. Arquivo com alteração não vista recebe cor **e** ponto; arquivo cujo histórico inteiro já foi visto recebe só a cor.
4. Arquivo com três alterações, duas vistas, continua com ponto — uma pendente basta.
5. Ir até a alteração apaga o ponto do arquivo na árvore sem apagar a cor.
6. Nova escrita num arquivo já visto faz o ponto voltar.
7. A pasta que contém arquivo pendente mostra sinal na própria pasta; depois da visita, o sinal some.
8. O arquivo que o agente nunca tocou não recebe decoração nenhuma.
9. O tooltip da decoração é localizado e diz o estado do arquivo.
10. A decoração não escreve no disco nem dispara gravação.
11. A normalização do caminho relativo tem um dono só: `changeLedger/common/filePath.ts`.
12. O provedor não guarda cópia da lista de eventos: toda leitura passa por `ITimelineService`.
13. Falha de leitura do ledger não quebra nem suja a árvore (L5) e não deixa aviso pendente depois do descarte.
14. T-0013 registrado em `testes-manuais.md` com objetivo, pré-condições, passos, resultado esperado, resultado obtido e situação, executado de fato.
15. `npm run typecheck-client`, `npx eslint` nos arquivos tocados, `npm run valid-layers-check`, a higiene e as suítes de unidade saem verdes, com as contagens novas anotadas no `overview.md`.
16. O arnês inteiro passa, incluindo o T-0013 e o T-0012 da tarefa anterior, com o log do produto sem erro nem aviso.
17. O preço da decisão D4 está registrado: num arquivo que também está modificado no git, o ponto toma o lugar da letra do git — o tooltip dos dois provedores continua aparecendo junto.

## 8. Limites e preços aceitos

| # | Limite | Preço | Por que foi aceito |
| --- | --- | --- | --- |
| 1 | Num arquivo também modificado no git, o ponto substitui a letra do git | Um sinal a menos na árvore para aquele arquivo | O mesmo comportamento que o chat do VS Code já tem com o próprio ícone; o tooltip do git continua no rótulo, e a cor do produto é a que o desenvolvedor vê |
| 2 | A cor do produto vence a cor do git nos arquivos que o agente tocou | O laranja de "modificado no git" não aparece nesses arquivos | Foi a decisão C do usuário: o rastro do agente é o sinal que o produto promete. Determinismo importa mais que a ordem de registro |
| 3 | Árvore virtualizada: linha fora da área visível não existe no DOM | A decoração de um arquivo fora da vista não é observável no teste | Mesmo limite já medido no T-0012, e do próprio VS Code |
| 4 | Workspace de várias raízes com o mesmo caminho relativo | As duas linhas ficam decoradas | O índice é por caminho resolvido contra cada pasta; caso raro, sem tarefa |

## 9. Divergências encontradas na execução

A tarefa saiu como a SPEC previa, com o que está registrado abaixo. Nada aqui mudou o que o
produto promete; o item 1 mudou **onde** o provedor é registrado, e os itens 2 e 3 são do arnês.

| # | Previsto | Executado | Motivo |
| --- | --- | --- | --- |
| 1 | §4.5: registrar o provedor numa `IWorkbenchContribution` | Foi preciso **também** importar o módulo em `src/vs/workbench/workbench.common.main.ts`, ao lado das outras contribuições do produto | Contribuição de workbench só existe se o módulo for importado. Sem o import o provedor nunca subia: a primeira execução do T-0013 reprovou em sete conferências, com a árvore inteira sem decoração e o ledger correto — o defeito era de registro, não da decoração |
| 2 | §6.3: ler o selo pela classe `monaco-decoration-badge` | O selo passou a ser lido pelo **estilo calculado do `::after`** do rótulo | O `labels.ts` põe a classe do selo em **toda** linha decorada, mesmo sem glifo nenhum desenhado: a classe não distingue "tem ponto" de "só tem cor". O estilo calculado distingue, e é o que prova o ponto |
| 3 | §6.3, fase 4: abrir a pasta com um clique na linha | O cenário confere primeiro o que já está na tela e só clica se a pasta estiver fechada | Depois da visita, quem abre a pasta é o **próprio Explorer**, que revela o arquivo ativo no editor. O clique numa pasta já aberta a **recolhe**, e foi isso que fez a primeira execução desta fase reprovar (`regra.js=ausente`). Com a conferência preliminar, a fase mostra `abriu=ja estava aberta` |
| 4 | §4.6: a suíte de unidade do módulo novo | A suíte foi escrita na etapa **Tester**, com os 8 casos previstos | Divisão do workflow: implementação no Developer, teste no Tester |
| 5 | — | O typecheck acusou `TS6138` (parâmetro `contextService` declarado como propriedade e nunca lido) e a correção foi feita antes de fechar a etapa | Erro real de compilação, pego pelo próprio `typecheck-client` |
| 6 | — | Uma execução do `typecheck-client` morreu com `fatal error: out of memory` no `tsgo` | Instabilidade do ambiente (a máquina estava com o app de ontem aberto). Rodado de novo com a máquina livre, saiu com código 0 |

**Contagens de teste.** A suíte do `watchCode` foi de **45 para 53** casos (os 8 do módulo novo
`timelineFileDecoration`); a do `changeLedger` ficou em **158** — a mudança lá é extração de função,
e nenhum comportamento mudou. O arnês passou a ter **treze** cenários, com o T-0013 no fim.


