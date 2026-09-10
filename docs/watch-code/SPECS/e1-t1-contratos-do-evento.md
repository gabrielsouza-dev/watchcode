# SPEC — E1-T1 · Contratos do evento

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Tarefa | E1-T1 — Contratos do evento (etapa E1 · Núcleo) |
| Plano | `docs/watch-code/PLANS/e1-t1-contratos-do-evento.md` |
| Guia | `docs/watch-code/Workflow/overview.md` (§3 e §4) |
| Depende | — |
| Próxima etapa | Developer |
| Módulo | `src/vs/platform/changeLedger/` |

## 1. Referência

Plano: `docs/watch-code/PLANS/e1-t1-contratos-do-evento.md`. Decisões fechadas nele: **D1** módulo em `src/vs/platform/changeLedger/`; **D2** `status` é calculado e persistido pelo ledger, não recebido do agente; **D3** a linha do `.aih/events.jsonl` carrega apenas referências de hash.

## 2. Comportamento esperado

O módulo entrega o **contrato de dados** do produto e a **porta de entrada** para dados não confiáveis:

1. Um **anúncio** (`ChangeAnnouncement`) que representa exatamente uma linha do `.aih/events.jsonl`: identidade e intenção, sem conteúdo.
2. Um **evento** (`ChangeEvent`) montado pela IDE a partir do disco — com `attribution`, hashes antes/depois, linhas e `status`, nada disso vindo do agente.
3. Uma sessão (`ChangeSession`) que agrupa eventos de uma mesma execução.
4. Uma função pura que converte `unknown` (o JSON já desserializado da linha do anúncio) em um resultado tipado, **sem lançar exceção** para dados ruins, relatando **todos** os campos com problema.

Nada além disso: o módulo não lê arquivo, não observa diretório, não grava nada e não conhece o ledger.

## 3. Contratos

### 3.1 `src/vs/platform/changeLedger/common/changeEvent.ts`

```ts
/** Versão do schema do anúncio aceita por esta versão do produto. */
export const CHANGE_ANNOUNCEMENT_SCHEMA_VERSION = 1;

/** Quem produziu a alteração. */
export type ChangeSource = 'agent' | 'developer';

/** Como o evento foi obtido: anunciado pelo hook ou observado no disco. */
export type ChangeEventAttribution = 'hook' | 'observed';

/**
 * Estado da entrada na linha do tempo.
 * 'current' enquanto o arquivo no disco for igual ao 'afterHash';
 * qualquer alteração posterior transforma a entrada em 'history'.
 */
export type ChangeEventStatus = 'current' | 'history';

/** Intervalo de linhas 1-based, inclusivo nas duas pontas. */
export type ChangeLineRange = readonly [startLine: number, endLine: number];

/** Anúncio do hook: identidade e intenção, sem conteúdo. */
export interface ChangeAnnouncement {
	readonly schemaVersion: number;
	readonly id: string;
	readonly sessionId: string;
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Epoch em milissegundos. */
	readonly timestamp: number;
}

/** Evento na linha do tempo, montado pela IDE a partir do disco. */
export interface ChangeEvent {
	readonly id: string;
	readonly sessionId: string;
	readonly source: ChangeSource;
	readonly attribution: ChangeEventAttribution;
	/** Caminho relativo à raiz do workspace. */
	readonly fileUri: string;
	/** Ausente quando não houve baseline: o evento é parcial. */
	readonly beforeHash?: string;
	readonly afterHash: string;
	readonly linesChanged?: readonly ChangeLineRange[];
	/** Epoch em milissegundos. */
	readonly timestamp: number;
	readonly status: ChangeEventStatus;
}
```

### 3.2 `src/vs/platform/changeLedger/common/changeSession.ts`

```ts
import type { ChangeSource } from './changeEvent.js';

/** Execução de um agente (ou de um surto de edições do desenvolvedor). */
export interface ChangeSession {
	readonly id: string;
	readonly source: ChangeSource;
	/** Epoch em milissegundos. */
	readonly startedAt: number;
	readonly endedAt?: number;
}
```

### 3.3 `src/vs/platform/changeLedger/common/changeEventParsing.ts`

