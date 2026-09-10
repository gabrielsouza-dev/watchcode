# Plano — E1-T4 · Watcher do workspace

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T4 — Watcher do workspace |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E1 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e1-t4-watcher-do-workspace.md |

## 1. Objetivo

Fazer a IDE **detectar sozinha** as alterações feitas no workspace por qualquer
agente externo — agente, script, terminal ou pessoa — e registrá-las no ledger
como eventos de origem `agent`, agrupadas em sessões por pausa de escrita.

Em uma frase: **o disco deixa de ser passivo e passa a alimentar o ledger
sozinho.**

## 2. Escopo

### Entra

1. Um watcher sobre as pastas do workspace, iniciado pelo próprio serviço.
2. Detecção de escrita externa: arquivos **criados, alterados e removidos**.
3. Descarte do ruído: saídas de build, pastas de controle de versão e os
   arquivos do próprio produto.
4. **Agrupamento por pausa**: escritas próximas no tempo pertencem à mesma
   sessão; a sessão fecha depois de um silêncio.
5. Criação do `IObservedChange` e chamada ao `IChangeRecorderService` que a
   E1-T3 já expôs.
6. Tratamento de borda: arquivo ilegível, caminho fora do workspace, escrita
   durante a leitura e eventos duplicados do mesmo caminho.
7. Testes automatizados do agrupamento e do filtro de ruído.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Ligar/desligar pela interface | É o controle de observação | **E1-T5** |
| Hook do agente (`attribution: hook`) | Integração opcional por agente | **E6-T1** |
| Ler `.aih/events.jsonl` | idem | **E6-T2** |
| Montar o `ChangeSession` e persistir sessões | O agrupamento aqui só **decide o `sessionId`**; quem materializa a sessão é a timeline | **E2-T1** |
| `linesChanged` | Depende do diff | **E3-T1** |
| View da timeline | Interface | **E2-T2** |
| Baseline do "antes" | Já resolvido | **E1-T3** (pronto) |

### Fronteira com a E1-T5

A E1-T4 entrega a observação **funcionando por padrão**. A E1-T5 acrescenta o
comando e o indicador que a **suspendem**. Isso mantém cada tarefa dentro de um
ciclo: aqui o watcher nasce ligado e testável; lá ele ganha um interruptor.

## 3. Contexto

### O que já existe e será consumido

| Artefato | Papel na E1-T4 |
| --- | --- |
| `IChangeRecorderService.recordChange(IObservedChange)` | **O ponto de entrada.** Recebe a alteração já detectada, resolve o "antes", grava o evento e a sombra. |
| `IObservedChange` | O contrato que o watcher precisa preencher: `fileUri`, `sessionId`, `attribution`, `timestamp`. |
| `ChangeRecorderService` | Já registrado em `workbench.desktop.main.ts`; **ainda sem consumidor** — a E1-T4 é o primeiro. |
| `IChangeLedgerService` | Grava e lê; é quem aplica `current`/`history`. Não é chamado diretamente pelo watcher. |

### Fatos verificados no código do fork

- `IFileService.createWatcher(resource, { recursive: false, excludes })` devolve
  um `IFileSystemWatcher` com `onDidChange: Event<FileChangesEvent>`. É o watcher
  **correlacionado** — os eventos chegam só a quem pediu, e não ao
  `IFileService.onDidFilesChange` global. É o que o
  `MainThreadFileSystemEventService` usa, e o que o guia do repositório
  recomenda ("prefira watchers correlacionados").
- A assinatura tipada exige `recursive: false`. Assistir a árvore inteira é
  responsabilidade do serviço de arquivos recursivo por trás dele
  (`watcherClient.ts`), não do chamador.
- `FileChangesEvent` expõe `rawAdded`, `rawUpdated` e `rawDeleted` como
  `URI[]`. Os métodos `contains`/`affects` servem para **perguntar** por um
  recurso; para **enumerar** o que mudou, os arrays crus são o caminho — e é
  exatamente como o `MainThreadFileSystemEventService` faz.
- `extUri.relativePath(from, to)` devolve o caminho relativo com `/` já
  normalizado no Windows (`resources.ts`). É o inverso exato do que o
  `ChangeRecorderService.resolveResource` espera.
