# Plano — E1-T5 · Controle de observação

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T5 — Controle de observação |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E1 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e1-t5-controle-de-observacao.md |

## 1. Objetivo

Dar ao desenvolvedor o **interruptor da observação**: um comando que liga e
desliga a captura por disco e um indicador na barra de status que mostra, o tempo
todo, se a IDE está observando ou não.

Em uma frase: **a observação que a E1-T4 ligou sozinha passa a ter um botão e uma
luz.**

## 2. Escopo

### Entra

1. Um comando de alternância da observação, disponível pela Paleta de Comandos.
2. Estado observável no `IWorkspaceWatcherService`: quem quiser saber se a
   observação está ligada se inscreve, em vez de consultar uma variável.
3. Um item na barra de status com o estado atual, clicável, que executa o
   comando e muda de rótulo e de tom conforme o estado.
4. Ao desligar: a observação para, os watchers são liberados e as sessões
   abertas são fechadas.
5. Testes automatizados do novo estado observável e da idempotência do
   liga/desliga.
6. Um teste manual do comando e do indicador na interface.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Injeção de hook no agente | Depende de saber qual agente é | **E6-T1** |
| Configuração de usuário (`settings.json`) para o estado | O estado é da janela, não do perfil; vira configuração só se houver pedido | — |
| View ou painel de observação | A superfície do produto é a timeline | **E2-T2** |
| Filtro de caminhos ignorados configurável | Fora do escopo da E1 | **E5-T3** |
| Chamada de `start()` na inicialização | Já entregue pela E1-T4 | E1-T4 (pronto) |

### Fronteira com a E1-T4

A E1-T4 entregou a observação **ligada por padrão**, sem consumidor de interface.
A E1-T5 não muda o watcher: acrescenta o estado observável, o comando e o
indicador. O `stop()` já existe e já fecha as sessões — a tarefa o torna
alcançável por um clique.

## 3. Contexto

### O que já existe e será consumido

| Artefato | Papel na E1-T5 |
| --- | --- |
| `IWorkspaceWatcherService.start()/stop()/isActive` | **O ponto de entrada.** O comando alterna entre os dois e o indicador lê o terceiro. |
| `WorkspaceWatcherService` | Já fecha as sessões abertas no `stop()` e já descarta os watchers. Nada disso precisa mudar. |
| `WorkspaceWatcherContribution` | Chama `start()` na inicialização; continua sendo o dono desse comportamento. |
| `IStatusbarService.addEntry(entry, id, alignment, priority)` | Devolve um `IStatusbarEntryAccessor` com `update(entry)` — é como o indicador troca de texto sem piscar. |
| `CommandsRegistry.registerCommand` + `CommandsRegistry.getCommand` | Padrão de registro e de leitura do estado atual dentro do `handler`. |

### Fatos verificados no código do fork

- `IStatusbarEntry` aceita `name`, `text`, `ariaLabel`, `command`, `kind`
  (`'prominent' | 'warning' | 'error'`), `tooltip` e `backgroundColor`.
- O `AccessibilityStatus` (`contrib/accessibility/browser/accessibilityStatus.ts`)
  é o exemplo mais próximo: guarda o acessor em um `MutableDisposable` e alterna
  entre criar e descartar a entrada conforme o estado.
- Strings visíveis ao usuário nascem em inglês, com `nls.localize`, mesmo que a
  interface apareça em português — é a convenção do repositório.
- `src/vs/workbench/contrib/watchCode/` já existe (E0-T4) e é o lugar natural
  para a contribuição de interface; a lógica de observação continua em
  `platform/changeLedger`.

## 4. Dependências

- **E1-T4 (pronta)** — `IWorkspaceWatcherService` com `start()`, `stop()` e
  `isActive`; `stop()` já fecha as sessões.
- **E0-T4 (pronta)** — `contrib/watchCode` com o padrão de contribuição do
  workbench já montado.
- **Nenhuma dependência nova.** `IStatusbarService`, `CommandsRegistry`, `Event`
  e `nls` já estão disponíveis para uma contribuição de `browser`.
- **Não depende de git, de agente nem de hook.** O interruptor é da camada 1 do
  guia §3.1.

## 5. Etapas

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | Estender o contrato do watcher | `onDidChangeActive: Event<boolean>` e um `setActive(active)` que encapsula o par liga/desliga |
| 2 | Emitir o evento nos dois caminhos | `start()` e `stop()` avisam; repetir a chamada não avisa de novo |
| 3 | Registrar o comando | `watchCode.toggleObservation`, lendo o estado pelo próprio serviço |
| 4 | Montar o indicador | Entrada na barra de status que reflete o estado e executa o comando ao ser clicada |
| 5 | Escrever os testes | Estado observável, idempotência e ausência de aviso repetido |
| 6 | Registrar o teste manual | Comando e indicador na interface, na forma da regra do `CLAUDE.md` |

## 6. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Desligar durante uma gravação em curso | Evento pela metade no ledger | A gravação já é uma promessa independente do estado; o `stop()` só impede **novas** detecções |
| Indicador dessincronizado do serviço | O desenvolvedor confia em um estado falso | O indicador é redesenho de `onDidChangeActive`, nunca de uma cópia local do estado |
| Ícone na barra de status poluindo a interface | Ruído visual permanente na E7 | Rótulo curto e `kind` só quando ligado; a identidade visual é assunto da E7-T1 |
| Estado inicial errado | A base universal deixa de valer sem ninguém perceber | É a **D2**: o valor padrão precisa de decisão explícita |

