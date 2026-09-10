# Overview — Watch Code

**Guia de desenvolvimento.** Este arquivo não é implementado nem alterado durante a execução das tarefas: ele fixa a visão, a ordem e o backlog. Cada tarefa da seção 6 é executada individualmente, como um ciclo próprio do workflow.

- **Projeto:** Watch Code — IDE que observa o que agentes externos alteram e devolve as decisões do desenvolvedor para eles.
- **Status:** plano aprovado (revisão 4 — o dev propõe, o agente escreve)
- **Base:** fork do VS Code `code-oss-dev` 1.138.0
- **Regra de ouro:** uma tarefa por vez, na ordem do backlog. Não pular dependências.

## 1. A ideia em uma frase

Um fork do VS Code que **não executa agentes** e **não é usado para escrever código**: ele **observa o disco** para mostrar o que qualquer agente alterou em uma **linha do tempo navegável** (o que mudou, onde mudou, quando mudou), e devolve ao agente — por um arquivo `.md` — **o que o desenvolvedor propôs** que fosse alterado.

O desenvolvedor lê, navega e **propõe**. Quem escreve o código é o agente.

## 2. Escopo

**Entra no produto:**

1. Captura universal por disco — funciona com qualquer agente, script, terminal ou pessoa.
2. Baseline do "antes" (git e store de sombra), com regra explícita para quando não existe.
3. Linha do tempo cronológica.
4. Navegação Anterior/Próximo com salto automático para o local.
5. Diff com linhas adicionadas em verde e removidas em vermelho: o que o agente mudou.
6. Três modos: somente alterações · somente anterior · ambos.
7. Registro de **propostas do desenvolvedor** (sugestão de alteração ou TODO) com localização e motivo.
8. Arquivo `.md` de comunicação dev → agente, levando as propostas.
9. Instrução plantada no arquivo que o agente já lê, para que ele saiba que o `.md` existe.
10. Regra de validade: só a última entrada do arquivo é considerada atual; as demais são histórico.
11. Integração **opcional** por hook, que enriquece os eventos dos agentes que a suportam.
12. **Terminal integrado** — a superfície onde o desenvolvedor roda o agente externo (ex.: `claude`) sem sair da IDE. O terminal é **parte do produto**, não interface removível.
13. **Observação ativável** — o desenvolvedor liga e desliga a observação pela própria interface, tipicamente **depois** de iniciar o agente no terminal. Ligada, a IDE observa e anuncia; desligada, nenhuma sessão é aberta nem hook é injetado.
14. Ícone e identidade visual do produto.

**Fica para depois:** agrupamento visual por sessão/batch, multi-diff lado a lado, filtros avançados, múltiplos agentes simultâneos, GC sofisticado, notebooks.

**Fora do produto:** edição de código pela IDE. O editor serve para ler e comparar; a escrita é do agente.


## 3. Arquitetura

### 3.1 Três camadas, da mais universal para a mais específica

```
[1] DISCO — base universal, zero configuração
Agente / script / terminal ──escreve──► arquivo
                                            │
                    FileSystemWatcher do workspace
                                            │
              baseline do "antes" (git + store de sombra)
                                            ▼
                              Ledger (snapshots antes/depois)
                                            ▼
                    Timeline view → navegação → diff/decorations

[2] .md + INSTRUÇÃO PLANTADA — saída universal
IDE escreve .aih/agent-brief.md  +  bloco marcado em CLAUDE.md/AGENTS.md
                                            ▼
                              agente lê e responde o status

[3] HOOK — enriquecimento opcional (por agente)
IDE injeta o hook no arquivo de configuração local do agente
                                            ▼
        aih-hook anuncia sessão/turno ──► .aih/events.jsonl ──► IDE enriquece o evento
```

**Camada 1 — disco.** Todo agente, sem exceção, altera arquivos. A IDE já observa o workspace inteiro, então a base do produto não depende de integração nenhuma: a alteração aparece no disco, o watcher detecta, o baseline fornece o "antes" e o diff é calculado pela própria IDE.

