# SPEC — E1-T2 · Ledger e snapshots

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Tarefa | E1-T2 — Ledger e snapshots (etapa E1 · Núcleo) |
| Plano | `docs/watch-code/PLANS/e1-t2-ledger-snapshots.md` |
| Guia | `docs/watch-code/Workflow/overview.md` (§4, §7, §8, §9) |
| Depende | E1-T1 — contratos do evento (`feito`) |
| Próxima etapa | Developer |
| Módulo | `src/vs/platform/changeLedger/` |

## 1. Referência

Plano: `docs/watch-code/PLANS/e1-t2-ledger-snapshots.md`. Decisões fechadas nele:

| # | Decisão | Valor |
| --- | --- | --- |
| D1 | Local do ledger e dos snapshots | **A** — `workspaceStorageHome/<workspaceId>/changeLedger/` (aprovada pelo usuário) |
| D2 | Formato de persistência | **Um arquivo JSON por evento**, mais um índice derivado por arquivo |
| D3 | Nome do contrato | `IChangeLedgerService` em `common/changeLedgerService.ts` |

Esta tarefa **não altera** os tipos de E1-T1. Ela os persiste.

## 2. Comportamento esperado

O módulo entrega o **armazenamento** da linha do tempo. Ele é **passivo**: não observa disco, não abre sessão, não reage a evento nenhum e não decide qual era o "antes".

Quatro capacidades:

1. **Hash de conteúdo** — dado o conteúdo de um arquivo, devolver um endereço estável (SHA-1 em hex).
2. **Store de snapshots** — guardar conteúdo sob o seu hash e recuperá-lo depois; conteúdo idêntico ocupa um lugar só.
3. **Ledger de eventos** — gravar um `ChangeEvent` e ler de volta o histórico do workspace, sobrevivendo a fechar e reabrir.
4. **Regra de atualidade na gravação** — gravar um evento novo para um arquivo rebaixa o evento anterior daquele arquivo para `history`.

### 2.1 Fluxo típico

```
E1-T3/T4 (futuro)                    E1-T2 (esta tarefa)
─────────────────                    ───────────────────
conteúdo do arquivo  ────put──────►  snapshotStore.put()  ──►  <hash>
                                        │
monta o ChangeEvent  ────record────►  ledger.record(event)
                                        │
                                        ├─►  events/<id>.json        (fonte da verdade)
                                        └─►  index/<fileKey>.json    (derivado, atualidade)
                                        
E2-T1 (futuro)       ◄───read───────  ledger.read()  /  ledger.getSnapshots()
```

## 3. Contratos

### 3.1 `src/vs/platform/changeLedger/common/snapshotHash.ts`

Camada pura, sem I/O — testável isoladamente.

```ts
/** Hash de conteúdo no formato aceito pelo store: SHA-1 em hex minúsculo. */
export function computeContentHash(content: VSBuffer): Promise<string>;
```

Regras: determinístico (mesmo conteúdo → mesmo hash); hex minúsculo; 40 caracteres; funciona igual para binário e texto.

> `hashAsync` de `vs/base/common/hash.ts` já entrega exatamente isso e é reusado — nenhuma implementação de SHA-1 é escrita nesta tarefa.

### 3.2 `src/vs/platform/changeLedger/common/ledgerStorage.ts`

Camada pura de **layout de caminhos** e **validação de chave**. Sem I/O, sem serviço.

```ts
/** Layout de diretórios do ledger dentro do armazenamento do workspace. */
export interface ILedgerStorageLayout {
	readonly eventsDir: URI;
	readonly indexDir: URI;
	readonly snapshotsDir: URI;
}

/** Monta o layout a partir da raiz de armazenamento do workspace. */
export function createLedgerStorageLayout(workspaceStorageRoot: URI, workspaceId: string): ILedgerStorageLayout;

/** Caminho do arquivo de um evento. */
export function eventResource(layout: ILedgerStorageLayout, eventId: string): URI;

/** Caminho do índice de atualidade de um arquivo do workspace. */
export function fileIndexResource(layout: ILedgerStorageLayout, fileUri: string): URI;

/** Caminho de um snapshot. */
export function snapshotResource(layout: ILedgerStorageLayout, hash: string): URI;

/**
 * Converte o caminho relativo de um arquivo do workspace em uma chave segura
 * para nome de arquivo, estável e sem colisão entre caminhos distintos.
 */
export function fileKey(fileUri: string): string;

/** Verifica se uma string é um hash de conteúdo válido. */
export function isContentHash(value: unknown): value is string;
```