**Impacto arquitetural:** baixo e contido. A E1-T5 acrescenta **um** membro ao
contrato do watcher (um evento) e **um** arquivo de contribuição de interface.
Não altera o ledger, o recorder, o baseline nem o formato dos eventos.

## 7. Decisões pendentes

### D1 — O que "desligado" suspende de fato

> **Aprovada: A.** Desligar suspende toda a captura por disco. A comparação com a
> leitura B foi discutida com o usuário antes da especificação.

**Recomendação: A.**

- **A.** Toda a captura por disco: nenhum watcher ativo, nenhum evento gravado,
  nenhuma sessão aberta. O comando alterna `start()` e `stop()` no serviço que
  já existe.
- **B.** Apenas o enriquecimento (hook e agrupamento em sessão); a base de disco
  continua observando e gravando eventos.

Por que A: o §3.5 do guia registra isto como **ponto em aberto** e assume a
leitura B, mas B não é implementável com clareza hoje — **não existe hook até a
E6**, então o único efeito de B seria desligar o agrupamento, e o contrato do
evento exige um `sessionId` para todo evento gravado (`ChangeEvent.sessionId` não
é opcional). Implementar B agora exigiria inventar uma sessão degenerada por
evento — mudança de contrato para produzir um efeito que ninguém consegue ver.
Além disso, o entregável desta tarefa diz literalmente "desligado, **nenhuma
sessão é aberta**". Com B, quando a E6 chegar, o mesmo estado passa a comandar
também a injeção do hook, sem retrabalho.

### D2 — Estado inicial e persistência

> **Aprovada: A.** A observação nasce ligada. Decisão do usuário: "faz então
> chave nasce ligada".

**Recomendação: A.**

- **A.** Nasce **ligado** ao abrir o workspace e vale para a janela; fechar e
  reabrir volta a ligar.
- **B.** Nasce **desligado**, e o desenvolvedor liga depois de subir o agente no
  terminal — é a ordem que o §3.5 descreve no fluxo de uso (passo 3).
- **C.** Nasce ligado e o estado é **persistido** por workspace, sobrevivendo ao
  fechamento.

Por que A: é o comportamento que a E1-T4 já entregou e que o critério de
fechamento da E1 pressupõe ("com a observação ligada, qualquer alteração feita
fora da IDE vira um evento"), então a tarefa não muda o comportamento padrão —
só o torna controlável. B inverte o padrão e faz o produto perder um evento por
esquecimento; C guarda um estado de sessão em disco e precisa de um lugar para
isso, sem ganho que justifique.

**Consequência de A:** quem desligar para rodar um build tem de religar depois;
é o custo aceito em troca de não depender de um clique a cada uso.

## 8. Decisões técnicas tomadas no planejamento

Locais, reversíveis e sem impacto de contrato — não precisam de aprovação, mas
ficam registradas para rastreabilidade.

| # | Decisão |
| --- | --- |
| T1 | O estado continua sendo **do watcher**, e não de um serviço novo: `onDidChangeActive` é acrescentado a `IWorkspaceWatcherService`, que já é a fonte da verdade de `isActive`. |
| T2 | O estado observável é `Event<boolean>`, não um `onDidStart`/`onDidStop` em par: o indicador quer saber "como está", não "o que aconteceu". |
| T3 | A contribuição de interface vai para `src/vs/workbench/contrib/watchCode/browser/`, junto da E0-T4; o comando e o indicador são **uma** contribuição, não duas. |
| T4 | Um comando de alternância, e não dois comandos separados de ligar e desligar: a Paleta de Comandos mostra um item, e o rótulo diz o que vai acontecer. |

## 9. Critérios de aceite

1. O comando de alternância aparece na Paleta de Comandos e funciona.
2. Ao desligar, uma escrita externa **não** gera evento nenhum no ledger.
3. Ao religar, a escrita seguinte volta a gerar evento, com sessão nova.
4. O item da barra de status mostra o estado atual e muda ao alternar.
5. Clicar no item da barra de status executa a alternância.
6. Chamar `start()` duas vezes, ou `stop()` duas vezes, não emite evento
   redundante de estado.
7. Desligar fecha as sessões abertas (comportamento herdado do `stop()`).
8. Workspace sem pasta nenhuma: ligar não quebra e o indicador continua coerente.
9. `npm run test-node` passa com os testes novos.
10. `npx tsc --noEmit -p src/tsconfig.json`, `npm run valid-layers-check` e
    `node --experimental-strip-types build/hygiene.ts` verdes.
11. Nenhum arquivo fora de `platform/changeLedger`, `workbench/contrib/watchCode`
    e `docs/watch-code` é alterado.
12. O teste manual do comando e do indicador está registrado em
    `docs/watch-code/testes-manuais.md` como `pendente`.

## 10. Rastreabilidade

| Critério de aceite do produto | Guia | Esta tarefa |
| --- | --- | --- |
| Observação ativável pela interface | §2.13 | etapas 3 e 4 |
| Desligado, nenhuma sessão é aberta | §3.5 | etapa 1 e critério 2 |
| Funciona sem agente nenhum | §10.2 | o interruptor é da camada de disco |
| Captura por disco como base universal | §8.2 | é a **D2** que fixa o padrão |
| Fluxo de uso: ativar depois de subir o agente | §3.5 | etapa 3 |