**Camada 2 — saída por arquivo.** Escrever o `.md` é universal por natureza. Para o agente saber que ele existe, a IDE planta um bloco marcado e removível no arquivo de instruções que aquele workspace já usa (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`).

**Camada 3 — hook.** Onde o agente oferece hook, a IDE injeta a configuração no arquivo local dele (merge idempotente). O hook **não captura conteúdo**: ele apenas anuncia identidade e intenção (`sessionId`, turno, arquivo), o que permite agrupar por turno e avisar o agente no prompt. Sem hook, o produto degrada para agrupamento por pausa e instrução plantada — continua funcionando.

### 3.2 Origem do evento, por eliminação

| Quem produziu a mudança | `source` | `attribution` |
| --- | --- | --- |
| Disco, sem a IDE ter feito (agente, script, terminal) | `agent` | `observed` |
| Hook do agente identificou a sessão/turno | `agent` | `hook` |

Como a IDE não escreve código, **toda** alteração de arquivo é externa — a coluna de origem do desenvolvedor deixa de existir na timeline.

### 3.3 O que o hook acrescenta

| Sem hook | Com hook |
| --- | --- |
| Agrupamento por pausa (~1,5 s) | Agrupamento por turno do agente |
| Sem saber qual agente escreveu | `sessionId` e origem identificados |
| Agente descobre o `.md` pela instrução plantada | `aih:index` injetado no prompt |

### 3.4 As duas direções

| Direção | Canal | Conteúdo |
| --- | --- | --- |
| Agente → IDE | disco (base) e `.aih/events.jsonl` (hook opcional) | alterações de arquivo, com antes/depois |
| IDE → agente | `.aih/agent-brief.md` + instrução plantada | **propostas** do desenvolvedor, com local, motivo e contexto |

### 3.5 Fluxo de uso e ativação

O caminho do desenvolvedor é:

1. Abre o workspace na IDE.
2. Abre o **terminal integrado** e roda o agente externo (ex.: `claude`).
3. **Ativa a observação** pela interface.
4. O agente trabalha; a IDE observa, monta a timeline e escreve o `.md`.
5. O desenvolvedor revisa, registra propostas; o agente lê o `.md`.

O terminal é onde o agente é iniciado. Por isso ele **não** entra em nenhuma lista de remoção ou ocultação — ao contrário do restante da interface de execução.

| Estado | Comportamento |
| --- | --- |
| **Desligado** | Nenhuma sessão de observação é aberta e nenhum hook é injetado. |
| **Ligado** | Observação ativa: eventos de disco são registrados como sessão e o hook é injetado no agente. |

**Ponto em aberto (aguardando confirmação):** a §3.1 descreve a camada de disco como base universal, de zero configuração. Se "desligado" suspender **toda** a captura por disco, o produto deixa de ser universal por padrão e passa a exigir um clique a cada uso. Se "desligado" suspender apenas o **hook e o agrupamento em sessão**, a base universal continua valendo e o botão comanda o enriquecimento. A segunda leitura é a coerente com a §3.1, e é a assumida aqui.


## 4. Modelo de dados

### 4.1 Alteração (agente → IDE)

```ts
interface ChangeEvent {
  id: string;
  /** Do hook quando existe; gerado pelo agrupamento por pausa quando não existe. */
  sessionId: string;
  /** Hoje sempre 'agent': a IDE não escreve código. */
  source: ChangeSource;
  /** Como o evento foi obtido: anunciado pelo hook ou observado no disco. */
  attribution: 'hook' | 'observed';
  fileUri: string;
  /** Ausente quando não houve baseline: o evento é marcado como parcial. */
  beforeHash?: string;
  afterHash: string;
  linesChanged?: [number, number][];
  timestamp: number;
  status: 'current' | 'history';
}
```

`ChangeSource` vale `'agent' | 'developer'`: o evento sempre nasce como `'agent'`, e o valor `'developer'` identifica a autoria no `.md` de propostas (§4.2).

Snapshots ficam em armazenamento endereçado por hash.

**Regra única:** a entrada é `current` enquanto o hash do arquivo no disco for igual ao `afterHash`; quando o arquivo muda, ela vira `history` e a nova passa a ser `current`. Entradas `history` continuam navegáveis, com aviso.

### 4.2 Proposta (IDE → agente)

```ts
interface ChangeProposal {
  id: string;
  /** `suggestion`: corrigir ou melhorar algo. `todo`: tarefa a executar. */
  kind: 'suggestion' | 'todo';
  fileUri: string;
  /** Linhas a que a proposta se refere, quando houver seleção. */
  lines?: [number, number];
  /** Trecho atual e contexto ao redor, para o agente localizar sem ambiguidade. */
  context: { before: string[]; target: string[]; after: string[] };
  /** O que o desenvolvedor quer, escrito por ele. */
  message: string;
  createdAt: number;
  status: 'open' | 'ack' | 'done' | 'wontfix';
}
```

A proposta **não carrega hashes**: o desenvolvedor não alterou o arquivo, então não existe "antes" dele para guardar. O que ancora a proposta é a localização (arquivo + linhas + trecho), que é o que o agente precisa para agir.


### 4.3 Sessão (agrupamento)

```ts
interface ChangeSession {
  id: string;
  source: ChangeSource;
  startedAt: number;
  endedAt?: number;
}
```

Uma sessão agrupa eventos da mesma execução. Ela vem do hook quando existe (o `sessionId` do anúncio) ou do agrupamento por pausa quando não existe; quem monta a sessão é o serviço de timeline (E2-T1).

## 5. Formato do `.md` de comunicação

```md
# Agent Brief — <workspace>
<!-- aih:schema:v1 -->
<!-- aih:index
| id     | tipo       | arquivo             | linhas | status | resumo            |
| P-0042 | suggestion | src/base/strings.ts | 42-44  | open   | trocar o parser   |
| P-0043 | todo       | src/api/node/x.ts   | 118    | open   | extrair validação |
-->

<!-- aih:proposal {"id":"P-0042","kind":"suggestion","status":"open","source":"developer",
"file":"src/base/strings.ts","lines":[42,44],"at":"2026-01-01T12:00:00Z"} -->
### P-0042 — ajuste no parser
O `case` ficou duplicado depois da última alteração; unifique os dois ramos.

Trecho atual (linhas 39-47):
```ts
// contexto + trecho atual
```
<!-- /aih:proposal -->
```

**Regras:** metadados em comentário HTML (invisíveis no preview, fáceis de parsear); entradas **append-only**; só o bloco `aih:index` é reescrito; `id` é imutável e a reingestão é idempotente; caminhos relativos ao workspace; 3 linhas de contexto antes e depois; status `open → ack → done | wontfix`.

Só há **um** lado de código no par antes/depois: o trecho atual. O "depois" é responsabilidade do agente.


## 6. Backlog de tarefas

**Como usar:** pegue a primeira tarefa pendente cuja dependência esteja concluída → crie a especificação em `docs/watch-code/SPECS/<id-da-tarefa>.md` → implemente → valide → relate → marque o status nesta tabela.

**Dimensionamento:** cada tarefa deve caber em **um ciclo** do workflow, tocar poucos arquivos e não conter decisão de arquitetura em aberto. Se uma tarefa parecer grande durante a especificação, ela é dividida em duas aqui, no guia, antes de continuar.

Slug sugerido para a SPEC: o próprio id em minúsculas (ex.: `e1-t2-ledger-snapshots`).

### Etapa E0 — Enxugamento do fork

Roda **antes** da E1 e não renumera nada: é a preparação do fork para receber o produto.

O critério é o tipo de acoplamento de cada módulo inútil ao produto:

- **baixo acoplamento** → apagar (o módulo some do disco);
- **alto acoplamento** → esconder via `deregisterViewContainer` (o módulo fica, a interface não mostra).

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E0-T1 | Destravar a toolchain | Spectre do MSVC nas duas instâncias, Node 24.18 portátil, `vs2022_install` e `npm install` concluído | — | feito |
| E0-T2 | Extensões embarcadas | 30 extensões inúteis removidas; `extensions/` de 344,7 MB para 12 MB; listas fixas de build limpas | E0-T1 | feito |
| E0-T3 | Módulos de core inúteis | 12 contribs removidos; 4 restaurados e ocultados por acoplamento entre contribs irmãos; zero imports quebrados | E0-T2 | feito |
| E0-T4 | Ocultação declarativa | Contribuição que desregistra os containers inúteis e desliga as superfícies de IA por padrão | E0-T3 | feito |
| E0-T5 | Fechamento da E0 | `compile` e camadas verdes, 23 testes passando, e a aplicação rodando com a interface enxuta | E0-T4 | feito |

**E0 pronta quando:** o programa compila, roda, e a interface não mostra nenhuma superfície de escrita, execução, depuração, conta ou agente — preservando Explorer, Busca, SCM, Timeline, Saída e **Terminal**.

**Verificado em execução:** barra de atividade com Explorer, Search e Source Control; painel inferior com Output e Terminal. Nenhuma das views ocultadas apareceu.

**Fora da E0:** apagar `chat` e `src/vs/sessions` (são ocultados), e a limpeza da ferramenta de build por plataforma (`build/darwin`, `build/linux`, `build/azure-pipelines`), adiada por risco.

### Etapa E1 — Núcleo: contratos, ledger e captura por disco

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E1-T1 | Contratos do evento | Interfaces `ChangeEvent`/`ChangeSession`, versão de schema, validação e testes | — | feito (revisões 3 e 4; falta pipeline do repositório) |
| E1-T2 | Ledger e snapshots | Gravação/leitura de eventos, store endereçado por hash, hash de arquivo, persistência por workspace | E1-T1 | feito (44 testes no módulo) |
| E1-T3 | Baseline do "antes" | Estado anterior por git (`HEAD`) e por store de sombra; regra do evento parcial quando não há baseline | E1-T2 | feito (64 testes no módulo; 2 testes manuais pendentes) |
| E1-T4 | Watcher do workspace | Observação do disco, detecção de escrita externa, agrupamento por pausa e criação do evento de origem `agent` | E1-T3 | pendente |
| E1-T5 | Controle de observação | Comando e indicador de estado para **ativar/desativar** a observação pela interface; desligado, nenhuma sessão é aberta; estado refletido no status | E1-T4 | pendente |
| E1-T6 | Fechamento da E1 | Um script (sem agente nenhum) altera arquivos e cada alteração aparece no ledger com antes/depois corretos, com a observação ligada | E1-T5 | pendente |

**E1 pronta quando:** com a observação ligada, qualquer alteração feita fora da IDE — por agente, script ou terminal — vira um evento com arquivo, origem, horário e snapshots antes/depois corretos.

### Etapa E2 — Timeline e navegação

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E2-T1 | Serviço de timeline | Consultas cronológicas, filtro por arquivo, cálculo de `current`/`history`, eventos observáveis | E1-T6 | pendente |
| E2-T2 | View da timeline | Lista virtualizada na Activity Bar com arquivo, linhas, hora e origem; estados vazio e de erro | E2-T1 | pendente |
| E2-T3 | Anterior/Próximo | Comandos, keybindings e seleção do evento ativo na lista | E2-T2 | pendente |
| E2-T4 | Salto ao local | Abrir o arquivo, revelar e selecionar as linhas; tratar arquivo ausente e entrada `history` | E2-T3 | pendente |
| E2-T5 | Fechamento da E2 | Percorrer em sequência todas as alterações de uma sessão do agente | E2-T4 | pendente |

### Etapa E3 — Diff, cores e modos

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E3-T1 | Cálculo de diff | Diff a partir dos snapshots: hunks, ranges e contagem de linhas, com testes | E2-T5 | pendente |
| E3-T2 | Documentos virtuais | Provedores `aih-before:` e `aih-after:` (read-only) servindo os snapshots | E3-T1 | pendente |
| E3-T3 | Decorações | Linhas adicionadas em verde e removidas em vermelho, gutter e visão geral | E3-T2 | pendente |
| E3-T4 | Modos de visualização | Somente alterações (com contexto de N linhas), somente anterior e ambos, alternáveis e persistentes | E3-T3 | pendente |
| E3-T5 | Fechamento da E3 | Ao navegar, o antes/depois fica claro nos três modos | E3-T4 | pendente |

### Etapa E4 — Ponte `.md` com o agente

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E4-T1 | Registrar proposta | Comando "Sugerir alteração" (editor e explorer) capturando arquivo, linhas, trecho atual e contexto | E3-T5 | pendente |
| E4-T2 | Proposta em TODO | Variante "Adicionar TODO" do mesmo registro, com `kind: 'todo'` | E4-T1 | pendente |
| E4-T3 | Writer do `.md` | Serializer do formato, índice, append-only, idempotência e status | E4-T2 | pendente |
| E4-T4 | Instrução plantada | Bloco marcado e removível em `CLAUDE.md`/`AGENTS.md`/Copilot, com merge idempotente | E4-T3 | pendente |
| E4-T5 | Skill leitora | Skill do agente lê o `.md` e marca `ack`/`done`; reingestão idempotente pela IDE | E4-T4 | pendente |
| E4-T6 | Fechamento da E4 | Dev registra uma proposta e o agente responde mudando o status do `.md` | E4-T5 | pendente |

### Etapa E5 — Robustez

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E5-T1 | Atualidade e histórico | Transições `current`/`history` na prática, avisos na UI e navegação segura | E4-T6 | pendente |
| E5-T2 | Proposta desatualizada | Aviso quando o arquivo/linha de uma proposta `open` já mudou desde que ela foi escrita | E5-T1 | pendente |
| E5-T3 | Retenção e agrupamento | Limite/limpeza do armazenamento, agrupamento por sessão na timeline e ruído de escritas em massa | E5-T2 | pendente |

### Etapa E6 — Integração opcional por agente

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E6-T1 | Injeção de hook pela IDE | Detecção do agente, merge idempotente no arquivo de configuração local, ligar/desligar **após iniciar o agente no terminal integrado** e aviso de reinício da sessão | E5-T3 | pendente |
| E6-T2 | CLI de anúncio | `aih-hook` anuncia identidade e intenção (`sessionId`, turno, arquivo) em `.aih/events.jsonl`; a IDE observa e enriquece o evento | E6-T1 | pendente |
| E6-T3 | Fechamento da E6 | Com hook, todas as alterações de um turno aparecem agrupadas como uma sessão na timeline | E6-T2 | pendente |

### Etapa E7 — Identidade visual

| ID | Tarefa | Entregável | Depende | Status |
| --- | --- | --- | --- | --- |
| E7-T1 | Ícone e identidade visual | Ícone do produto (Windows, Linux, macOS) no `product.json`, ícone da view na Activity Bar e do editor | E6-T3 | pendente |

```
E1 → E2 → E3 → E4 → E5 → E6 → E7
```

## 7. Riscos

| Risco | Mitigação |
| --- | --- |
| IDE fechada durante a escrita do agente (nenhum watcher ativo) | Baseline por git e store de sombra na próxima abertura; o evento nasce marcado como parcial |
| Escritas em massa (build, formatador, `git checkout`) gerando ruído | Lista de caminhos ignorados configurável e agrupamento por pausa |
| Agente sem hook não informa sessão nem turno | Agrupamento por pausa |
| Proposta apontando para linhas que o agente já mudou | Guardar o trecho e o hash do arquivo no momento do registro; avisar quando estiver desatualizada (E5-T2) |
| Agente ignora o `.md` | Instrução plantada no arquivo que ele já lê + índice injetado no prompt quando há hook |
| Bloco de instrução plantado conflitando com o arquivo do usuário | Bloco delimitado, idempotente e removível, com merge que nunca sobrescreve o resto |
| Formato de hook muda entre versões do agente | Adaptador isolado e opcional: o produto continua funcionando sem ele |
| Histórico crescendo em repositórios grandes | Snapshots endereçados por hash + limite configurável |


## 8. Padrões assumidos

1. A IDE **não edita código**: ela lê, navega, compara e registra propostas.
2. Captura por disco como base; hook é enriquecimento opcional.
3. Origem `agent` para toda alteração de arquivo — a IDE não é fonte de mudança.
4. Baseline do "antes": git `HEAD` quando disponível, store de sombra como padrão, evento parcial como último caso.
5. Agrupamento por pausa quando não há hook.
6. Timeline do workspace inteiro, com filtro por arquivo.
7. Arquivos do produto em `.aih/` na raiz do workspace; schemes `aih-before:` e `aih-after:`.
8. Modo "ambos" = overlay inline (lado a lado só depois).
9. Um agente por vez na primeira versão.
10. O `.md` fica em `.aih/agent-brief.md` e leva propostas, não edições.
11. Histórico sobrevive ao fechar/reabrir o workspace.
12. Implementação como contribuição nativa no workbench do fork, com a ingestão isolada em um serviço de plataforma.
13. Código em inglês, comentários em português (conforme `CLAUDE.md`).


## 9. Validação

- **Unidade:** ledger, baseline, agrupamento por pausa, validação do anúncio e geração do `.md` (`npm run test-node`).
- **Ponta a ponta universal:** um script Node (sem agente nenhum) altera arquivos do workspace e a timeline precisa refletir cada alteração com antes/depois.
- **Ponta a ponta com agente:** com hook injetado, as alterações de um turno aparecem agrupadas como uma sessão.
- **UI:** fork com perfil isolado pela skill `launch` + Playwright (navegação, modos, decorações).
- **Pipeline:** `npm run compile`, `npm run typecheck-client`, `npm run valid-layers-check`, `npm run eslint`.

## 10. Critérios de aceite do produto

1. Toda alteração externa vira um evento com arquivo, localização e antes/depois — com ou sem hook.
2. Funciona com qualquer agente, inclusive nenhum: um script basta.
3. A timeline permanece correta mesmo depois de o código continuar mudando.
4. O desenvolvedor consegue ir do evento à linha alterada em uma única ação.
5. Toda proposta chega ao agente pelo `.md` com localização e motivo, sem ambiguidade.
6. O desenvolvedor não precisa escrever código em nenhum momento.
7. Nenhuma tarefa do backlog depende de tarefa posterior.
8. O produto tem ícone e identidade visual aplicados ao build.