**Regras de `fileKey`** — é o ponto sutil do módulo:

| Entrada | Saída |
| --- | --- |
| `'src/base/strings.ts'` | hash de `'src/base/strings.ts'` em hex |
| `'src\\base\\strings.ts'` | **o mesmo** de `'src/base/strings.ts'` (separadores normalizados) |
| `'src/base/a.ts'` | **diferente** de `'src/base/b.ts'` |

A chave é o **hash do caminho normalizado**, e não o caminho literal. Isso evita que um caminho com `:`, `/` ou `\\` invalide o nome do arquivo no Windows, e garante que `a.ts` e `b.ts` nunca colidam.

Normalização: converter `\\` em `/`, remover `./` inicial, aparar espaços.

**Regras de `createLedgerStorageLayout`**: `workspaceStorageRoot` é a raiz recebida; o layout fica em `<workspaceId>/changeLedger/` com as três subpastas `events`, `index` e `snapshots`.

### 3.3 `src/vs/platform/changeLedger/common/snapshotStore.ts`

```ts
/** Store de conteúdo endereçado por hash. Só lê e escreve; não interpreta o conteúdo. */
export interface ISnapshotStore {
	/** Grava o conteúdo e devolve o seu hash. Conteúdo já existente não é reescrito. */
	put(content: VSBuffer): Promise<string>;
	/** Devolve o conteúdo de um hash, ou `undefined` se não existir. */
	get(hash: string): Promise<VSBuffer | undefined>;
	/** Informa se o conteúdo de um hash já está guardado. */
	has(hash: string): Promise<boolean>;
}
```

Contrato: `put` é **idempotente** — gravar o mesmo conteúdo duas vezes devolve o mesmo hash e ocupa um lugar só. `get` de hash inexistente devolve `undefined` (**não lança**). Hash malformado devolve `undefined` sem tocar o disco.

### 3.4 `src/vs/platform/changeLedger/common/changeLedgerService.ts`

```ts
export const IChangeLedgerService = createDecorator<IChangeLedgerService>('changeLedgerService');

/** Resultado da gravação de um evento. */
export interface IRecordEventResult {
	/** O evento gravado, com o `status` já aplicado pelo ledger. */
	readonly event: ChangeEvent;
	/** Id do evento que foi rebaixado para `history`, quando houve. */
	readonly supersededEventId?: string;
}

export interface IChangeLedgerService {
	readonly _serviceBrand: undefined;

	/** Store de snapshots deste workspace. */
	readonly snapshots: ISnapshotStore;

	/**
	 * Grava um evento e aplica a regra de atualidade: o evento anterior do mesmo
	 * arquivo passa a 'history' e o novo fica 'current'.
	 */
	record(event: ChangeEvent): Promise<IRecordEventResult>;

	/** Todos os eventos do workspace, em ordem cronológica crescente. */
	readAll(): Promise<readonly ChangeEvent[]>;

	/** Eventos de um arquivo do workspace, em ordem cronológica crescente. */
	readByFile(fileUri: string): Promise<readonly ChangeEvent[]>;

	/** Evento de um id, ou `undefined`. */
	readById(eventId: string): Promise<ChangeEvent | undefined>;

	/** Guarda o conteúdo de um arquivo e devolve o hash — atalho para o caso comum. */
	recordSnapshot(content: VSBuffer): Promise<string>;

	/** Conteúdo guardado sob um hash, ou `undefined`. */
	readSnapshot(hash: string): Promise<VSBuffer | undefined>;
}
```

### 3.5 `src/vs/platform/changeLedger/common/changeLedgerService.impl.ts`

Classe `ChangeLedgerService implements IChangeLedgerService`, com `IFileService`, `IEnvironmentService` e `IWorkspaceContextService` declarados **no construtor**, conforme a regra do repositório.

