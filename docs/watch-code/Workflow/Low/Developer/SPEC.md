# SPEC — Workflow Low / Developer

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | Low |
| Fluxo | `Developer → Reporter` |
| Etapa | Developer (1 de 2) |
| Entrada | Requisitos fornecidos pelo usuário ou especificação disponível no contexto |
| Saída | Código implementado no projeto |
| Próxima etapa | Reporter |

## Objetivo

Ler as instruções desta etapa e **implementar diretamente** a tarefa com base nos requisitos fornecidos pelo usuário ou na especificação disponível no contexto.

Este workflow é destinado a tarefas simples, localizadas e de baixo risco, sem planejamento ou especificação formais.

## Entradas

- A demanda original do usuário.
- O código existente relacionado ao escopo.
- O `CLAUDE.md` e os padrões existentes no projeto.

## Procedimento

1. Interpretar a demanda e confirmar que ela é simples, localizada e de baixo risco; caso contrário, informar o usuário e sugerir o workflow Medium ou High.
2. Localizar os pontos exatos de alteração no código.
3. Implementar a alteração mínima necessária, seguindo os padrões do projeto.
4. Manter o código em inglês e os comentários em português, apenas onde agregam valor.
5. Validar localmente: compilar/executar o comando de verificação do projeto quando disponível e revisar o comportamento alterado.
6. Se a tarefa revelar impacto arquitetural, mudança de contrato ou regra de negócio, **parar e submeter ao usuário** antes de continuar.

## Saída (artefato)

Alterações de código diretamente no projeto, com o resultado da validação prática registrado para o Reporter.

## Restrições

- **Evitar alterações desnecessárias e permanecer dentro do escopo solicitado.**
- Não altere arquivos fora do escopo da tarefa.
- Não introduza dependências, bibliotecas, refatorações ou mudanças de arquitetura não solicitadas.
- Não deixe código morto, comentado ou temporário.

## Critérios de conclusão

A implementação está concluída quando a demanda foi atendida, o projeto compila sem novos erros e nenhuma alteração fora do escopo foi realizada.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