```ts
export type ChangeAnnouncementParseErrorCode =
	| 'not-an-object'       // a linha não é um objeto JSON
	| 'unsupported-schema'  // schemaVersion ausente, inválida ou de versão desconhecida
	| 'missing-field'       // campo obrigatório ausente
	| 'invalid-field';      // campo presente com tipo ou conteúdo inválido

export interface IChangeAnnouncementParseError {
	readonly field: string;
	readonly code: ChangeAnnouncementParseErrorCode;
	readonly message: string;
}

export type ChangeAnnouncementParseResult =
	| { readonly ok: true; readonly announcement: ChangeAnnouncement }
	| { readonly ok: false; readonly errors: readonly IChangeAnnouncementParseError[] };

/** Converte uma linha desserializada do events.jsonl no anúncio tipado. Nunca lança. */
export function parseChangeAnnouncement(value: unknown): ChangeAnnouncementParseResult;

/** Type guards exportados para reuso pelo ledger e pela timeline. */
export function isChangeSource(value: unknown): value is ChangeSource;
export function isChangeEventAttribution(value: unknown): value is ChangeEventAttribution;
export function isChangeEventStatus(value: unknown): value is ChangeEventStatus;
export function isChangeLineRange(value: unknown): value is ChangeLineRange;
```

`field` usa o nome do campo do anúncio (`'id'`, `'timestamp'`, ...); quando o problema é a linha inteira, usa `'(announcement)'`.


## 4. Regras de validação

A validação se aplica ao **anúncio** vindo da CLI. O evento montado pela IDE a partir do disco não passa por esta função.

| Campo | Regra | Código do erro |
| --- | --- | --- |
| raiz | precisa ser objeto JSON (não `null`, não array, não primitivo) | `not-an-object` |
| `schemaVersion` | precisa ser exatamente `CHANGE_ANNOUNCEMENT_SCHEMA_VERSION` | `unsupported-schema` |
| `id` | string não vazia após `trim` | `missing-field` / `invalid-field` |
| `sessionId` | string não vazia após `trim` | `missing-field` / `invalid-field` |
| `fileUri` | string não vazia, **relativa**, sem `..` e sem raiz absoluta (POSIX ou Windows) | `missing-field` / `invalid-field` |
| `timestamp` | número finito, inteiro, `> 0` | `missing-field` / `invalid-field` |
| campos extras | ignorados, nunca erro — inclusive `beforeHash` e `afterHash`, que não fazem parte do anúncio | — |

O resultado de sucesso carrega **apenas** os cinco campos do contrato.


## 5. Alterações necessárias

| Arquivo | Ação | O quê |
| --- | --- | --- |
| `src/vs/platform/changeLedger/common/changeEvent.ts` | criar | Constante de versão, tipos `ChangeSource`, `ChangeEventAttribution`, `ChangeEventStatus`, `ChangeLineRange`, `ChangeAnnouncement`, `ChangeEvent` |
| `src/vs/platform/changeLedger/common/changeSession.ts` | criar | Tipo `ChangeSession` |
| `src/vs/platform/changeLedger/common/changeEventParsing.ts` | criar | `parseChangeAnnouncement` e os type guards |
| `src/vs/platform/changeLedger/test/common/changeEventParsing.test.ts` | criar | Testes de unidade da validação (etapa Tester) |

Todos os arquivos levam o cabeçalho de copyright padrão do repositório. Código e identificadores em inglês; comentários em português. Nada fora de `src/vs/platform/changeLedger/` é alterado — em particular, nenhum registro em `services.ts`, nenhum arquivo de `vs/base` ou `vs/workbench`.

## 6. Casos de borda e tratamento de erro

1. Linha com JSON válido mas raiz primitiva (`42`, `"texto"`, `null`, `[]`) → falha `not-an-object`.
2. `schemaVersion` de versão futura (`2`) → falha `unsupported-schema`; o anúncio é rejeitado, nunca aceito pela metade.
3. `schemaVersion` ausente → mesma falha de versão (é o primeiro campo checado).
4. Vários campos errados ao mesmo tempo → **todos** são relatados, não apenas o primeiro.
5. `id` ou `fileUri` com apenas espaços → tratados como vazios.
6. `fileUri` absoluto (`/etc/x`, `C:\\repo\\x`) ou com `..` → inválido.
7. `linesChanged` **não faz parte do anúncio**: se vier na linha, é ignorado como qualquer campo extra. Quem valida intervalos é o guard `isChangeLineRange`, usado pelo ledger: intervalo invertido (`[10, 4]`), linha `0`, número não inteiro e elemento de tamanho errado são rejeitados; `[]` é válido.
8. `timestamp` negativo, `0`, `NaN`, `Infinity` ou string → inválido.
9. Campos extras desconhecidos (`{"future": true}`, `beforeHash`, `afterHash`) → ignorados, sem erro, e ausentes do resultado.
10. Nenhuma entrada faz a função lançar exceção: `unknown` inclui `undefined`, funções, símbolos e objetos exóticos.

