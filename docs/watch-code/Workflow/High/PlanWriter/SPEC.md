# SPEC — Workflow High / PlanWriter

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Fluxo | `PlanWriter → SpecWriter → Developer → Tester → Reporter` |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Objetivo da tarefa fornecido pelo usuário |
| Saída | docs/watch-code/PLANS/<slug>.md |
| Próxima etapa | SpecWriter |

## Objetivo

Transformar o objetivo da tarefa em um **plano conceitual de desenvolvimento**, sem escrever código e sem definir detalhes de implementação.

## Entradas

- A demanda original do usuário.
- O contexto do projeto (`CLAUDE.md`, documentação de arquitetura e padrões existentes).
- Código existente relacionado ao escopo, quando necessário para entender o problema.

## Procedimento

1. Ler a demanda e identificar o problema real a ser resolvido.
2. Investigar o código existente apenas o suficiente para entender o contexto e as dependências envolvidas.
3. Delimitar claramente o **escopo** (o que entra e o que não entra na tarefa).
4. Definir as **etapas necessárias** para a implementação, em ordem executável.
5. Identificar riscos, impactos e pontos que exigem decisão do usuário.
6. Registrar o plano no arquivo de saída.

## Saída (artefato)

Arquivo `docs/watch-code/PLANS/<slug>.md` contendo, no mínimo:

- **Objetivo** — o resultado esperado em uma frase.
- **Escopo** — o que está incluído e o que está explicitamente fora.
- **Contexto** — arquivos, componentes e fluxos relevantes.
- **Dependências** — módulos, serviços, dados ou tarefas das quais a implementação depende.
- **Etapas** — sequência de passos de implementação.
- **Riscos e impactos** — o que pode quebrar ou ser afetado.
- **Decisões pendentes** — tudo que precisa de aprovação do usuário.
- **Critérios de aceite** — como saber que a tarefa foi concluída.

## O que NÃO fazer nesta etapa

- Não escrever, alterar ou refatorar código.
- Não criar a especificação técnica (responsabilidade do SpecWriter).
- Não executar testes.

## Critérios de conclusão

O plano está concluído quando cobre objetivo, escopo, contexto, dependências e etapas, e está salvo em `docs/watch-code/PLANS`. Só então a etapa é considerada pronta para o SpecWriter.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
