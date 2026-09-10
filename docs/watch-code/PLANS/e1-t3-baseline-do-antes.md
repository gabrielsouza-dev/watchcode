# PLAN — E1-T3 · Baseline do "antes"

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T3 — Baseline do "antes" |
| Etapa | E1 · Núcleo: contratos, ledger e captura por disco |
| Depende de | E1-T2 (concluída) |
| Workflow | High |
| Slug | `e1-t3-baseline-do-antes` |

## 1. Objetivo

Fornecer, para qualquer arquivo do workspace, **qual era o conteúdo anterior** antes de uma alteração externa — usando o git quando ele responde e um store de sombra quando não responde — e **registrar o evento correspondente** no ledger, incluindo o caso em que não existe baseline algum.

## 2. Escopo

**Entra:**

1. Resolução do baseline do "antes" de um arquivo, em três degraus de qualidade:
   1. **git** — conteúdo do arquivo em `HEAD`;
   2. **sombra** — último conteúdo observado que a IDE guardou;
   3. **ausente** — não há "antes" conhecido: o evento nasce parcial.
2. Store de sombra, sobre o store de snapshots da E1-T2, guardando o último conteúdo observado de cada arquivo.
3. Regra explícita do **evento parcial**: quando não há baseline, `beforeHash` fica ausente.
4. Serviço **ativo** `IChangeRecorderService`: a partir de uma escrita externa detectada, resolve o "antes", guarda o "depois" e grava o evento no ledger.
5. Registro dos serviços em `workbench.services` (primeiro consumidor real dos serviços da E1).

**Não entra:**

- Observar o disco e detectar a escrita externa — **E1-T4** (watcher). A E1-T3 recebe a alteração já detectada.
- Agrupar por pausa e montar a sessão — **E1-T4**.
- Ativar/desativar a observação pela interface — **E1-T5**.
- Calcular linhas alteradas (`linesChanged`) por diff — **E3-T1**. O campo continua opcional e ausente por ora.
- Limpeza/retenção do armazenamento — **E5-T3**.
- Baseline de arquivo **novo** ou **removido**: só há o que comparar se o arquivo existia antes com conteúdo conhecido.

## 3. Contexto

### 3.1 O que já existe (E1-T2, intacto)

| Arquivo | O que oferece |
| --- | --- |
| `common/changeEvent.ts` | `ChangeEvent` com `beforeHash?` e `afterHash`; `ChangeEventAttribution` |
| `common/snapshotHash.ts` | `computeContentHash`, `isContentHash` |
| `common/snapshotStore.ts` | `put` / `get` / `has` endereçados por hash |
| `common/ledgerStorage.ts` | layout e nomeação de recursos do ledger |
| `common/changeLedgerService.ts` | `record`, `readAll`, `readByFile`, `readById`, `recordSnapshot`, `readSnapshot` |

O ledger é deliberadamente **passivo**: grava e lê. Nada nele decide qual era o "antes".

### 3.2 O que a E1-T3 acrescenta

Duas peças de natureza diferente:

- **Baseline** — uma *consulta*: "qual era o conteúdo deste arquivo antes?". É a peça que sabe falar com o git e com o store de sombra.
- **Recorder** — uma *ação*: "uma alteração externa aconteceu neste arquivo; registre-a". É o primeiro consumidor real do ledger, e é o que a E1-T4 vai chamar.

### 3.3 Fatos verificados no repositório

- `ILocalGitService` existe em `src/vs/platform/git/common/localGitService.ts` e sua implementação Node (`platform/git/node/localGitService.ts`) roda no **shared process**. Ela **não** expõe leitura de blob em `HEAD` — expõe `revParse`, `revListCount`, `checkout`, `pull`, `clone`, `fetch`, `cancel`. Ou seja: **não serve** para obter o conteúdo anterior de um arquivo.
- `platform/changeLedger/` é um módulo de plataforma com apenas `common/` e `test/common/` — **não há camada `node/`** no módulo hoje.
- A E1-T2 registrou a decisão de que o registro em `workbench.services` pertence ao primeiro consumidor — esta tarefa.
- O store de snapshots guarda conteúdo **arbitrário** por hash; nada impede guardar nele o "antes" de um arquivo, mas ele não sabe *qual* hash é "o último visto de X" — essa é a função do store de sombra.

## 4. Dependências

- **E1-T2** — ledger, snapshots, hash, layout e persistência. Concluída.
- `IFileService`, `IEnvironmentService`, `IWorkspaceContextService`, `ILogService` — serviços de plataforma já existentes.
- Execução de `git` — depende do decidido na **D1** abaixo.

## 5. Etapas

1. **Store de sombra** — guardar, por arquivo do workspace, o último conteúdo observado e o hash correspondente; ler e apagar. Persistido ao lado do ledger.
2. **Consulta de baseline** — resolver o "antes" na ordem git → sombra → ausente, devolvendo o conteúdo **e** o degrau de origem, para que o chamador saiba se o evento é parcial.
3. **Escrita do "depois"** — gravar o conteúdo atual no store de snapshots e obter o `afterHash`.
4. **Registro do evento** — montar o `ChangeEvent` (id, sessionId, origem `agent`, atribuição `observed`, horário) e gravá-lo pelo ledger.
5. **Atualização da sombra** — depois de registrar, a sombra daquele arquivo passa a ser o conteúdo atual.
6. **Registro dos serviços** — declarar os novos serviços e o próprio `IChangeLedgerService` em `workbench.services`.
7. **Testes** — unidade para cada degrau de baseline e para a regra do evento parcial.

