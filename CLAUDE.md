# CLAUDE.md

Este arquivo estabelece o padrão de desenvolvimento e o funcionamento dos workflows deste projeto.

**Projeto:** Watch Code — IDE que observa o que agentes externos alteram no workspace e devolve ao agente, por um arquivo `.md`, o que o desenvolvedor alterou manualmente.

## Diretrizes de desenvolvimento

- Atue como um desenvolvedor sênior.
- Siga princípios de **Clean Code**, priorizando legibilidade, simplicidade, manutenibilidade e baixo acoplamento.
- Todo código deve ser escrito em **inglês**.
- Todos os comentários no código devem ser escritos em **português**.
- Trabalhe diretamente no projeto atual.
- **Não utilize Git Worktrees.**
- **Não utilize subagentes.**
- O modelo principal será responsável por executar todas as etapas do workflow.
- Ao iniciar uma etapa, o modelo deverá ler o `SPEC.md` correspondente dentro do workflow e seguir suas instruções diretamente.
- Os diretórios `PlanWriter`, `SpecWriter`, `Developer`, `Tester` e `Reporter` representam **papéis e conjuntos de instruções**, não agentes ou subagentes independentes.
- Não altere arquivos fora do escopo da tarefa.
- Não assuma decisões arquiteturais ou de negócio relevantes.
- Decisões que possam alterar arquitetura, comportamento, contratos, dependências ou regras de negócio devem ser submetidas ao usuário antes da implementação.
- Decisões técnicas locais, reversíveis e consistentes com os padrões existentes podem ser tomadas autonomamente.
- Cada etapa deve consumir o artefato da etapa anterior, executar apenas sua responsabilidade e produzir o resultado esperado para a próxima etapa.

## Testes manuais

Quando uma tarefa exigir verificação manual — algo que não pode ser comprovado por teste automatizado — o teste deve ser registrado em `./docs/watch-code/testes-manuais.md`, que é o **registro único** de todos os testes manuais do projeto.

Regras:

- O arquivo é **acumulativo**: cada teste manual é acrescentado sem remover os anteriores.
- Cada teste é identificado por um título e pela tarefa de origem (ex.: `E1-T4 — Watcher`).
- O teste deve estar **bem especificado**, de modo que outra pessoa consiga executá-lo sem consultar o código:
  1. **Objetivo** — o que este teste comprova e por que um teste automatizado não cobre isso.
  2. **Pré-condições** — estado necessário antes de começar (workspace, configuração, arquivos iniciais, extensões instaladas).
  3. **Passos** — sequência numerada e explícita, com os comandos exatos a executar.
  4. **Resultado esperado** — o que se deve observar em cada passo, de forma verificável.
  5. **Resultado obtido** — preenchido na execução, com data e o que de fato aconteceu.
  6. **Situação** — `pendente`, `aprovado` ou `reprovado`.
- Um teste manual só pode ser marcado como `aprovado` após ser executado de fato. O registro não pode ser escrito retroativamente como se tivesse sido executado.
- Se a execução falhar, o resultado obtido e a correção aplicada devem ser registrados no próprio teste, sem apagar o histórico.
- Quando houver teste manual pendente, ele deve ser informado no relatório final da tarefa.

## Como me comunicar

Vale para os relatórios e para qualquer resposta que eu leia.

- **Resuma primeiro.** O resultado em poucas linhas, antes de qualquer detalhe.
- **Claro e objetivo.** Frase curta, voz ativa. Corte o que não muda a decisão.
- **Tom informal.** Como quem conversa com um colega.
- **Se o problema for complexo, use uma analogia** para dar a intuição — mas
  nunca pare nela: logo depois vem a parte técnica, com arquivo, função e
  comando. A analogia abre a porta; o detalhe sustenta a confiança.
- **Sempre apresente a parte técnica**, mesmo quando o assunto for simples.
- **Evidência sempre.** Comando executado e resultado obtido, em vez de
  afirmar que funciona.

## Estrutura

```
docs/watch-code
├── PLANS
├── SPECS
└── Workflow
    ├── overview.md
    ├── tasks.md
    ├── High
    │   ├── PlanWriter
    │   │   └── SPEC.md
    │   ├── SpecWriter
    │   │   └── SPEC.md
    │   ├── Developer
    │   │   └── SPEC.md
    │   ├── Tester
    │   │   └── SPEC.md
    │   └── Reporter
    │       └── SPEC.md
    │
    ├── Medium
    │   ├── SpecWriter
    │   │   └── SPEC.md
    │   ├── Developer
    │   │   └── SPEC.md
    │   └── Reporter
    │       └── SPEC.md
    │
    └── Low
        ├── Developer
        │   └── SPEC.md
        └── Reporter
            └── SPEC.md
```

Os arquivos `SPEC.md` dentro de `Workflow` devem definir as responsabilidades e regras de cada etapa. Os documentos específicos de cada tarefa devem ser armazenados em `docs/watch-code/PLANS` e `docs/watch-code/SPECS`.

### Convenção de nomes

Cada tarefa é identificada por um `slug` em kebab-case, derivado do objetivo da tarefa:

- Plano da tarefa: `docs/watch-code/PLANS/<slug>.md`
- Especificação da tarefa: `docs/watch-code/SPECS/<slug>.md`

