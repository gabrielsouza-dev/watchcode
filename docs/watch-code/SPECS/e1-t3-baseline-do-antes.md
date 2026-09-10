# SPEC — E1-T3 · Baseline do "antes"

| Campo | Valor |
| --- | --- |
| Plano | [`docs/watch-code/PLANS/e1-t3-baseline-do-antes.md`](../PLANS/e1-t3-baseline-do-antes.md) |
| Tarefa | E1-T3 — Baseline do "antes" |
| Workflow | High |
| Entrada | PLAN aprovado (D1=A, D2=A, D3=B, D4 confirmada) |
| Saída | Código implementado + testes |

## 1. Comportamento esperado

Quando o produto detecta que um arquivo do workspace mudou, ele precisa responder duas perguntas antes de gravar o evento:

1. **Qual era o conteúdo anterior?** — resolvido em três degraus, do melhor para o pior: **git `HEAD`** → **store de sombra** → **ausente**.
2. **Como registrar isso no ledger?** — sempre com o conteúdo atual guardado como `afterHash`; com `beforeHash` apenas quando o degrau 1 ou 2 respondeu.

O degrau 3 não é erro: é o **evento parcial**, previsto no §4.1 do guia (`beforeHash` ausente). O produto continua funcionando, com o "antes" indisponível.

Falha do git **nunca** propaga. Se o repositório não existe, o binário não está no PATH ou o comando falha, o baseline cai para a sombra — a captura por disco é a base universal e não pode depender do git responder.

Depois de registrar um evento, a sombra daquele arquivo passa a ser o conteúdo recém-registrado, para que a próxima alteração tenha um "antes" mesmo sem git.

## 2. Contratos

### 2.1 `platform/git` — leitura de blob em `HEAD` (**D1 = A**)

Acréscimo **aditivo** ao contrato existente. Nada do que já existe muda.

Em `src/vs/platform/git/common/localGitService.ts`, acrescentar ao `ILocalGitService`:

```ts
/**
 * Conteúdo de um arquivo no `HEAD`, ou `undefined` quando não há
 * versão anterior (arquivo novo, repositório sem commits, caminho fora do repo).
 */
show(repoPath: string, filePath: string): Promise<string | undefined>;
```

- `repoPath` — caminho nativo da raiz do repositório.
- `filePath` — caminho **relativo** do arquivo, com separador `/`.
- Devolve o conteúdo textual, ou `undefined` para "não há versão anterior".
- Erros de git são convertidos em `undefined` — a ausência de baseline não é uma exceção.

Em `src/vs/platform/git/node/localGitService.ts`, implementar com:

```
git show HEAD:<filePath>
```

executado em `repoPath`, com `generateUuid()` como `operationId` (mesmo padrão de `revParse`). Arquivo ausente em `HEAD`, índice sem commits e caminho inválido devolvem `undefined` em vez de rejeitar.

**Nota de tipagem:** o `_exec` atual devolve `stdout` como `string` porque todos os chamadores usam `encoding: 'utf8'`. Para `show`, o conteúdo de um arquivo é texto, mas os demais métodos não são afetados — a assinatura de `_exec` permanece.

### 2.2 `changeLedger/common/shadowStore.ts` (novo)

Store do **último conteúdo observado** de cada arquivo (**D2 = A**, **D3 = B**).

```ts
/** Sombra de um arquivo: o último conteúdo observado antes da alteração atual. */
export interface IShadowEntry {
	readonly fileUri: string;
	/** Hash do conteúdo guardado. */
	readonly contentHash: string;
	/** Epoch em milissegundos em que a sombra foi gravada. */
	readonly recordedAt: number;
}

export interface IShadowStore {
	/** Guarda o conteúdo como sombra do arquivo e devolve o hash. */
	put(fileUri: string, content: VSBuffer, recordedAt: number): Promise<string>;
	/** Sombra do arquivo, ou `undefined` quando nunca foi observado. */
	get(fileUri: string): Promise<IShadowEntry | undefined>;
}
```

- Persistida em `<workspaceStorageHome>/<workspaceId>/changeLedger/shadow/`.
- **Um arquivo por arquivo do workspace** — a sombra é sempre a última, não é histórico.
- O conteúdo vai para o store de **snapshots** existente; a sombra guarda só o ponteiro (hash). Assim um mesmo conteúdo nunca é gravado duas vezes.
- Mesmo tratamento de robustez do ledger: JSON ilegível ou ausente devolve `undefined`; falha ao gravar não derruba o chamador.