**Não** é registrada em `workbench.services` nesta tarefa — o registro no ponto de injeção pertence à tarefa que primeiro consumir o serviço (E1-T3). Esta tarefa entrega o contrato e a implementação.

## 4. Persistência — formato em disco

Raiz: `<workspaceStorageHome>/<workspaceId>/changeLedger/`

```
changeLedger/
├── events/
│   └── <eventId>.json          # um arquivo por evento — fonte da verdade
├── index/
│   └── <fileKey>.json          # índice por arquivo, derivado — atualidade
└── snapshots/
    └── <hash>                  # conteúdo bruto, nome = SHA-1
```

| Arquivo | Conteúdo |
| --- | --- |
| `events/<id>.json` | O `ChangeEvent` completo, serializado |
| `index/<fileKey>.json` | `{ "fileUri": string, "eventIds": string[], "currentEventId"?: string }` |
| `snapshots/<hash>` | Conteúdo do arquivo, sem transformação |

**Por que um arquivo por evento (D2):** gravar uma alteração **não** reescreve o histórico inteiro — apenas um arquivo novo de evento e o índice daquele arquivo. Também resiste a corrupção parcial: um evento ilegível não invalida os demais.

**O índice é derivado, não fonte da verdade.** Se ele sumir ou estiver corrompido, o serviço reconstrói varrendo `events/`. Isso mantém os dados recuperáveis.

`readAll` ordena por `timestamp` crescente, com `id` como desempate estável.

## 5. Regras de comportamento

### 5.1 Regra de atualidade (`current` → `history`)

Ao gravar um evento `E` para o arquivo `F`:

1. Se não existe índice para `F`, `E` nasce `current`.
2. Se existe e há um `currentEventId`, esse evento anterior é relido, seu `status` vira `history` e ele é regravado; `E` nasce `current` e o índice aponta para `E`.
3. Eventos `history` anteriores permanecem `history`.

O `status` é **do ledger**, não do chamador: o serviço regrava o evento com o status correto antes de persistir e devolve o evento efetivamente gravado em `IRecordEventResult.event`. Um `status` divergente vindo do chamador é sobrescrito.

`supersededEventId` é preenchido **somente** quando houve rebaixamento.

### 5.2 Isolamento entre arquivos e entre workspaces

Eventos de arquivos distintos não se afetam. Dois `workspaceId` diferentes usam raízes diferentes e nunca se misturam.

### 5.3 Falhas explícitas, sem exceção no fluxo de leitura

| Situação | Comportamento |
| --- | --- |
| `get`/`readSnapshot` de hash inexistente | `undefined` |
| `get` de hash malformado | `undefined`, sem tocar o disco |
| `readById` de id inexistente | `undefined` |
| `readAll` com um evento ilegível | O evento é **ignorado**; os demais são devolvidos |
| `readAll` sem diretório | Lista vazia |
| `record` com evento inválido | Rejeita com `Error` descritivo |

## 6. Casos de borda e tratamento de erro

1. Mesmo conteúdo gravado duas vezes → mesmo hash, um snapshot; a segunda gravação não reescreve o arquivo.
2. Conteúdos diferentes com o mesmo tamanho → hashes diferentes.
3. Conteúdo vazio → hash válido; é um snapshot legítimo (arquivo esvaziado).
4. Caminho `'src/a.ts'` e `'src\\a.ts'` → mesma chave de índice.
5. Caminhos que diferem só no último caractere → chaves diferentes.
6. Gravar três eventos para o mesmo arquivo → o 1º e o 2º são `history`, o 3º é `current`.
7. Gravar para o arquivo A não altera o `current` do arquivo B.
8. Reiniciar o serviço (nova instância) → `readAll` devolve o mesmo histórico.
9. Índice ausente mas eventos presentes → reconstruído pela varredura de `events/`.
10. `readAll` com o diretório `events/` inexistente → lista vazia, sem erro.
11. Hash com menos de 40 caracteres, com caracteres não hexadecimais ou de tipo errado → `undefined`.
12. `createFolder` sobre pasta existente → não é erro (tratado com `exists` antes, ou tolerado).

## 7. Alterações necessárias

