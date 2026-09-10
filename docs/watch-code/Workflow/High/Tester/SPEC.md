# SPEC — Workflow High / Tester

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Fluxo | `PlanWriter → SpecWriter → Developer → Tester → Reporter` |
| Etapa | Tester (4 de 5) |
| Entrada | Código implementado + docs/watch-code/SPECS/<slug>.md + docs/watch-code/PLANS/<slug>.md |
| Saída | Testes criados/atualizados e resultado da validação |
| Próxima etapa | Reporter |

## Objetivo

Ler a `SPEC` correspondente e **validar a implementação** com base no `PLAN` e na `SPEC`, criando ou atualizando os testes necessários.

## Entradas

- A implementação realizada na etapa anterior.
- A especificação em `docs/watch-code/SPECS/<slug>.md`.
- O plano em `docs/watch-code/PLANS/<slug>.md`.
- A infraestrutura de testes existente no projeto.

## Procedimento

1. Comparar a implementação com o comportamento esperado descrito na `SPEC`.
2. Identificar o nível de teste adequado (unidade, integração, end-to-end ou verificação manual).
3. Criar ou atualizar os testes necessários, seguindo os padrões de teste do projeto.
4. Executar os testes e os comandos de validação disponíveis (consulte o `package.json` e as instruções do repositório).
5. Registrar para cada requisito da `SPEC`: atendido, não atendido ou não verificável, com a evidência (teste/comando/resultado).
6. Se um requisito não for atendido, reportar o desvio de forma objetiva; **não corrigir a implementação silenciosamente** como parte da validação — correções requerem retorno à etapa Developer.

## Saída (artefato)

- Testes criados ou atualizados no projeto.
- Registro de validação: requisito → verificação → resultado, incluindo falhas, avisos e limitações da validação.

## Restrições

- Não altere o comportamento do código de produção para fazer os testes passarem.
- Não remova, desabilite ou afrouxe testes existentes para obter resultado verde.
- Não expanda o escopo com testes de áreas não relacionadas à tarefa.

## Critérios de conclusão

A validação está concluída quando todo requisito verificável da `SPEC` possui evidência de verificação e o resultado (aprovado, reprovado ou parcial, com justificativa) está registrado para o Reporter.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
