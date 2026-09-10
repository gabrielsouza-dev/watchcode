# SPEC — Workflow Medium / SpecWriter

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | Medium |
| Fluxo | `SpecWriter → Developer → Reporter` |
| Etapa | SpecWriter (1 de 3) |
| Entrada | Demanda fornecida pelo usuário |
| Saída | docs/watch-code/SPECS/<slug>.md |
| Próxima etapa | Developer |

## Objetivo

Ler as instruções desta etapa, analisar a demanda e criar uma **especificação técnica detalhada**.

Este workflow não possui etapa de planejamento formal: a especificação assume o papel de documento de referência da tarefa.

## Entradas

- A demanda original do usuário.
- O código existente relacionado ao escopo.
- Os padrões e convenções do projeto (`CLAUDE.md`).

## Procedimento

1. Interpretar a demanda e delimitar o escopo (o que entra e o que não entra).
2. Investigar o código afetado para localizar os pontos exatos de alteração.
3. Definir o comportamento esperado: entradas, saídas, estados, erros e casos de borda.
4. Descrever as alterações necessárias por arquivo/módulo, com contratos e assinaturas.
5. Definir o que deve ser validado após a implementação.
6. Registrar a especificação em `docs/watch-code/SPECS/<slug>.md`.
7. Se a demanda exigir decisão arquitetural, de contrato ou de regra de negócio, **interromper e submeter ao usuário** — nesse caso, avalie se a tarefa pertence, na verdade, ao Workflow High.

## Saída (artefato)

Arquivo `docs/watch-code/SPECS/<slug>.md` contendo, no mínimo:

- **Objetivo** — resultado esperado em uma frase.
- **Escopo** — o que está incluído e o que está fora.
- **Comportamento esperado** — descrição funcional e técnica.
- **Contratos** — APIs, interfaces, tipos, eventos ou mensagens envolvidos.
- **Alterações necessárias** — lista por arquivo/módulo, com o que muda e por quê.
- **Casos de borda e tratamento de erro**.
- **Validação esperada** — o que verificar e como.
- **Critérios de aceite verificáveis**.

## O que NÃO fazer nesta etapa

- Não implementar código.
- Não executar testes.

## Critérios de conclusão

A especificação está concluída quando o Developer consegue implementar sem tomar decisões adicionais de arquitetura, contrato ou comportamento, e o arquivo está salvo em `docs/watch-code/SPECS`.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
