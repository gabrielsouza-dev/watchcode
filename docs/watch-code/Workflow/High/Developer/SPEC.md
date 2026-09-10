# SPEC — Workflow High / Developer

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Fluxo | `PlanWriter → SpecWriter → Developer → Tester → Reporter` |
| Etapa | Developer (3 de 5) |
| Entrada | docs/watch-code/SPECS/<slug>.md |
| Saída | Código implementado no projeto |
| Próxima etapa | Tester |

## Objetivo

Ler a `SPEC` correspondente e **implementar diretamente** a tarefa no projeto.

## Entradas

- A especificação em `docs/watch-code/SPECS/<slug>.md`.
- O plano em `docs/watch-code/PLANS/<slug>.md`, para contexto.
- O `CLAUDE.md` e os padrões existentes no projeto.

## Procedimento

1. Ler integralmente a `SPEC` e o `PLAN` antes de escrever qualquer código.
2. Inspecionar o código existente que será alterado.
3. Implementar apenas as alterações descritas na `SPEC`, seguindo os padrões do projeto.
4. Manter o código em inglês e os comentários em português, apenas onde agregam valor.
5. Compilar/validar localmente sempre que o projeto oferecer um comando para isso.
6. Se a `SPEC` estiver ambígua, incompleta ou exigir decisão relevante, **parar e submeter ao usuário** em vez de assumir.

## Saída (artefato)

Alterações de código diretamente no projeto, limitadas ao escopo da `SPEC`, prontas para validação pelo Tester.

## Restrições

- Não altere arquivos fora do escopo definido na `SPEC`.
- Não introduza dependências, bibliotecas, refatorações ou mudanças de arquitetura não especificadas.
- Não escreva ou modifique testes de validação nesta etapa (responsabilidade do Tester).
- Não deixe código morto, comentado ou temporário.

## Critérios de conclusão

A implementação está concluída quando todas as alterações da `SPEC` foram aplicadas, o projeto compila sem novos erros e nenhuma decisão fora do escopo foi tomada autonomamente.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