## 6. Riscos e impactos

| Risco | Impacto | Mitigação no plano |
| --- | --- | --- |
| Executar `git` a cada evento é caro em repositório grande | Latência na gravação da timeline | Cachear por arquivo + commit de `HEAD`; invalidar quando o `HEAD` muda |
| `git` ausente, lento ou em erro trava a captura | A observação para de registrar | Erro do git **degrada** para o degrau seguinte; nunca propaga |
| Sombra desatualizada por escrita ocorrida com a IDE fechada | "Antes" errado, silenciosamente | A sombra é gravada **junto** de cada evento; divergência é recuperável pelo git em repositórios versionados |
| Dois módulos de plataforma passam a gravar em disco | Duplicação de caminhos e de código | Toda a persistência continua centralizada na E1-T2; a E1-T3 só acrescenta um *layout* ao mesmo armazenamento |
| Crescimento do store de sombra | Disco | Limitado a **uma** entrada por arquivo — não é histórico |
| Arquivo do workspace fora do repositório git | Sem baseline do git | Cai para a sombra |

## 7. Decisões

Todas aprovadas pelo usuário antes da implementação.

### D1 — Como ler o `HEAD` do git — **aprovada: A**

O serviço de git do repositório **não expõe** leitura de conteúdo em `HEAD`. São necessárias uma das opções:

- **A — Estender o serviço de git existente.** Acrescentar a leitura de blob ao `ILocalGitService` (`platform/git`), reaproveitando o processo compartilhado, o canal de IPC já aberto e o tratamento de erro existente. O módulo de git passa a ter a capacidade que falta; a E1-T3 apenas a consome.
- **B — Executar `git` dentro do próprio módulo `changeLedger` (camada `node/`).** Autocontido, sem tocar em módulo alheio, mas cria um **segundo** caminho de execução de git no produto e obriga a abrir um canal de IPC próprio.

**Decidido: A.** O repositório já tem `git` isolado em um único serviço; um segundo caminho para o mesmo binário é uma duplicação que o projeto evita. Consequência aceita: a E1-T3 toca `platform/git`, fora de `changeLedger` — de forma aditiva, sem alterar nenhum comportamento existente.

### D2 — Onde vive a sombra — **aprovada: A**

- **A — Dentro de `workspaceStorageHome`**, junto do ledger.
- **B — Em `localHistoryHome`**, o diretório de histórico local que o VS Code já usa.

**Decidido: A**, por consistência com a decisão D1 da E1-T2. A sombra é estado derivado do mesmo workspace e não se mistura com o histórico local do editor.

### D3 — O que a sombra guarda — **aprovada: B**

- **A — Só o conteúdo**; o hash é recalculado quando necessário.
- **B — Conteúdo + hash + horário**, evitando recomputar SHA-1 e dando rastreabilidade.

**Decidido: B.** O hash já é calculado antes de gravar; guardá-lo evita recomputação e torna o registro auditável.

### D4 — Escopo sem o watcher — **confirmada pelo usuário**

A E1-T3 recebe a alteração **já detectada** e resolve o "antes"; detectar a escrita externa é a E1-T4. Mantém a tarefa em um ciclo de workflow.

## 8. Critérios de aceite

1. Para um arquivo versionado, com `HEAD` contendo versão anterior, o baseline devolve o conteúdo de `HEAD` e a origem **git**.
2. Para um arquivo sem git (ou fora do repositório), o baseline devolve o último conteúdo observado e a origem **sombra**.
3. Sem git e sem sombra, o baseline devolve "ausente" e o evento é gravado **sem** `beforeHash`.
4. Falha do git (repositório inexistente, binário ausente, erro de execução) **não** propaga: degrada para a sombra.
5. O evento gravado traz `id`, `sessionId`, `source: 'agent'`, `attribution: 'observed'`, `fileUri`, `afterHash` e `timestamp`.
6. Depois de registrar, a sombra do arquivo passa a ser o conteúdo recém-registrado.
7. Arquivo novo (sem `HEAD` e sem sombra) gera evento parcial, sem falhar.
8. Git não é consultado de novo para o mesmo arquivo enquanto o `HEAD` não mudar.
9. Testes de unidade cobrindo os três degraus e a degradação por erro.
10. `npx tsc --noEmit -p src/tsconfig.json` e `npm run valid-layers-check` sem erros; testes do módulo passando.

## 9. Rastreabilidade

| Requisito do guia (§) | Onde é atendido |
| --- | --- |
| §2.2 Baseline do "antes" (git e store de sombra), com regra explícita | §5 etapas 1–4 e critérios 1–4 |
| §4.1 `beforeHash?` ausente ⇒ evento parcial | §5 etapa 4 e critério 3 |
| §7 risco "IDE fechada durante a escrita" | §5 etapas 2 e 7 |
| §8.4 git `HEAD` → sombra → parcial | §5 etapa 2 |
| §8.11 histórico sobrevive ao fechar/reabrir | sombra persistida no armazenamento do workspace |
| §9 validação de unidade do baseline | §5 etapa 7 |
| E1-T4 (watcher) depende desta tarefa | §3.2 — o recorder é o ponto de entrada que a E1-T4 vai chamar |