Acrescentar em `ledgerStorage.ts` (arquivo existente, uma linha de layout):

```ts
/** Índice por arquivo, derivado dos eventos: qual entrada está atual. */
readonly indexDir: URI;
/** Sombra: último conteúdo observado de cada arquivo. */
readonly shadowDir: URI;
```

e:

```ts
/** Caminho da sombra de um arquivo do workspace. */
export function shadowResource(layout: ILedgerStorageLayout, fileUri: string): URI;
```

reusando o `fileKey` já existente — o nome do arquivo continua sendo o hash do caminho normalizado.

### 2.3 `changeLedger/common/baseline.ts` (novo)

Consulta pura: "qual era o conteúdo deste arquivo antes?".

```ts
/** Degrau de qualidade do baseline obtido. */
export type BaselineOrigin = 'git' | 'shadow' | 'none';

export interface IBaseline {
	/** Conteúdo anterior, ausente quando `origin` é `'none'`. */
	readonly content?: VSBuffer;
	/** De onde veio o "antes". */
	readonly origin: BaselineOrigin;
	/** Hash do conteúdo anterior, ausente quando `origin` é `'none'`. */
	readonly contentHash?: string;
}

export interface IBaselineProvider {
	/** Resolve o "antes" de um arquivo do workspace. Nunca rejeita. */
	readonly resolve: (fileUri: string) => Promise<IBaseline>;
}

/** Baseline ausente: o evento nasce parcial. */
export const EMPTY_BASELINE: IBaseline = { origin: 'none' };
```

A implementação (`BaselineProvider`) recebe por construtor:

- a **raiz do repositório** (ou `undefined` quando o workspace não é um repositório git);
- uma função `readFromHead(fileUri)` que consulta o git — injetada, para que o teste não precise de um repositório real;
- o `IShadowStore`.

Ordem de resolução:

1. Se há raiz de repositório **e** `readFromHead` devolve conteúdo → origem `'git'`.
2. Senão, se a sombra tem entrada **e** o conteúdo dela ainda está no store → origem `'shadow'`.
3. Senão → `EMPTY_BASELINE`.

Regras:

- Qualquer rejeição de `readFromHead` é capturada e tratada como "git não respondeu"; **não** propaga.
- Sombra apontando para um hash que não está mais no store é tratada como ausente (não é `'shadow'` com conteúdo vazio).
- O `contentHash` devolvido é o **hash real do conteúdo** (`computeContentHash`), garantindo que git e sombra produzam o mesmo hash para o mesmo conteúdo.

### 2.4 `changeLedger/common/changeRecorderService.ts` (novo)

O serviço **ativo**: a partir de uma alteração já detectada, resolve o "antes", guarda o "depois" e grava o evento.

```ts
/** Alteração externa já detectada, à espera de registro. */
export interface IObservedChange {
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Identificador da sessão de observação. */
	readonly sessionId: string;
	/** Como a alteração foi obtida. */
	readonly attribution: ChangeEventAttribution;
	/** Epoch em milissegundos. */
	readonly timestamp: number;
}

export interface IChangeRecorderService {
	readonly _serviceBrand: undefined;

	/**
	 * Registra uma alteração externa: resolve o "antes", guarda o "depois"
	 * e grava o evento. Devolve o evento efetivamente gravado.
	 */
	recordChange(change: IObservedChange): Promise<ChangeEvent>;
}
```

Comportamento de `recordChange`:

1. Lê o conteúdo atual do arquivo pelo `IFileService`. **Se o arquivo não puder ser lido, rejeita** — não há "depois" e não há evento a gravar.
2. Guarda o conteúdo atual no store de snapshots (`recordSnapshot`) → `afterHash`.
3. Resolve o baseline pelo `IBaselineProvider` → `beforeHash` (ausente quando `origin === 'none'`).
4. Monta o `ChangeEvent`: `id` novo (`generateUuid()`), `sessionId`, `source: 'agent'`, `attribution`, `fileUri`, `beforeHash?`, `afterHash`, `timestamp`, `status: 'current'`. **Sem** `linesChanged` — diff é E3-T1.
5. Grava pelo `IChangeLedgerService.record`.
6. Atualiza a sombra do arquivo para o conteúdo atual.
7. Devolve o evento gravado.

