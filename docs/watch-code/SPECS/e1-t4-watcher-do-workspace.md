# Especificação — E1-T4 · Watcher do workspace

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T4 — Watcher do workspace |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Plano | [docs/watch-code/PLANS/e1-t4-watcher-do-workspace.md](../PLANS/e1-t4-watcher-do-workspace.md) |
| Guia | docs/watch-code/Workflow/overview.md (§3.1, §3.3, §3.5, §4, §7, §8) |
| Próxima etapa | Developer |

## 1. Comportamento esperado

O serviço observa as pastas do workspace e, a cada escrita externa, registra um
evento no ledger. É o primeiro consumidor do `IChangeRecorderService` que a
E1-T3 deixou pronto.

### 1.1 Fluxo

```
escrita externa (agente, script, terminal, pessoa)
        |
        v
IFileService.createWatcher(folder)   <- um watcher por pasta
        |  FileChangesEvent
        v
descarte de ruido (caminho ignorado)
        |
        v
agrupamento por pausa -> sessionId
        |
        v
IChangeRecorderService.recordChange()  -> ledger
```

### 1.2 Regras

1. **Uma sessão de observação por pasta** do workspace, aberta em `start()`.
2. A observação nasce **ligada**: `stop()` só existe para a E1-T5.
3. Cada evento observado tem origem agente e atribuição observada.
4. O `fileUri` gravado é o **caminho relativo à pasta de origem**, com `/`.
5. Escritas separadas por menos de **1500 ms** pertencem ao mesmo `sessionId`.
6. Um silêncio maior que 1500 ms fecha a sessão; a escrita seguinte abre outra.
7. Caminhos ignorados **nunca** geram evento.
8. Falha ao registrar um arquivo **não** interrompe a observação.

### 1.3 Tipos de alteração (D2 = A)

| Tipo | Vira evento | `afterHash` |
| --- | --- | --- |
| `ADDED` | sim | presente |
| `UPDATED` | sim | presente |
| `DELETED` | sim | **ausente** |

## 2. Contratos

### 2.1 Alteração no `ChangeEvent` (D2 = A)

`afterHash` deixa de ser obrigatório:

```ts
export interface ChangeEvent {
	readonly id: string;
	readonly sessionId: string;
	readonly source: ChangeSource;
	readonly attribution: ChangeEventAttribution;
	readonly fileUri: string;
	readonly beforeHash?: string;
	/** Ausente quando o arquivo foi removido: o evento registra a remoção. */
	readonly afterHash?: string;
	readonly linesChanged?: readonly ChangeLineRange[];
	readonly timestamp: number;
	readonly status: ChangeEventStatus;
}
```

Consequência: `recordChange` deixa de rejeitar quando o arquivo não é legível
se a alteração for uma remoção. A leitura falha vira `afterHash` ausente.

### 2.2 `IObservedChange` — extensão

```ts
export interface IObservedChange {
	readonly fileUri: string;
	readonly sessionId: string;
	readonly attribution: ChangeEventAttribution;
	readonly timestamp: number;
	/** Pasta do workspace a que o caminho pertence. Ausente assume a primeira. */
	readonly folderUri?: URI;
}
```

`folderUri` é o que corrige o `resolveResource`, que hoje assume a primeira
pasta e portanto erra em workspace multi-pasta.

### 2.3 `IWorkspaceWatcherService` — novo

```ts
export const IWorkspaceWatcherService = createDecorator<IWorkspaceWatcherService>(ID);

export interface IWorkspaceWatcherService {
	readonly _serviceBrand: undefined;
	/** Liga a observação das pastas do workspace. Idempotente. */
	start(): void;
	/** Desliga a observação e fecha as sessões abertas. Idempotente. */
	stop(): void;
	/** Observação está ativa. */
	readonly isActive: boolean;
}
```

`ID` é a string literal do decorator, seguindo o padrão do módulo.

### 2.4 `SessionGrouper` — novo, testável sem disco

```ts
/** Decide o sessionId de uma escrita, agrupando as que estão próximas no tempo. */
export class SessionGrouper {
	constructor(pauseMs: number = DEFAULT_PAUSE_MS) { }

	/** Session id para uma escrita da pasta, abrindo sessão se necessário. */
	sessionFor(folderKey: string, timestamp: number): string;
	/** Fecha as sessões cuja pausa já venceu. */
	closeExpired(timestamp: number, closeSession: (sessionId: string) => void): void;
	/** Fecha tudo, no stop. */
	closeAll(closeSession: (sessionId: string) => void): void;
}
```

### 2.5 `isIgnoredPath` — novo, função pura

```ts
/** Diz se um caminho relativo deve ficar fora da observação. */
export function isIgnoredPath(fileUri: string): boolean;
```

### 2.6 `ChangeRecorderService.recordChange` — assinatura final

```ts
recordChange(change: IObservedChange): Promise<ChangeEvent>;
```

Passa a **não rejeitar** por arquivo ilegível: grava o evento de remoção.

