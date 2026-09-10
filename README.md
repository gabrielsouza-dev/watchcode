# Watch Code

Um fork do Visual Studio Code voltado a **visualizar em tempo real** as alterações
promovidas pelo agente de codificação e a **registrar sugestões de alteração** para ele.

O Watch Code não executa agentes e não é usado para escrever código. Ele observa o
disco para mostrar o que qualquer agente, script ou terminal alterou no workspace — o
que mudou, onde mudou e quando mudou — em uma linha do tempo navegável. O desenvolvedor
lê, navega e **propõe**. Quem escreve o código é o agente.

## Como funciona

A comunicação acontece nos dois sentidos:

| Direção | Canal | Conteúdo |
| --- | --- | --- |
| Agente → IDE | disco | alterações de arquivo, com o antes e o depois |
| IDE → agente | arquivo `.md` | propostas do desenvolvedor, com local e motivo |

**Agente → IDE.** Todo agente, sem exceção, altera arquivos no disco. A IDE observa o
workspace, recupera o estado anterior pelo git ou por um store de sombra e monta a
linha do tempo com o diff de cada alteração. Não há nada a configurar: se o arquivo
mudou, ele aparece.

**IDE → agente.** O desenvolvedor registra propostas — sugestão de alteração ou TODO,
com localização e motivo — e a IDE as escreve em um arquivo `.md` que o agente lê.
Uma instrução plantada no arquivo de instruções que o workspace já usa (`CLAUDE.md`,
`AGENTS.md`, `.github/copilot-instructions.md`) avisa o agente de que
esse arquivo existe.

Funciona com qualquer agente. Onde o agente oferece hook, a IDE se integra
opcionalmente para agrupar as alterações por turno e identificar a sessão; sem hook, o
agrupamento é feito por pausa e o produto continua funcionando.

## O que ele não é

- **Não é um agente.** Não há chat nem execução de modelo.
- **Não é um editor para escrever código.** O editor serve para ler e comparar.
- **Não exige integração.** A captura é por disco, então vale para qualquer agente,
  script ou pessoa.

## Status

Em desenvolvimento. A base é o `code-oss-dev` 1.138.0 e o trabalho está organizado
em etapas: contratos do evento de alteração, ledger de snapshots, baseline do antes,
watcher do workspace, linha do tempo, diff e propostas. O acompanhamento está em
[`docs/watch-code/Workflow/overview.md`](docs/watch-code/Workflow/overview.md).

## Desenvolvimento

O processo de build é o mesmo do fork original: siga o
[How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute).

No Windows, `watchcode.bat` na raiz abre a build já compilada, com diretórios de
dados e de extensões isolados do VS Code instalado.

## Licença

MIT. Copyright (c) Microsoft Corporation. Veja [LICENSE.txt](LICENSE.txt).