| Arquivo | Ação | O quê |
| --- | --- | --- |
| `common/snapshotHash.ts` | criar | `computeContentHash` |
| `common/ledgerStorage.ts` | criar | `ILedgerStorageLayout`, `createLedgerStorageLayout`, `eventResource`, `fileIndexResource`, `snapshotResource`, `fileKey`, `isContentHash` |
| `common/snapshotStore.ts` | criar | `ISnapshotStore` + implementação sobre `IFileService` |
| `common/changeLedgerService.ts` | criar | `IChangeLedgerService`, `IRecordEventResult` e a implementação |
| `test/common/snapshotHash.test.ts` | criar | Testes de hash e layout (etapa Tester) |
| `test/common/changeLedgerService.test.ts` | criar | Testes do ledger (etapa Tester) |

Todos os arquivos levam o cabeçalho de copyright padrão. Código e identificadores em inglês; comentários em português. **Nada fora de `src/vs/platform/changeLedger/` é alterado** — em particular, nenhum registro em `workbench.services` nem em `services.ts`.

## 8. Plano de testes

Unidade, com `assert` do Node e `suite`/`test` globais (mesmo padrão de `test/common/changeEventParsing.test.ts`).

Para o store e o ledger, os testes usam um `IFileService` de **sistema de arquivos em memória** (`createFileSystemProviderError`/`InMemoryFileSystemProvider` de `vs/base/test/common/utils` ou o provedor de memória do próprio repositório), injetado no construtor — sem tocar o disco real e sem stub de global.

**`suite('snapshotHash')`** — determinismo; diferença entre conteúdos; hash vazio; formato hex de 40 caracteres; binário.

**`suite('ledgerStorage')`** — `fileKey` estável; separadores normalizados; sem colisão entre arquivos distintos; `isContentHash` aceitando/recusando; caminhos montados sob a raiz do workspace.

**`suite('snapshotStore')`** — `put`/`get` ida e volta; idempotência; `has`; hash inexistente → `undefined`; hash malformado → `undefined`; conteúdo vazio.

**`suite('changeLedgerService')`** — gravar e reler preservando todos os campos; aplicação da regra de atualidade; isolamento entre arquivos; persistência entre instâncias; `readByFile`; `readById`; `readAll` ordenado; lista vazia sem diretório; evento ilegível ignorado.

Comandos: `npm run compile-client` e os testes de unidade escopados ao módulo via `npm run test-node`.

## 9. Critérios de aceite verificáveis

| # | Critério | Verificação |
| --- | --- | --- |
| 1 | Tipos exportados conforme §3 | `npm run compile-client` |
| 2 | Ida e volta de `ChangeEvent` sem perda de campo | teste `round-trips an event` |
| 3 | Mesmo conteúdo → um snapshot e hash estável | teste `is content addressed` |
| 4 | Conteúdos diferentes → hashes diferentes | teste `differs for different contents` |
| 5 | Regra `current` → `history` na gravação | testes `supersedes the previous event` |
| 6 | Arquivos distintos não interferem | teste `isolates files` |
| 7 | Histórico sobrevive à recriação do serviço | teste `survives a new instance` |
| 8 | Hash inexistente devolve `undefined` sem lançar | teste `returns undefined for a missing hash` |
| 9 | `readAll` sem diretório devolve lista vazia | teste `handles a missing directory` |
| 10 | Nenhum arquivo fora do módulo alterado | inspeção do diff |
| 11 | Camadas continuam válidas | `npm run valid-layers-check` |

## 10. Decisões pendentes

Nenhuma. D1 está aprovada; D2 e D3 são locais e reversíveis, registradas no plano.

## 11. O que fica fora, explicitamente

| Não faz | Tarefa dona |
| --- | --- |
| Observar disco, watcher, agrupamento por pausa | E1-T4 |
| Calcular o baseline do "antes" (git/HEAD, store de sombra) | E1-T3 |
| Ligar/desligar a observação | E1-T5 |
| Consultas cronológicas e filtros da timeline | E2-T1 |
| Limite e limpeza do armazenamento | E5-T3 |
| Escrever o `.md` de propostas | E4-T3 |
