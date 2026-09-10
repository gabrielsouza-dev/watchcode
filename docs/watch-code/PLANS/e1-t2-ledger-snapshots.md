# PLAN — E1-T2 · Ledger e snapshots

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Tarefa | E1-T2 — Ledger e snapshots (etapa E1 · Núcleo) |
| Depende | E1-T1 (contratos do evento — `feito`) |
| Próxima etapa | SpecWriter |
| Módulo | `src/vs/platform/changeLedger/` |
| Guia | `docs/watch-code/Workflow/overview.md` (§3, §4, §7) |

## 1. Objetivo

Entregar o **armazenamento do ledger**: gravar e ler eventos, guardar o conteúdo dos arquivos em um **store endereçado por hash** e manter tudo **persistido por workspace**, de forma que a linha do tempo sobreviva a fechar e reabrir a IDE.

Em uma frase: dado um evento montado (ou os dois conteúdos antes/depois), o ledger sabe onde guardar, como endereçar por hash e como devolver depois.

## 2. O que a tarefa é — e o que não é

O guia §4.1 fecha a decisão central: **"Snapshots ficam em armazenamento endereçado por hash"**. A E1-T2 materializa exatamente isso.

| É responsabilidade da E1-T2 | Não é (fica para outra tarefa) |
| --- | --- |
| Gravar e ler `ChangeEvent` | Descobrir *que* houve alteração — é a E1-T4 (watcher) |
| Guardar e recuperar conteúdo por hash | Decidir *qual era* o "antes" — é a E1-T3 (baseline) |
| Persistir por workspace, sobrevivendo ao reinício | Agrupar por pausa — é a E1-T4 |
| Calcular o hash de um conteúdo | Mostrar, filtrar ou navegar — é a E2 |
| Aplicar a regra `current` → `history` ao gravar | Ativar/desativar a observação — é a E1-T5 |

A E1-T2 é **passiva**: ela não observa disco, não abre sessão e não reage a nada por conta própria. Ela é a camada que a E1-T3 e a E1-T4 vão chamar.

## 3. Contexto

### 3.1 O que já existe (E1-T1, `feito`)

| Arquivo | Conteúdo |
| --- | --- |
| `common/changeEvent.ts` | `CHANGE_ANNOUNCEMENT_SCHEMA_VERSION`, `ChangeSource`, `ChangeEventAttribution`, `ChangeEventStatus`, `ChangeLineRange`, `ChangeAnnouncement`, `ChangeEvent` |
| `common/changeSession.ts` | `ChangeSession` |
| `common/changeEventParsing.ts` | `parseChangeAnnouncement` + type guards (`isChangeLineRange` inclusive) |
| `test/common/changeEventParsing.test.ts` | 16 testes, aprovados |

O contrato de `ChangeEvent` já define `beforeHash?`, `afterHash` e `status`. A E1-T2 **não altera esses tipos** — ela os persiste.

### 3.2 Infraestrutura do fork que será usada

| Recurso | Onde | Por quê |
| --- | --- | --- |
| `hashAsync` | `vs/base/common/hash.ts` | SHA-1 em hex do conteúdo — é o endereço do snapshot |
| `IFileService` | `vs/platform/files/common/files.ts` | `readFile`/`writeFile`/`createFolder`/`exists`/`del`/`stat`, agnóstico de scheme |
| `IEnvironmentService.workspaceStorageHome` | `vs/platform/environment/common/environment.ts` | Raiz por perfil — mesmo padrão que o VS Code usa para estado por workspace |
| `IWorkspaceContextService.getWorkspace()` | `vs/platform/workspace/common/workspace.ts` | `IWorkspace.id` — a chave de partição por workspace |
| `VSBuffer` | `vs/base/common/buffer.ts` | Conteúdo binário lido/escrito |

### 3.3 Decisão de local — **fechada: opção A**

Há dois lugares possíveis para os dados do ledger, e a escolha muda o produto:

| Opção | Onde | A favor | Contra |
| --- | --- | --- | --- |
| **A — por perfil** | `workspaceStorageHome/<workspaceId>/changeLedger/` | Não polui o repositório; nunca aparece no `git status` do dev; é o padrão do VS Code para estado por workspace; sobrevive sem sujar o projeto | Não é portátil entre máquinas; some se o perfil for apagado |
| **B — no workspace** | `<workspace>/.aih/ledger/` | Portátil; viaja junto do projeto; coerente com o `.md` e o `events.jsonl`, que já moram em `.aih/` | Polui o repositório; exige `.gitignore`; snapshots de código do dev podem acabar versionados por acidente |

O guia §8.7 já fixa que **os arquivos do produto ficam em `.aih/` na raiz do workspace** (o `.md` e o `events.jsonl`). Isso puxa para a opção **B**.

Mas o §7 lista o risco "histórico crescendo em repositórios grandes" — o que sugere que o ledger é volumoso, e volume é argumento para a opção A.

**Decisão (aprovada pelo usuário):** **A** para o ledger (eventos + snapshots, que são volumosos e derivados), mantendo `.aih/` apenas para os arquivos de **comunicação** com o agente (`.md` e `events.jsonl`), que são pequenos e precisam ser lidos pelo agente de fora da IDE. São naturezas diferentes: um é canal com o agente, o outro é estado interno da IDE.

Consequência aceita: o histórico **não** é portátil entre máquinas e some se o perfil for apagado — coerente com o §8.11, que exige apenas sobreviver a fechar/reabrir o *mesmo* workspace.

Ganho colateral: como o ledger fica fora do workspace, o watcher da E1-T4 **não** observa as próprias gravações do ledger, o que elimina por construção o risco de loop de eventos consigo mesmo.

## 4. Escopo

**Entra:**

1. Store de snapshots endereçado por SHA-1: guardar conteúdo e recuperar por hash, sem duplicar conteúdo idêntico.
2. Cálculo do hash de um arquivo a partir do workspace.
3. Gravação de `ChangeEvent` e leitura do histórico de eventos de um workspace.
4. Regra `current` → `history` aplicada **na gravação**: gravar um evento novo para um arquivo rebaixa o anterior daquele arquivo.
5. Persistência por workspace, sobrevivendo a fechar/reabrir.
6. Contrato de serviço injetável (`IChangeLedgerService`) + registro em `platform/changeLedger/common/`.

**Não entra:**

- Observar disco, watcher, agrupamento por pausa (E1-T4).
- Calcular o baseline do "antes" (E1-T3).
- Ligar/desligar observação (E1-T5).
- Consultas cronológicas da timeline (E2-T1) — o ledger **armazena**, a timeline **consulta**.
- Retenção/limpeza de armazenamento (E5-T3).
- Escrever o `.md` de propostas (E4).

## 5. Dependências

| Depende de | Tipo | Situação |
| --- | --- | --- |
| E1-T1 — contratos | Código | `feito` |
| `vs/base/common/hash.ts` | Infra do fork | existe |
| `vs/platform/files/common/files.ts` (`IFileService`) | Infra do fork | existe |
| `vs/platform/environment/common/environment.ts` | Infra do fork | existe |
| `vs/platform/workspace/common/workspace.ts` | Infra do fork | existe |
| `vs/platform/instantiation/common/instantiation.ts` (`createDecorator`) | Infra do fork | existe |

Nenhuma dependência de tarefa posterior.

## 6. Etapas de implementação

| # | Etapa | Sai |
| --- | --- | --- |
| 1 | Fechar a decisão de local (§3.3) | Decisão registrada |
| 2 | Camada pura: hash de conteúdo e layout de caminhos do store | Funções testáveis sem I/O |
| 3 | Store de snapshots: `put(content)` → hash, `get(hash)` → conteúdo, `has(hash)` | `SnapshotStore` |
| 4 | Persistência do ledger: gravar evento, listar por arquivo, listar por workspace | `ChangeLedgerService` |
| 5 | Regra `current` → `history` na gravação | Comportamento verificável |
| 6 | Contrato injetável `IChangeLedgerService` + `createDecorator` | Serviço registrável |
| 7 | Testes de unidade do módulo | Suíte verde |

Cada etapa é independente o bastante para ser validada antes da seguinte.