O recorder **não** observa disco, **não** abre sessão e **não** agrupa nada. Essa é a E1-T4.

### 2.5 Registro dos serviços

Em `src/vs/workbench/workbench.desktop.main.ts` — é onde já se registra o que é exclusivo do desktop — acrescentar o módulo de registro:

```ts
import './services/changeLedger/electron-browser/changeLedgerService.js';
```

E criar `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts`:

```ts
registerSingleton(IChangeLedgerService, ChangeLedgerService, InstantiationType.Delayed);
registerSingleton(IChangeRecorderService, ChangeRecorderService, InstantiationType.Delayed);
```

O `BaselineProvider` e o `ShadowStore` **não** são serviços registrados: são criados pelo `ChangeRecorderService` a partir do layout, como o `SnapshotStore` já é criado pelo `ChangeLedgerService`.

### 2.6 Ponto de entrada do git no workspace

O `ILocalGitService` roda no **shared process** e é acessível pelo canal `'localGit'`. O `ChangeRecorderService` recebe, por construtor, uma função `readFromHead: (fileUri: string) => Promise<VSBuffer | undefined>` já ligada à raiz do workspace — mantendo o recorder testável sem repositório real. A ligação concreta (descobrir a raiz do repositório e chamar `show`) fica em um único módulo pequeno em `electron-browser/`.

## 3. Formato em disco

```
<workspaceStorageHome>/<workspaceId>/changeLedger/
├── events/      E-<uuid>.json
├── index/       <fileKey>.json
├── snapshots/   <sha1>          ← conteúdo, endereçado por hash
└── shadow/      <fileKey>.json  ← NOVO
```

`shadow/<fileKey>.json`:

```json
{
	"fileUri": "src/vs/base/a.ts",
	"contentHash": "9e590320...",
	"recordedAt": 1767225600000
}
```

Sempre `JSON.stringify(entry, undefined, '\t')`, como o resto do ledger.

## 4. Casos de borda

| # | Situação | Comportamento esperado |
| --- | --- | --- |
| 1 | Workspace não é repositório git | `readFromHead` não é chamada; baseline vai direto à sombra |
| 2 | Arquivo novo, sem `HEAD` e sem sombra | `origin: 'none'`; evento **sem** `beforeHash` |
| 3 | Arquivo novo, com sombra (já observado antes de ser removido do git) | `origin: 'shadow'` |
| 4 | Binário `git` ausente / comando falha | Rejeição capturada; cai para a sombra; nunca propaga |
| 5 | Sombra aponta para hash que não existe mais no store | Tratada como ausente; baseline vai para `'none'` |
| 6 | Arquivo ilegível no momento do registro | `recordChange` **rejeita**; nenhum evento é gravado |
| 7 | Conteúdo idêntico ao anterior | Evento é gravado normalmente; `beforeHash === afterHash`. Decidir se é ruído é da E5-T3 |
| 8 | Arquivo binário | Tratado como bytes; hash e snapshot funcionam igual |
| 9 | Mesmo arquivo alterado duas vezes | A sombra da segunda é o conteúdo da primeira |
| 10 | Diretório `shadow/` inexistente | `get` devolve `undefined`; `put` cria o diretório |
| 11 | JSON da sombra corrompido | `get` devolve `undefined`; não derruba a observação |
| 12 | Caminho do arquivo com `` no Windows | Normalizado pelo `fileKey` já existente; mesma sombra para `a/b` e `a\\b` |
| 13 | Conteúdo vazio (`''`) | `beforeHash` é o hash do vazio, não ausente — vazio **é** um conteúdo |
| 14 | Duas alterações seguidas sem pausa | Cada chamada gera seu próprio evento e sessão é responsabilidade da E1-T4 |

## 5. Alterações necessárias

