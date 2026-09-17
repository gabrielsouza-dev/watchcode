# Especificação — E2-T9 · Linha da timeline sem texto cortado

| Campo | Valor |
| --- | --- |
| Tarefa | **E2-T9** — a segunda faixa da linha da timeline aparece inteira |
| Workflow | Medium — `SpecWriter → Developer → Reporter` |
| Origem | Defeito visual encontrado pelo usuário em 16/09/2026, explorando o projeto de exemplo (`D:\Youtube\Dev\watchcode-demo`), e medido na janela aberta |
| Módulo | `src/vs/workbench/contrib/watchCode/browser` |
| Arquivo tocado | `timelineView.ts` — uma opção da lista; nenhuma linha de comportamento |

## 1. Objetivo

A segunda faixa de cada linha da linha do tempo — pasta, linhas, hora e origem — aparece **inteira**. Hoje ela é desenhada com o dobro da altura da própria caixa e sai cortada ao meio, em toda linha da lista.

## 2. O defeito, medido

Não é suposição: a janela aberta foi lida por sonda sobre o depurador (CDP, porta 9334), com o projeto de exemplo observado. Números da primeira linha da lista:

| O que | Valor medido |
| --- | --- |
| Caixa do item (`.monaco-list-row`) | topo 496, altura **44 px** |
| Caixa da faixa de detalhe (`.detail`) | topo 518, altura **22 px** |
| Entrelinha herdada pela faixa de detalhe | **44 px** (`scrollHeight` 44 contra `clientHeight` 22) |
| Caixa do nome do arquivo (`.name`) | topo **485** — 11 px **acima** do topo do próprio item |

Traduzindo: a lista escreve `line-height` do tamanho do item no elemento do item (`listView.ts:1073-1074`), e o nosso item tem **duas** faixas de texto. Cada faixa nasce com 44 px de entrelinha dentro de uma caixa de 22 px; a faixa de detalhe tem `overflow: hidden` (`timelineView.css:64-69`), então só a fatia de cima dos glifos aparece — e o conjunto, com 88 px de conteúdo num item de 44 px, é centrado para fora da caixa. A foto tirada da caixa da timeline mostra o resultado: as faixas de detalhe aparecem como um risco fino e invadem a linha de cima.

O nome do arquivo não sofre: ele é curto e a fatia visível basta para lê-lo.

## 3. Causa

A lista é criada sem a opção que diz se ela deve escrever a entrelinha do item (`timelineView.ts:256-265`). Sem `setRowLineHeight: false`, o item herda a entrelinha de 44 px, que é o comportamento correto para uma lista de **uma** linha de texto e errado para um item desenhado à mão com duas.

É o idioma do próprio VS Code: **todas** as outras listas do workbench com item de mais de uma faixa desligam essa opção — 21 chamadas em `src/vs/workbench` (a pilha de chamadas do depurador, o painel de SCM, a lista de notificações, o editor de perfis, o gerenciador de modelos do chat). A nossa é a única que não desliga.

## 4. Escopo

**Entra**

- Desligar a entrelinha de item na lista da timeline, na criação da lista.
- Uma conferência de geometria no arnês (cenário **T-0017**) que reprova quando qualquer faixa de texto da linha sai cortada.
- O registro do defeito em `docs/watch-code/testes-manuais.md` e o status da tarefa no guia.

**Não entra**

- **Pintar as linhas de verde e vermelho.** Isso é o diff da **E3-T3**, a próxima tarefa da etapa: hoje o produto não decora linha nenhuma no editor, e o que o desenvolvedor vê ao clicar numa alteração é a faixa **selecionada** pelo salto (E2-T4). Não é defeito, é entrega que ainda não existe.
- Mudar a altura da linha (44 px) ou o desenho da linha: duas faixas de 18,2 px cabem centradas nos 44 px, sem aperto.
- Mexer no `listView.ts` do core: o comportamento dele está certo e é usado por todo o IDE.
- O corte horizontal de um nome longo: ali o `text-overflow: ellipsis` faz o trabalho dele, e é assim que o Explorer se comporta.
- O corte do próprio painel quando ele está mais baixo que o conteúdo: isso é a altura da view, que o desenvolvedor arrasta.

## 5. Alteração necessária

| Arquivo | O que muda | Por quê |
| --- | --- | --- |
| `src/vs/workbench/contrib/watchCode/browser/timelineView.ts` | Uma linha a mais nas opções passadas a `createList`: `setRowLineHeight: false`, com comentário em português dizendo por que | É a chave que o próprio VS Code usa para listas de item desenhado à mão; sem ela a entrelinha do item é a altura dele |