## 7. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escolher o local errado (§3.3) | Poluição do repositório **ou** perda de portabilidade — decisão cara de reverter | **Submeter ao usuário antes de implementar** |
| Snapshot gravado para cada alteração infla o armazenamento | Disco | Endereçamento por hash: conteúdo idêntico ocupa um lugar só; limpeza é E5-T3 |
| Ledger gravando dentro do workspace e o watcher da E1-T4 reagir a ele | Loop de eventos — o ledger observa a si mesmo | Endereçamento fora do workspace (opção A) elimina o risco por construção; na opção B seria obrigatório excluir `.aih/` do watcher |
| Escrita concorrente corrompendo o índice | Histórico inconsistente | Escrita do evento como arquivo próprio endereçado por id; índice é derivado, não fonte da verdade |
| Hash SHA-1 colidindo | Snapshot errado servido | SHA-1 é adequado para endereçamento de conteúdo (não é fronteira de segurança); o risco prático é desprezível para arquivos de código |
| O módulo passar a depender de camada proibida | `valid-layers-check` quebra | `platform/changeLedger/common/` só importa `vs/base` e `vs/platform` de nível igual ou inferior — validado pelo comando |

## 8. Decisões pendentes

| # | Decisão | Situação |
| --- | --- | --- |
| **D1** | **Local do ledger e dos snapshots** — opção A (por perfil, fora do repositório) ou opção B (`.aih/` no workspace) | **Aprovada: A.** Ledger e snapshots em `workspaceStorageHome/<workspaceId>/changeLedger/`; `.aih/` permanece reservado ao canal com o agente (`.md` + `events.jsonl`) |
| **D2** | Formato de persistência do evento — um arquivo JSON por evento, ou um único índice JSON reescrito | Decisão técnica local, reversível e de baixo impacto: **um arquivo por evento** evita reescrever o histórico inteiro a cada alteração, é append-friendly e resiste a corrupção parcial. Assumida aqui, salvo objeção |
| **D3** | Nome do serviço e do arquivo do contrato | Decisão técnica local: `IChangeLedgerService` em `common/changeLedgerService.ts`. Assumida aqui, salvo objeção |

Só **D1** exigia o usuário, e está aprovada. D2 e D3 são locais, reversíveis e coerentes com os padrões do repositório.

## 8.1 Resultado — decisão D1

**Aprovada a opção A pelo usuário.** O ledger grava em `workspaceStorageHome/<workspaceId>/changeLedger/`. O diretório `.aih/` do workspace **não** é tocado nesta tarefa: ele continua reservado ao `.md` de propostas e ao `events.jsonl` do hook.

Contrapartidas aceitas explicitamente: sem portabilidade entre máquinas e sujeito a perda se o perfil for apagado.

## 9. Critérios de aceite

1. Gravar um `ChangeEvent` e lê-lo de volta devolve exatamente o mesmo evento (ida e volta sem perda).
2. Guardar o mesmo conteúdo duas vezes ocupa **um** snapshot; o hash é estável para o mesmo conteúdo.
3. Conteúdos diferentes produzem hashes diferentes.
4. Ao gravar um evento novo para um arquivo, o evento anterior daquele arquivo passa a `history` e o novo fica `current`.
5. Eventos de arquivos distintos não interferem entre si.
6. O histórico sobrevive à recriação do serviço (persistência real em disco, não em memória).
7. Dois workspaces diferentes não misturam histórico.
8. Recuperar um snapshot de hash inexistente falha de forma explícita, sem lançar exceção não tratada no fluxo de leitura.
9. `npm run valid-layers-check` continua verde.
10. O módulo não observa disco, não cria sessão e não reage a evento nenhum — é passivo.

## 10. Rastreabilidade

| Requisito do guia | Onde é atendido |
| --- | --- |
| §4.1 "Snapshots ficam em armazenamento endereçado por hash" | Etapa 3 |
| §4.1 regra `current`/`history` | Etapa 5 |
| §7 "Histórico crescendo em repositórios grandes" | Endereçamento por hash; limpeza fica na E5-T3 |
| §8.11 "Histórico sobrevive ao fechar/reabrir o workspace" | Etapa 4 |
| §9 "Unidade: ledger (...)" | Etapa 7 |