| Arquivo | Ação | O que muda |
| --- | --- | --- |
| `platform/git/common/localGitService.ts` | alterar | acrescenta `show` ao `ILocalGitService` |
| `platform/git/node/localGitService.ts` | alterar | implementa `show` com `git show HEAD:<path>` |
| `changeLedger/common/ledgerStorage.ts` | alterar | `shadowDir` no layout + `shadowResource` |
| `changeLedger/common/shadowStore.ts` | **criar** | `IShadowStore` / `IShadowEntry` / `ShadowStore` |
| `changeLedger/common/baseline.ts` | **criar** | `IBaseline`, `BaselineOrigin`, `IBaselineProvider`, `BaselineProvider`, `EMPTY_BASELINE` |
| `changeLedger/common/changeRecorderService.ts` | **criar** | `IChangeRecorderService`, `IObservedChange`, `ChangeRecorderService` |
| `workbench/services/changeLedger/electron-browser/changeLedgerService.ts` | **criar** | registro dos dois singletons |
| `workbench/services/changeLedger/electron-browser/gitHeadReader.ts` | **criar** | liga `ILocalGitService.show` à raiz do workspace |
| `workbench/workbench.desktop.main.ts` | alterar | um `import` do módulo de registro |
| `changeLedger/test/common/baseline.test.ts` | **criar** | testes do baseline |
| `changeLedger/test/common/changeRecorderService.test.ts` | **criar** | testes do recorder |
| `changeLedger/test/common/shadowStore.test.ts` | **criar** | testes da sombra |

Nenhum arquivo existente tem comportamento alterado; `platform/git` só ganha um método.

## 6. Plano de testes

**Unidade** (`npm run test-node`, padrão dos testes da E1-T2: `FileService` + `InMemoryFileSystemProvider`, `ensureNoDisposablesAreLeakedInTestSuite`).

`baseline.test.ts`:
1. git responde → origem `'git'` e conteúdo correto.
2. git não responde (rejeita) → cai para sombra.
3. Sem git, com sombra → origem `'shadow'`.
4. Sem git e sem sombra → origem `'none'`, sem `content`.
5. Sombra órfã (hash ausente do store) → `'none'`.
6. Sem raiz de repositório, `readFromHead` não é chamada.
7. Conteúdo vazio é baseline válido, não ausente.

`shadowStore.test.ts`:
8. `get` sem nunca ter gravado → `undefined`.
9. `put` seguido de `get` devolve o hash e o horário.
10. `put` duas vezes → a segunda sobrescreve.
11. JSON corrompido → `undefined`.

`changeRecorderService.test.ts`:
12. Alteração com git → evento com `beforeHash` e `afterHash` distintos.
13. Alteração sem baseline → evento **sem** `beforeHash` (evento parcial).
14. Evento traz `source: 'agent'`, `attribution` repassada e `timestamp` repassado.
15. Depois de registrar, a sombra do arquivo é o conteúdo atual.
16. Segunda alteração usa a sombra da primeira como "antes".
17. Arquivo ilegível → `recordChange` rejeita e **nada** é gravado no ledger.
18. O evento gravado aparece em `readByFile` e fica `current`.

Verificação de integração com git real: um teste manual, registrado em `docs/watch-code/testes-manuais.md` conforme a regra nova do `CLAUDE.md`, porque exige um repositório git de verdade e o binário `git` no PATH — o que a suíte de unidade não deve depender.

## 7. Critérios de aceite

1. `resolve` devolve origem `'git'` com o conteúdo de `HEAD` quando o git responde.
2. `resolve` devolve origem `'shadow'` quando o git não responde mas há sombra.
3. `resolve` devolve origem `'none'` sem git e sem sombra.
4. Falha do git nunca propaga para o chamador.
5. `recordChange` grava evento com `id`, `sessionId`, `source: 'agent'`, `attribution`, `fileUri`, `afterHash`, `timestamp` e `status: 'current'`.
6. Sem baseline, o evento é gravado **sem** `beforeHash`.
7. A sombra é atualizada após cada registro.
8. Arquivo ilegível faz `recordChange` rejeitar, sem gravar evento.
9. Os dois serviços estão registrados em `workbench.desktop.main.ts`.
10. `npx tsc --noEmit -p src/tsconfig.json` sem erros.
11. `npm run valid-layers-check` sem erros.
12. Testes do módulo passando, incluindo os 44 já existentes da E1-T2.
13. Nenhum comportamento existente de `platform/git` é alterado.
14. O teste manual de git real está registrado em `docs/watch-code/testes-manuais.md`.

## 8. Fora de escopo

| Item | Tarefa |
| --- | --- |
| Observar o disco / detectar escrita externa | E1-T4 |
| Agrupar por pausa, montar sessão | E1-T4 |
| Ativar/desativar observação pela interface | E1-T5 |
| `linesChanged` por diff | E3-T1 |
| Retenção e limpeza do armazenamento | E5-T3 |
| Baseline de arquivo removido | não previsto no guia |
| Ignorar caminhos (build, `.git`) | E5-T3 |
