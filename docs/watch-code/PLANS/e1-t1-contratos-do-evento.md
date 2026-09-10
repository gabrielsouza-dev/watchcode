# PLAN — E1-T1 · Contratos do evento

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Tarefa | E1-T1 — Contratos do evento (etapa E1 · Núcleo) |
| Guia | `docs/watch-code/Workflow/overview.md` (§3 Arquitetura, §4 Modelo de dados) |
| Depende | — (primeira tarefa do backlog) |
| Próxima etapa | SpecWriter |
| Especificação | `docs/watch-code/SPECS/e1-t1-contratos-do-evento.md` |

## Objetivo

Definir e implementar os **contratos de dados** do produto — o evento de alteração, a sessão que o agrupa, a versão do schema e a validação de entrada — para que o ledger (E1-T2), o baseline do "antes" (E1-T3) e o watcher do workspace (E1-T4) tenham uma única fonte de verdade tipada.

## Escopo

**Entra:**

- Um novo módulo de plataforma em `src/vs/platform/changeLedger/` contendo:
  - a versão do schema do evento e a regra de compatibilidade;
  - os tipos do evento (origem, status, evento, sessão);
  - a validação/parsing de **entrada não confiável** (JSON vindo da CLI do agente) para o tipo do evento;
  - utilitários puros de apoio ao contrato (ex.: validação de hash, de caminho relativo, de intervalo de linhas).
- Testes unitários do contrato e da validação.

**Não entra:**

- Leitura/observação do arquivo `.aih/events.jsonl`, dedupe e tolerância a linha parcial (E1-T3).
- Persistência, armazenamento endereçado por hash e hash de arquivo (E1-T2).
- Serviço, injeção de dependência ou registro em `services.ts`: ainda não existe consumidor.
- Serialização do `.md` de comunicação (E4-T3).
- Cálculo de diff (E3-T1).

## Contexto

- Não existe código de produto deste projeto ainda: este é o primeiro artefato do fork.
- O modelo de dados aprovado está em `overview.md` §4; a arquitetura em três camadas (disco como base, `.md` + instrução plantada na saída, hook como enriquecimento opcional) está em §3.
- Padrões do fork que serão seguidos:
  - módulos de plataforma em `src/vs/platform/<nome>/common/*.ts`;
  - testes em `src/vs/platform/<nome>/test/common/*.test.ts` (executados por `npm run test-node`);
  - `common/` só pode depender de `vs/base/common` e `vs/platform/*/common` (verificado por `npm run valid-layers-check`);
  - utilitários existentes reaproveitáveis: `vs/base/common/types.ts` (type guards), `vs/base/common/uri.ts`.
- O arquivo `.aih/events.jsonl` é escrito por uma CLI **fora** do repositório (`aih-hook`), portanto é um contrato externo: precisa ser estável, versionado e tolerante a campos desconhecidos. Ele deixou de ser o canal principal de captura (o disco passou a ser a base) e virou o canal de **anúncio** do hook.

## Dependências

- **Anteriores:** nenhuma — esta é a primeira tarefa do backlog.
- **Futuras que dependem deste contrato:** E1-T2 (ledger e snapshots), E1-T3 (baseline do antes), E1-T4 (watcher do workspace), E2-T1 (timeline) e E4-T3 (writer do `.md`).
- **Externas:** nenhuma biblioteca nova; apenas APIs já presentes no fork.

## Etapas

1. Criar o módulo `src/vs/platform/changeLedger/` com a estrutura `common/` e `test/common/`.
2. Definir a **versão do schema do anúncio** e a regra de compatibilidade (versão desconhecida = anúncio rejeitado com erro explícito, nunca aceito pela metade).
3. Definir os **tipos** do contrato: `ChangeSource`, `ChangeEventAttribution`, `ChangeEventStatus`, `ChangeLineRange`, o anúncio de entrada `ChangeAnnouncement` e o evento `ChangeEvent`.
4. Implementar a **validação de entrada não confiável**: `unknown` → resultado tipado explícito (sucesso com valor ou falha com a lista de erros por campo), sem lançar exceção para dados ruins.
5. Escrever os **testes unitários** do contrato e da validação.
6. Rodar as validações do repositório: `npm run typecheck-client`, `npm run valid-layers-check` e os testes de unidade escopados.

## Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| O contrato do evento vira dependência de todas as tarefas seguintes | Mudança de campo depois espalha alterações por ledger, timeline e ponte `.md` | Manter o contrato mínimo e versionado; campos novos entram apenas como opcionais |
| Formato do JSONL usado por CLI externa | Mudança de formato quebra agentes já configurados | Versão de schema explícita + campos desconhecidos ignorados |
| Validação estrita demais | Eventos legítimos descartados quando a CLI evoluir | Exigir só o essencial; campos extras são preservados ou ignorados, nunca motivo de rejeição |
| Validação frouxa demais | Dados ruins entram no ledger e corrompem a timeline | Testes de borda obrigatórios (tipo errado, ausente, vazio, número negativo) |
| Dependência indevida em `common/` | Falha em `valid-layers-check` e no build web | Restringir o módulo a `vs/base/common` |
| Semântica de `status` e dos hashes ambígua no contrato | E1-T2/E2-T1 reinterpretam a regra de validade de formas diferentes | Fixar a regra no contrato e documentá-la em comentário |

## Decisões fechadas

**D1 — Local do módulo: `src/vs/platform/changeLedger/`** (definido pelo usuário). Descartada a árvore separada `src/ws/`: exigiria alterar `src/tsconfig.json` e `build/checker/layersChecker.ts`, arquivos compartilhados com o upstream, sem ganho de compilação. O módulo segue o padrão do fork — `common/` para os contratos e `test/common/` para os testes — e o `platform` já é a camada correta para um serviço consumido pelo workbench.

**D2 — `status` (`current`/`history`) não vem do agente.** É calculado e persistido pelo ledger (E1-T2) a partir do hash do arquivo no disco, conforme `overview.md` §4. O payload de entrada (linha do JSONL) e o evento armazenado são tipos distintos: o anúncio traz identidade, e o evento acrescenta o que a IDE calcula do disco.

**D3 — O hook não carrega conteúdo (superada pela revisão 3).** A linha do `.aih/events.jsonl` passou a ser um **anúncio**: identidade e intenção (`id`, `sessionId`, `fileUri`, `timestamp`). Os hashes antes/depois, o `status` e o diff são calculados pela IDE a partir do disco, com o baseline de E1-T3. Consequência para este contrato: `attribution` (`'hook'` \| `'observed'`) entra como campo obrigatório do evento armazenado e `beforeHash` passa a ser opcional (ausente = evento parcial). Ajuste aplicado na E1-T2.

## Critérios de aceite

1. Existem tipos exportados para origem, status, evento e sessão, coerentes com `overview.md` §4.
2. Existe uma versão de schema declarada e uma regra explícita para versão desconhecida.
3. A validação converte `unknown` em resultado tipado, sem lançar exceção, reportando o campo com problema.
4. A validação rejeita: campos obrigatórios ausentes, tipo errado, string vazia, caminho absoluto ou com `..`, `timestamp` não numérico ou não positivo e versão de schema desconhecida.
5. A validação aceita e ignora campos extras desconhecidos.
6. Testes unitários cobrem o caso válido e os casos de borda acima.
7. `npm run compile`, `npm run typecheck-client`, `npm run valid-layers-check` e os testes de unidade passam sem novos erros.
8. O módulo não depende de nada além de `vs/base/common`.
