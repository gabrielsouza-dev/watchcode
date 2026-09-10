# SPEC — Workflow Medium / Reporter

> Este arquivo define as **instruções de execução** da etapa. Ele **não** é um prompt para subagentes: a etapa é executada pelo **modelo principal**, diretamente, no projeto atual.

| Campo | Valor |
| --- | --- |
| Workflow | Medium |
| Fluxo | `SpecWriter → Developer → Reporter` |
| Etapa | Reporter (3 de 3) |
| Entrada | Artefatos das etapas anteriores (SPEC e código) |
| Saída | Relatório consolidado apresentado ao usuário |
| Próxima etapa | — (fim do workflow) |

## Objetivo

Ler as instruções desta etapa e **reportar ao usuário** o resultado do workflow.

## Entradas

- A especificação em `docs/watch-code/SPECS/<slug>.md`.
- As alterações de código implementadas.
- O resultado da validação realizada na etapa Developer.

## Procedimento

1. Reunir os artefatos das etapas anteriores.
2. Consolidar o relatório com as seções obrigatórias abaixo.
3. Apresentar o relatório ao usuário de forma objetiva e verificável.

## Saída (artefato)

Relatório contendo, obrigatoriamente:

- **Resultado da implementação** — o que foi entregue e se atende ao objetivo.
- **Alterações realizadas** — arquivos criados, alterados e removidos.
- **Validações executadas e seus resultados** — comandos, escopo e conclusão.
- **Impedimentos encontrados** — bloqueios, falhas ou limitações.
- **Decisões que necessitam de intervenção do usuário** — pontos que exigem aprovação ou escolha.
- **Comandos necessários para executar ou testar a implementação**.
- **Pendências ou limitações** — o que ficou fora do escopo ou não foi verificado.

## Como comunicar o relatório

O relatório é lido por uma pessoa que quer entender **o que mudou e se está
funcionando** — não por quem vai reler o código. Escreva para essa pessoa.

**Forma**

- **Resuma primeiro.** Abra com o resultado em poucas linhas: o que foi
  entregue e se atende ao objetivo. Quem só ler isso já sai sabendo o essencial.
- **Seja claro e objetivo.** Frase curta, voz ativa, sem rodeio. Corte o que não
  muda a decisão de quem lê.
- **Tom informal.** Escreva como quem conversa com um colega: "o teste pegou um
  bug real aqui", não "foi identificada uma inconsistência".
- **Sem jargão solto.** Termo técnico só quando for o nome exato da coisa; se
  precisar explicar, explique em uma linha.
- **Nada de encher linguiça.** Sem "conforme solicitado", sem "vale ressaltar",
  sem repetir o que já foi dito na seção anterior.

**Quando o problema for complexo**

- **Use uma analogia** para dar a intuição antes do detalhe. Ex.: "o ledger
  devolvia um evento diferente do que gravava — como um recibo que não bate com
  o que foi comprado".
- **Mas nunca pare na analogia.** Logo depois vem a parte técnica: o arquivo, a
  função, o campo, o comando. A analogia abre a porta; o detalhe é o que
  sustenta a confiança.
- **Explique a causa, não só o sintoma.** O que estava errado, por que estava
  errado, e por que a correção resolve.

**O que não pode faltar**

- Evidência real de validação — comando executado e resultado obtido. Nunca
  afirmar que funciona sem mostrar como se sabe.
- Os caminhos exatos dos arquivos criados e alterados.
- O que ficou de fora, o que não foi verificado e o que ainda depende do usuário.
## Restrições

- Não alterar código nesta etapa.
- Não declarar sucesso sem evidência de validação.
- Não omitir falhas, impedimentos ou decisões pendentes.

## Critérios de conclusão

O workflow está concluído quando o relatório foi apresentado ao usuário com todas as seções obrigatórias preenchidas.

## Regras

- Não crie nem utilize **subagentes**; a etapa é executada pelo modelo principal.
- Não utilize **Git Worktrees**.
- Não altere arquivos fora do escopo da tarefa.
- Escreva todo código em inglês e todos os comentários em português.
- Não assuma decisões arquiteturais, de contrato, de dependência ou de regra de negócio: apresente-as ao usuário antes de implementar.
- Siga o `CLAUDE.md` da raiz do projeto e os padrões já existentes no código.
- Não avance para a próxima etapa antes de concluir integralmente esta etapa.