- `Throttler` e `Delayer` existem em `vs/base/common/async.ts`. O `Throttler`
  encadeia tarefas em série — é o primitivo certo para não gravar duas vezes o
  mesmo arquivo em paralelo.
- `IWorkspaceContextService.getWorkspace().folders` é `IWorkspaceFolder[]`, com
  `uri` e `toResource(relativePath)`.
- O `ChangeRecorderService` **rejeita** quando o arquivo não é legível. Em um
  `DELETED`, a leitura falha por definição.

### Por que "por pausa"

O guia §4.1 diz que o `sessionId` vem do hook quando existe e do agrupamento
por pausa quando não existe. Sem hook (o caso desta tarefa), uma rajada de
escritas do mesmo agente vira **uma** sessão. A pausa de ~1,5 s é o valor que o
guia §3.3 fixa.

## 4. Dependências

- **E1-T3 (pronta)** — `IChangeRecorderService`, `IObservedChange`, baseline.
- **E1-T2 (pronta)** — ledger e snapshots.
- **Nenhuma dependência nova de plataforma.** O watcher usa `IFileService`,
  `IWorkspaceContextService` e `ILogService`, todos já disponíveis na camada
  `common` de `platform`.
- **Não depende de git.** A captura por disco é a base universal (§3.1): o
  watcher precisa funcionar em um workspace sem repositório nenhum.

## 5. Etapas

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | Definir o contrato do watcher | `IWorkspaceWatcherService` com `start()`/`stop()` e estado observável |
| 2 | Isolar a regra de agrupamento por pausa | Um colaborador testável que, dada uma sequência de carimbos de tempo, decide o `sessionId` |
| 3 | Isolar o filtro de ruído | Uma função pura que diz se um caminho relativo deve ser ignorado |
| 4 | Montar o watcher sobre o `IFileService` | Assinatura dos eventos, conversão para caminho relativo, descarte do que está fora do workspace |
| 5 | Ligar ao recorder | Monta o `IObservedChange` e chama `recordChange`, tratando a rejeição |
| 6 | Escrever os testes | Agrupamento, filtro de ruído e conversão de caminho |
| 7 | Registrar o serviço | `registerSingleton` em `workbench.desktop.main.ts`, ao lado do recorder |

## 6. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Ruído de build/formatador | Ledger entupido de eventos irrelevantes | Lista de caminhos ignorados na etapa 3, com padrões óbvios fora por padrão |
| Observar as escritas do próprio ledger | Laço de realimentação | O ledger mora no armazenamento **por workspace do editor**, fora do workspace (decisão D2 da E1-T2) — a E1-T4 não escreve nada dentro do workspace |
| Arquivo removido | `recordChange` rejeita e o erro vaza | Tratar a rejeição como caso esperado, registrando em log e seguindo |
| Rajada de escritas em um arquivo | Eventos duplicados e corrida na leitura | Agrupar por arquivo e serializar a gravação |
| Escrita durante a leitura | Conteúdo inconsistente com o carimbo | Aceitar: o próximo evento corrige; a regra de `current`/`history` já cobre |
| Workspace multi-pasta | Caminho relativo ambíguo | Uma sessão de observação por pasta, com o caminho relativo calculado contra a pasta de origem — ver **D1** |
| Custo de observação em repositório grande | Consumo de recursos | `recursive: false` no contrato, com o serviço por trás fazendo a árvore; `excludes` corta o que é caro antes de chegar aqui |

**Impacto arquitetural:** nenhum novo. O watcher é um consumidor do contrato
que a E1-T3 já fixou; não altera `platform/changeLedger` nem `platform/git`.

## 7. Decisões pendentes

### D1 — Onde fica o watcher, e como ele lida com multi-pasta

**Recomendação: A.**

- **A.** Em `platform/changeLedger/common/` (camada `common`), com **uma
  sessão de observação por pasta do workspace**. Cada pasta tem seu próprio
  `sessionId` independente, e o caminho relativo é calculado contra a pasta de
  origem — o que resolve o multi-pasta sem inventar prefixo.
