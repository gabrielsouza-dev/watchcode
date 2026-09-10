# SPEC — Workflow High / SpecWriter

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Fluxo | `PlanWriter → SpecWriter → Developer → Tester → Reporter` |
| Etapa | SpecWriter (2 de 5) |
| Entrada | docs/watch-code/PLANS/<slug>.md |
| Saída | docs/watch-code/SPECS/<slug>.md |
| Próxima etapa | Developer |

## Objetivo

Transformar o `PLAN` em uma **especificação técnica detalhada**, precisa o bastante para que a implementação não exija novas decisões.

## Entradas

- O plano da tarefa em `docs/watch-code/PLANS/<slug>.md`.
- O código existente afetado pelo escopo.
- Os padrões e convenções do projeto (`CLAUDE.md` e código adjacente).

## Procedimento

1. Ler o plano e localizar no código os pontos exatos de alteração.
2. Definir o comportamento esperado: entradas, saídas, estados, erros e casos de borda.
3. Descrever as alterações necessárias por arquivo/módulo (criar, alterar, remover), com assinaturas e contratos.
4. Definir a estratégia de validação: o que deve ser testado e como.
5. Registrar a especificação no arquivo de saída.
6. Se surgir uma decisão arquitetural ou de contrato relevante não prevista no plano, **interromper e submeter ao usuário**.

## Saída (artefato)

Arquivo `docs/watch-code/SPECS/<slug>.md` contendo, no mínimo:

- **Referência** — link para o plano correspondente.
- **Comportamento esperado** — descrição funcional e técnica.
- **Contratos** — APIs, interfaces, tipos, eventos ou mensagens envolvidos.
- **Alterações necessárias** — lista por arquivo/módulo, com o que muda e por quê.
- **Casos de borda e tratamento de erro**.
- **Plano de testes** — o que validar e em qual nível (unidade, integração, manual).
- **Critérios de aceite verificáveis**.
- **Decisões pendentes** — pontos que dependem do usuário.

## O que NÃO fazer nesta etapa

- Não implementar código.
- Não executar testes.
- Não alterar o plano; se o plano estiver incorreto, registre a divergência e submeta ao usuário.

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