## Guia de desenvolvimento

O guia de desenvolvimento do produto está em `docs/watch-code/Workflow/overview.md`.

Ele é a fonte única para visão, arquitetura, modelo de dados, formato do `.md`, backlog, riscos e critérios de aceite, e deve ser **lido antes de iniciar qualquer tarefa**.

O guia **não é implementado nem reescrito durante a execução**: seu papel é orientar a ordem de desenvolvimento. As etapas (E1 a E7) e suas tarefas (E1-T1, E1-T2, ...) são a unidade de trabalho, e cada tarefa corresponde a **um ciclo completo** do workflow.

Para executar uma tarefa:

1. Identificar no backlog a primeira tarefa pendente cuja dependência esteja concluída.
2. Criar a especificação em `docs/watch-code/SPECS/<id-da-tarefa>.md` (ex.: `e1-t1-contratos-do-evento.md`).
3. Executar o workflow correspondente ao tipo da tarefa (High, Medium ou Low).
4. Validar conforme a seção de validação do guia.
5. Relatar o resultado e atualizar o status da tarefa no backlog do guia.

Nenhuma tarefa pode depender de uma tarefa posterior. Se uma tarefa se mostrar grande demais durante a especificação, ela é dividida no próprio guia antes de prosseguir.

O resumo da lista de tarefas, em ordem de desenvolvimento, junto do modo de utilização dos workflows está em `docs/watch-code/Workflow/tasks.md`.

## Execução dos Workflows

Os workflows não devem criar ou utilizar subagentes.

A escolha do workflow para cada tarefa segue `docs/watch-code/Workflow/tasks.md`.

O critério é o **tipo de trabalho**: implementação → High; correção de bug → Medium; pequena alteração → Low.
A complexidade confirma o critério: se a tarefa tem impacto arquitetural, toca múltiplos componentes ou exige planejamento, ela é executada no High mesmo sendo pequena ou sendo uma correção.
Em caso de dúvida, prevalece o workflow **mais rigoroso** (High).

O **modelo principal** será responsável por executar todas as etapas sequencialmente.

Para cada etapa, o modelo deverá:

1. Identificar o workflow e a etapa atual.
2. Ler o `SPEC.md` correspondente dentro de `docs/watch-code/Workflow`.
3. Interpretar as instruções e responsabilidades definidas para aquela etapa.
4. Executar diretamente a demanda utilizando o contexto e os artefatos disponíveis.
5. Produzir ou atualizar o artefato esperado pela próxima etapa.
6. Prosseguir para a próxima etapa somente após concluir a etapa atual.

Os `SPEC.md` de cada diretório devem ser tratados como **instruções de execução da etapa**, e não como prompts destinados a subagentes.

## Workflow High

Utilizar para **toda implementação** — novas features, componentes, contratos ou serviços. Também para qualquer tarefa, mesmo pequena ou de correção, que tenha impacto arquitetural, afete contratos/dependências, toque múltiplos componentes ou exija planejamento e validação formal.

Fluxo: `PlanWriter → SpecWriter → Developer → Tester → Reporter`

| Etapa | Instruções |
| --- | --- |
| PlanWriter | `docs/watch-code/Workflow/High/PlanWriter/SPEC.md` |
| SpecWriter | `docs/watch-code/Workflow/High/SpecWriter/SPEC.md` |
| Developer | `docs/watch-code/Workflow/High/Developer/SPEC.md` |
| Tester | `docs/watch-code/Workflow/High/Tester/SPEC.md` |
| Reporter | `docs/watch-code/Workflow/High/Reporter/SPEC.md` |

## Workflow Medium

Utilizar para **correção de bugs** e ajustes de comportamento em código existente, de complexidade intermediária, que não exijam planejamento formal nem alterem contratos ou arquitetura.

Fluxo: `SpecWriter → Developer → Reporter`

| Etapa | Instruções |
| --- | --- |
| SpecWriter | `docs/watch-code/Workflow/Medium/SpecWriter/SPEC.md` |
| Developer | `docs/watch-code/Workflow/Medium/Developer/SPEC.md` |
| Reporter | `docs/watch-code/Workflow/Medium/Reporter/SPEC.md` |

## Workflow Low

Utilizar para **pequenas alterações** simples, localizadas e de baixo risco — texto, estilo, ajuste pontual ou configuração — sem mudança de comportamento relevante.

Fluxo: `Developer → Reporter`

| Etapa | Instruções |
| --- | --- |
| Developer | `docs/watch-code/Workflow/Low/Developer/SPEC.md` |
| Reporter | `docs/watch-code/Workflow/Low/Reporter/SPEC.md` |

## Princípio dos Workflows

Os workflows devem manter a seguinte cadeia de responsabilidade:

```
High
Objetivo → PLAN → SPEC → CODE → TEST → REPORT

Medium
Objetivo → SPEC → CODE → REPORT

Low
Objetivo → CODE → REPORT
```

Todas as etapas são executadas pelo **mesmo modelo**, de forma sequencial e sem utilização de subagentes.

Os diretórios e arquivos do workflow representam apenas **contexto, instruções e contratos de execução** para o modelo principal.

O objetivo é garantir rastreabilidade entre requisito, planejamento, especificação, implementação, validação e resultado, mantendo o processo simples, previsível e centralizado.