- **B.** Em `workbench/services/changeLedger/`, uma única sessão para o
  workspace inteiro, com prefixo `folder/index` no caminho.

Por que A: o serviço só depende de `IFileService`, `IWorkspaceContextService` e
`ILogService`, todos disponíveis em `common` — colocá-lo no workbench o
prenderia sem necessidade. E o caminho relativo **e a pasta de origem** são o
que o `ChangeRecorderService.resolveResource` precisa para ler o arquivo certo:
hoje ele assume `folders[0]`, o que já está errado em multi-pasta. Resolver por
pasta evita propagar esse defeito, sem tocar no recorder.

### D2 — O que conta como "escrita externa"

**Recomendação: A.**

- **A.** Criados, alterados e **removidos**. Um arquivo removido é uma alteração
  do agente tanto quanto uma escrita, e a timeline precisa mostrá-lo.
- **B.** Apenas criados e alterados.

Por que A: o critério de aceite do produto (§10.1) é "toda alteração externa
vira um evento" — remoção é alteração. Consequência aceita: um evento de remoção
nasce **sem `afterHash`**. Isso **não** é suportado hoje: o `ChangeEvent` exige
`afterHash` e o recorder rejeita o arquivo ilegível. Portanto **A implica uma
extensão pequena no recorder** (permitir `afterHash` ausente, como o
`beforeHash` já é). Se você preferir não tocar no contrato da E1-T3 agora, a
opção B deixa a remoção para a E5 e mantém esta tarefa estritamente aditiva.

### D3 — Padrões ignorados por padrão

**Recomendação: A.**

- **A.** Lista fixa embutida: `.git/`, `node_modules/`, `out/`, `dist/`,
  `.build/`, `build/` e os artefatos do próprio produto. Configurável pelo
  usuário fica para depois.
- **B.** Nada ignorado nesta tarefa.

Por que A: sem isso, um `npm run compile` durante uma observação real gera
milhares de eventos e o ledger vira lixo — o risco já registrado no guia §7. A
lista é pequena, explícita e fácil de revisar.

### D4 — Escopo temporal do agrupamento por pausa

**Recomendação: A.**

- **A.** A pausa reinicia a cada nova escrita e fecha a sessão **por pasta**,
  com 1,5 s, valor que o guia §3.3 fixa.
- **B.** Sessão única global, sem separação por pasta.

Por que A: é a consequência direta de D1=A e mantém a sessão coerente com a
pasta observada.

## 8. Critérios de aceite

1. Um arquivo alterado por um processo externo vira um evento no ledger, sem
   que a IDE tenha sido avisada.
2. O evento tem `source: agent` e `attribution: observed`.
3. O `fileUri` do evento é o **caminho relativo** correto à raiz do workspace.
4. Várias escritas próximas no tempo compartilham o mesmo `sessionId`.
5. Depois de uma pausa, a escrita seguinte abre uma **nova** sessão.
6. Arquivos em `.git/`, `node_modules/` e `out/` **não** geram evento.
7. Arquivo removido é tratado sem derrubar a observação.
8. Arquivo ilegível não derruba a observação e é registrado em log.
9. A observação funciona em workspace **sem git**, caindo para a sombra.
10. `npm run test-node` passa com os testes novos do agrupamento e do filtro.
11. `npx tsc --noEmit -p src/tsconfig.json` sem erros e
    `npm run valid-layers-check` verde.
12. Nenhum arquivo fora de `platform/changeLedger`, `workbench/services/changeLedger`
    e `workbench.desktop.main.ts` é alterado — exceto se D2=A, que acrescenta a
    extensão mínima no contrato do evento.

## 9. Rastreabilidade

| Critério de aceite do produto | Guia | Esta tarefa |
| --- | --- | --- |
| Toda alteração externa vira evento | §10.1 | etapas 4 e 5 |
| Funciona sem agente nenhum | §10.2 | ausência de dependência de hook e de git |
| Timeline correta com o código mudando | §10.3 | `current`/`history` vem do ledger (E1-T2) |
| Captura por disco como base | §8.2 | o watcher **é** essa base |
| Agrupamento por pausa | §8.5 | etapa 2 |
| Ruído de escrita em massa | §7 | etapa 3 |