Nenhum contrato muda: a opção é do `IListOptions` do workbench, não há estado novo, serviço novo, campo novo em evento nem arquivo novo.

## 6. Casos de borda

| # | Caso | O que acontece |
| --- | --- | --- |
| B1 | Lista vazia (nenhuma alteração) | Nada desenhado; a mensagem do estado vazio segue igual |
| B2 | Linha selecionada e focada | O fundo da seleção continua do tamanho do item; só o texto volta ao lugar |
| B3 | Nome de arquivo longo | Trunca com `…` na horizontal, como antes |
| B4 | Item fora da área visível | Não existe no DOM — limite da lista virtualizada, já registrado na E2-T6 |
| B5 | Fonte maior no sistema ou zoom da janela | As duas faixas continuam dentro do item enquanto couberem em 44 px; com fonte muito maior o texto segue a entrelinha natural e o item não cresce |

## 7. Validação esperada

1. **Antes e depois, na janela de verdade.** Sonda sobre CDP lendo a geometria de cada linha desenhada: `scrollHeight` da faixa de detalhe contra `clientHeight` dela, e o topo da faixa contra o topo do item. Os números dos dois lados vão para o relatório.
2. **Cenário T-0017 no arnês**, com a mesma conferência em forma de teste: nenhuma faixa de texto pode ter `scrollHeight > clientHeight`, e nenhuma pode começar acima do item. Reprova se alguma tiver.
3. **Regressão:** `transpile-client`, `typecheck-client`, `eslint` no arquivo tocado, `valid-layers-check`, `hygiene`, as suítes de unidade (`changeLedger` e `watchCode`) e o arnês inteiro por cima — o T-0005, o T-0012 e o T-0013 leem o texto das linhas e continuam valendo.

## 8. Critérios de aceite verificáveis

1. A criação da lista em `timelineView.ts` passa `setRowLineHeight: false`, com comentário em português.
2. Na janela, a faixa de detalhe de **toda** linha desenhada tem `scrollHeight === clientHeight` e começa dentro do item — medido, com os números no relatório.
3. O T-0017 passa isolado e o arnês inteiro termina verde.
4. `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` com saída 0; as duas suítes de unidade com as contagens medidas e registradas.
5. O defeito e a correção ficam registrados em `docs/watch-code/testes-manuais.md`, e a tarefa entra na tabela da E2 no guia com o status `feito`.

## 9. Limites e preços

1. **A linha continua com 44 px.** As duas faixas de 18,2 px ficam centralizadas com 4 px de sobra em cima e embaixo: é o desenho que a lista já tinha em mente, e o defeito era só a entrelinha.
2. **Nada disto é o diff.** Verde e vermelho, rótulo de lado e o diff abrindo por ação explícita são a **E3-T3**; esta correção não antecipa nada dela.
3. **A conferência é de geometria, não de pixel.** O arnês mede caixa e transbordo; se o VS Code mudar a fonte padrão, o teste acompanha.

## 10. Divergências e achados da execução

| # | Ponto | Situação |
| --- | --- | --- |
| 1 | **O `typecheck-client` estava vermelho no HEAD**, antes desta tarefa | Dois erros de tipo nos testes da **E3-T2** — `changeDocument.test.ts:110` (o array montado traz `URI | undefined`) e `changeDocumentProvider.test.ts:198` (`writeFile` é opcional no `IFileSystemProvider`). Como o critério 4 desta SPEC exige `typecheck` com saída 0, os dois foram corrigidos aqui, **sem mudança de comportamento**: a leitura passou a tratar o `undefined` que o tipo já anunciava e a escrita passou a exigir do provedor a declaração que ela mesma testa. Nenhum caso mudou de nome nem de resultado — as duas suítes seguem com **195** e **66** verdes |
| 2 | O arnês inteiro reprovou em **T-0003** e **T-0008** na primeira execução | Nenhum dos dois toca no que esta tarefa mudou. Os dois passaram sozinhos, na mesma revisão e sem nenhuma linha mudada (`veredito: PASSOU (2 testes manuais)`), e a **segunda execução inteira passou**, com os 17 cenários. É a instabilidade de máquina já registrada na E2-T8, com a janela de exploração aberta e em uso durante a execução |
| 3 | Um segundo defeito achado pela mesma exploração, **fora do escopo desta tarefa** | Esconder as Extensões deixou a viewlet registrando views num container que já não existe, e toda subida do produto grava um erro no log (`viewDescriptorService.js:174`, `viewContainer.id` de `undefined`; medido em **todos** os perfis de log do arnês). Virou a tarefa **E0-T6** no guia, com os dois candidatos de correção anotados |
