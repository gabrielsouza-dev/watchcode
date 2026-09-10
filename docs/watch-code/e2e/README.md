# Teste ponta a ponta — captura por disco

Prova, no aplicativo de verdade, que a captura por disco da E1 fecha o ciclo: um
script externo, **sem agente nenhum**, altera arquivos do workspace e cada
alteração vira um evento no ledger, com antes e depois corretos.

É a validação **ponta a ponta universal** do §9 do overview. Todos os testes de
unidade do módulo rodam sobre um sistema de arquivos em memória: nenhum deles toca
o disco, o watcher nativo ou o workbench montado. Esta é a metade que falta — e na
primeira execução real ela encontrou dois defeitos que a suíte inteira não via.

## Como executar

```
node --experimental-strip-types docs/watch-code/e2e/run-e2e.ts
```

Antes: `out/` compilado a partir do código atual (`npm run compile-client`). O
executor confere isso e aborta dizendo o comando quando estiver velho.

Opções:

| Opção | Padrão |
| --- | --- |
| `--workspace <pasta>` | `%TEMP%/watchcode-e2e/workspace` |
| `--user-data <pasta>` | `%TEMP%/watchcode-e2e/user-data` |
| `--manifest <arquivo>` | `%TEMP%/watchcode-e2e/manifest.json` |

Sai com 0 quando as invariantes passam.

## As três peças

| Arquivo | Papel |
| --- | --- |
| `write-changes.ts` | O estímulo: altera os arquivos e grava o manifesto de expectativa |
| `verify-ledger.ts` | O verificador: lê o ledger do perfil e confere as invariantes |
| `run-e2e.ts` | O executor: prepara, abre o app, estimula, espera, fecha e verifica |

Cada peça roda sozinha, o que ajuda quando a execução falha no meio:

```
node --experimental-strip-types docs/watch-code/e2e/write-changes.ts <workspace> <manifesto> [pastaDeEventos]
node --experimental-strip-types docs/watch-code/e2e/verify-ledger.ts <manifesto> <perfil>
```

O manifesto é o único acoplamento entre o estímulo e o verificador: o estímulo
declara o que fez e o que esperava, e o verificador confere o ledger contra isso.

## Como o teste sabe que a observação está ligada

Duas etapas, porque o app sobe em partes:

1. **A janela montada.** O executor espera o `workspace.json` no perfil e, depois,
   consulta a própria janela pelo depurador até o workbench existir
   (`.monaco-workbench .statusbar`). O `workspace.json` nasce muito antes da
   interface: medir por ele liberava o estímulo cerca de dez segundos cedo demais.
2. **A observação ligada.** O estímulo escreve primeiro um arquivo de
   **aquecimento** (`src/aquecimento.ts`) e só segue depois de ver o evento dele no
   ledger. Assim a sequência medida nunca começa com a observação desligada — e o
   evento de aquecimento é conferido como qualquer outro.

Os dois passos existem porque a falha mais provável deste teste é silenciosa: escrever
na hora errada produz um ledger vazio, não um erro.

## O que o teste cria

- **A pasta observada** — pequena, com repositório git próprio e um commit inicial.
  Os arquivos iniciais são `src/app.ts`, `src/legacy.ts` e `README.md`.
- **O perfil isolado** — pasta de dados e de extensões próprias, apagadas a cada
  execução. É nele que o ledger nasce, em
  `User/workspaceStorage/<id>/changeLedger/{events,index,snapshots,shadow}`.
- **O manifesto** — a expectativa, ao lado dos outros dois.

O perfil do desenvolvedor (`%LOCALAPPDATA%/watchcode-udd`) não é tocado: o teste
não interfere nos testes manuais T-0003 e T-0004, que usam aquele perfil.

## O que o estímulo faz

| id | arquivo | tipo | o que prova |
| --- | --- | --- | --- |
| w0 | `src/aquecimento.ts` | criação | ao menos um evento chegou: a observação está ligada |
| w1 | `src/app.ts` | alteração | o antes vem do git `HEAD` |
| w2 | `src/app.ts` | alteração | o antes continua sendo o do `HEAD` |
| w3 | `src/novo.ts` | criação | sem antes, evento parcial |
| w4 | `src/outro.ts` | criação | um evento só, não dois |
| w5 | `src/novo.ts` | alteração | o antes vem da sombra, e a cadeia continua |
| w6 | `src/legacy.ts` | remoção | evento sem depois |
| w7 | `node_modules/pacote/index.js` | ignorado | ruído não vira evento |

O aquecimento fica numa sessão própria; w1 a w4 ficam em outra; a pausa de 2500 ms
separa w5 e w6 numa terceira. O agrupador fecha sessão em 1500 ms.

## As invariantes

O verificador confere todas e imprime uma linha por uma: conjunto de arquivos
exatamente o esperado; contagem e ordem dos eventos por arquivo; `afterHash` e
`beforeHash` de cada evento iguais ao conteúdo real; snapshots íntegros; só o último
evento `current`; índice coerente; origem `observed` do `agent`; partição de sessões
igual à declarada; carimbos dentro da janela da execução; e o estado final do disco
casando com o último evento de cada arquivo.

## O que o executor imprime como evidência

- o caminho do ledger e quantos eventos havia ao estabilizar;
- **qual watcher o app usou** (`parcel` ou `nodejs`, quando o log registra);
- **o indicador da observação** na barra de status, consultado pelo depurador antes
  de fechar o app. É evidência, não asserção: quem julga o indicador é o T-0004.

## O que fica para trás

`%TEMP%/watchcode-e2e`. Pode ser apagado a qualquer momento; a execução seguinte
recria tudo. Uma execução que falha deixa três pistas úteis:

- `app-output.log`, a saída do próprio app, com os erros do renderer;
- `user-data/logs/<carimbo>/main.log` e `window1/renderer.log`;
- o manifesto, que diz o que o estímulo fez.

## Limites

- **Windows**: o executor abre o app por caminho e fecha a árvore com `taskkill`.
- **Git no PATH**: w1, w2 e w6 dependem do `HEAD` para o antes.
- **Abre uma janela** do Watch Code durante a execução, em perfil próprio.
- **Não julga a interface** além de registrar o indicador: comando e indicador
  continuam cobertos pelo teste manual T-0004.