## 3. Alterações necessárias

| Arquivo | Ação | O que muda |
| --- | --- | --- |
| `platform/changeLedger/common/changeEvent.ts` | alterar | `afterHash` opcional |
| `platform/changeLedger/common/changeRecorderService.ts` | alterar | `folderUri` em `IObservedChange`; remoção grava evento sem `afterHash`; `resolveResource` usa a pasta recebida |
| `platform/changeLedger/common/sessionGrouper.ts` | **criar** | `SessionGrouper` e `DEFAULT_PAUSE_MS` |
| `platform/changeLedger/common/ignoredPaths.ts` | **criar** | `isIgnoredPath` e a lista padrão (D3) |
| `platform/changeLedger/common/workspaceWatcherService.ts` | **criar** | o serviço, sobre `IFileService.createWatcher` |
| `platform/changeLedger/test/common/sessionGrouper.test.ts` | **criar** | agrupamento por pausa |
| `platform/changeLedger/test/common/ignoredPaths.test.ts` | **criar** | filtro de ruído |
| `platform/changeLedger/test/common/workspaceWatcherService.test.ts` | **criar** | observação sobre provider em memória |
| `platform/changeLedger/test/common/changeRecorderService.test.ts` | alterar | caso de remoção |
| `workbench/services/changeLedger/electron-browser/changeLedgerService.ts` | alterar | registrar `IWorkspaceWatcherService` |

### 3.1 Lista de caminhos ignorados (D3 = A)

Comparação por **segmento** de caminho, não por prefixo de string: `.git` casa
como segmento em qualquer profundidade, e `src/git/x.ts` **não** é ignorado por
causa de `.git`.

```
.git, .hg, .svn, node_modules, out, dist, .build, build, .aih
```

## 4. Casos de borda

| # | Caso | Comportamento |
| --- | --- | --- |
| 1 | Arquivo criado | evento, `afterHash` presente, baseline provavelmente ausente |
| 2 | Arquivo alterado | evento com antes e depois |
| 3 | Arquivo removido | evento **sem** `afterHash` |
| 4 | Pasta removida | a remoção da pasta é ignorada; não há evento por arquivo |
| 5 | Caminho em `.git/` | ignorado |
| 6 | Caminho fora do workspace | ignorado |
| 7 | Rajada de escritas abaixo de 1500 ms | mesmo `sessionId` |
| 8 | Escritas acima de 1500 ms | sessões distintas |
| 9 | Duas pastas do workspace | sessões independentes |
| 10 | Arquivo ilegível, não removido | registrado em log, observação segue |
| 11 | Workspace sem git | funciona, baseline cai para a sombra |
| 12 | `start()` duas vezes | idempotente, não duplica watcher |
| 13 | `stop()` e `start()` | reabre sem vazar disposable |
| 14 | Sem pasta no workspace | `start()` não faz nada |

## 5. Plano de testes

### 5.1 Unidade (obrigatório)

**`sessionGrouper.test.ts`** — sem disco, tempo injetado:
1. duas escritas próximas compartilham o id; 2. após a pausa, novo id;
3. pastas diferentes têm sessões independentes; 4. `closeAll` fecha tudo.

**`ignoredPaths.test.ts`** — função pura:
1. `.git/config` ignorado; 2. `node_modules/x/y.js` ignorado;
3. `src/git/x.ts` **não** ignorado; 4. `out/main.js` ignorado;
5. caminho comum não ignorado; 6. separador invertido tratado igual a `/`.

**`workspaceWatcherService.test.ts`** — sobre `InMemoryFileSystemProvider`:
1. escrita gera evento no ledger; 2. caminho ignorado não gera;
3. evento tem atribuição observada; 4. `start()` é idempotente.

### 5.2 Integração

O ledger já tem suíte própria (E1-T2) e o recorder também (E1-T3); a E1-T4
acrescenta o caso de remoção ao recorder.

### 5.3 Manual

Registrar em `docs/watch-code/testes-manuais.md`, porque exige o watcher nativo
do sistema operacional, que o provider em memória não exercita:

- **T-0003** — com a IDE aberta, um script externo altera um arquivo e o evento
  aparece no ledger com antes/depois corretos.

## 6. Critérios de aceite verificáveis

1. `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` passa.
2. `npx tsc --noEmit -p src/tsconfig.json` sem erros.
3. `npm run valid-layers-check` verde.
4. `node --experimental-strip-types build/hygiene.ts` verde.
5. `sessionGrouper` decide o `sessionId` sem tocar em disco.
6. `isIgnoredPath` é função pura, sem I/O.
7. `recordChange` grava remoção sem `afterHash` e não rejeita.
8. Nenhum arquivo fora de `platform/changeLedger` e
   `workbench/services/changeLedger` é alterado.

## 7. Decisões pendentes

Nenhuma. D1=A, D2=A, D3=A e D4=A estão aprovadas e refletidas acima.