## 7. Plano de testes

Unidade, em `src/vs/platform/changeLedger/test/common/changeEventParsing.test.ts`, com `assert` do Node e `suite`/`test` globais (mesmo padrão de `src/vs/platform/agentHost/test/common/changesetUri.test.ts`).

**Anúncio** — `suite('changeAnnouncementParsing')`:

- aceita um anúncio mínimo válido e devolve exatamente os cinco campos;
- ignora campos desconhecidos, inclusive `beforeHash`/`afterHash`;
- rejeita valores que não são objetos;
- rejeita versão de schema desconhecida, ausente ou não numérica;
- relata todos os campos inválidos de uma vez;
- relata cada campo obrigatório ausente;
- trata string em branco como ausente;
- rejeita caminhos não relativos ao workspace e aceita os relativos;
- valida o `timestamp`;
- nunca lança exceção.

**Type guards** — `suite('changeEventGuards')`: `isChangeSource`, `isChangeEventAttribution`, `isChangeEventStatus`, `isChangeLineRange`.

Comandos: `npm run typecheck-client` e os testes de unidade escopados ao módulo.


## 8. Critérios de aceite verificáveis

| # | Critério | Verificação |
| --- | --- | --- |
| 1 | Tipos exportados conforme §3.1 a §3.3 | `npm run typecheck-client` |
| 2 | `parseChangeAnnouncement` nunca lança e devolve resultado discriminado | testes `rejects non-objects` e `reports every invalid field` |
| 3 | Versão de schema desconhecida é rejeitada explicitamente | teste `rejects unknown schema version` |
| 4 | Todos os campos inválidos são relatados de uma vez | teste `reports every invalid field` |
| 5 | Campos extras são ignorados e não propagados | teste `ignores unknown fields` |
| 6 | O módulo só depende de `vs/base` (ou de nada) | `npm run valid-layers-check` |
| 7 | Nenhum arquivo fora de `src/vs/platform/changeLedger/` é alterado | inspeção do diff |

## 9. Decisões pendentes

Nenhuma. D1, D2 e D3 estão fechadas no plano; o restante é consequência direta do `overview.md` §4.

## 10. Registro das revisões 3 e 4

### Revisão 3 — captura universal por disco

A revisão 3 do `overview.md` inverteu a arquitetura: a captura passou a ser feita pelo **disco** e o hook virou enriquecimento opcional. O contrato foi ajustado nesta mesma tarefa.

| Item | Antes (revisão 2) | Depois (revisão 3) |
| --- | --- | --- |
| Entrada do hook | `ChangeEventWire`, com `beforeHash`/`afterHash` obrigatórios e `linesChanged` | `ChangeAnnouncement`: identidade e intenção apenas |
| Evento armazenado | estendia o payload de entrada | tipo próprio, com `attribution` e `beforeHash` opcional |
| Validação | um alvo (o evento) | um alvo (o anúncio); o evento é montado pela IDE a partir do disco |
| Hashes, linhas e status | enviados pelo agente | calculados pela IDE (E1-T2 e E1-T3) |

### Revisão 4 — o dev propõe, o agente escreve

A revisão 4 não mudou o anúncio nem o evento: ela tirou a IDE da posição de fonte de alterações. Consequências neste contrato:

- `ChangeEvent.source` passa a ser, na prática, sempre `'agent'`;
- `ChangeSource` mantém os dois valores porque o `.md` de propostas (guia §5) usa `'developer'` para identificar a autoria.

Ajuste de nomenclatura feito junto: a constante de versão virou `CHANGE_ANNOUNCEMENT_SCHEMA_VERSION`, já que o schema versionado é o do **anúncio**, e não o do evento montado pela IDE.

### Resultado da validação

15 testes, 15 aprovados. Os critérios 1 e 6 da §8 seguem sem verificação pelo pipeline do repositório, porque `node_modules` não está instalado neste checkout.
