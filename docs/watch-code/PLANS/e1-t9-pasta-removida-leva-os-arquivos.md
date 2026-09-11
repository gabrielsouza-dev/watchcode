# Plano — E1-T9 · A pasta removida leva junto os arquivos que a observação conhece sob ela

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T9 — A pasta removida leva junto os arquivos que a observação conhece sob ela |
| Workflow | High (mexe no que o gravador grava e no contrato de leitura do ledger) |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Linha E1-T9 do backlog (`overview.md` §6) e a execução do T-0011 na E1-T8 |
| Saída | Este plano → `docs/watch-code/SPECS/e1-t9-pasta-removida-leva-os-arquivos.md` |

## 1. Objetivo

A E1-T8 fez a remoção de pasta deixar de virar evento. O que ficou de fora foi o
**conteúdo** dela: os arquivos que estavam dentro somem do disco junto com a pasta, e
como o watcher do core colapsa os `DELETED` dos filhos, o produto nunca fica sabendo
que eles saíram. O arquivo continua na linha do tempo como se ainda existisse — e ele
não existe mais.

A medição da execução da E1-T8, no T-0011, deixou o número registrado:

```text
ok    fase 3: a pasta removida nao vira evento — eventos da pasta=0
ok    medicao (nao reprova): fase 3, o arquivo de dentro vira evento de remocao? — eventos do arquivo=1
ok    medicao (nao reprova): fase 4, o arquivo de dentro vira evento de remocao? — eventos do arquivo=0
```

O `1` da fase 3 é o evento da **criação** do arquivo, não o da remoção: o único evento
de `src/pacote/regra.ts` no ledger é o de quando ele nasceu, e ele é o `current` do
arquivo. Na fase 4 o número é `0` porque o arquivo veio do git e a observação nunca o
leu — não há evento nenhum para fechar.

O objetivo é que a pasta removida **leve junto** os arquivos que a observação conhece sob
ela: cada um deles ganha o seu evento de remoção, na mesma sessão e no mesmo instante da
remoção da pasta, e a linha do tempo para de mostrar arquivo que já saiu do disco.

Em uma frase: **o arquivo que sumiu junto com a pasta não pode continuar "atual" na linha
do tempo só porque o watcher do core não conta que ele saiu.**

A tarefa está registrada no backlog (`overview.md` §6) e em `tasks.md`, com a E1-T8 como
dependência — já concluída.

## 2. Escopo

### Entra

1. **Fechamento dos arquivos conhecidos** — quando o gravador aceita que o caminho
   removido era pasta, ele grava um evento de remoção para cada arquivo que ele conhece
   **sob** aquela pasta (conforme o D2): `afterHash` ausente, `beforeHash` do baseline de
   sempre (git e sombra), mesma `sessionId` e mesmo `timestamp` da remoção da pasta.
2. **A lista sai do ledger** — quem sabe quais arquivos existiam sob a pasta não é a
   memória da sessão atual: é o ledger, que sobrevive ao fechar e reabrir o workspace
   (§8.11 do guia). O gravador passa a perguntar a ele (conforme o D2).
3. **A pasta continua não virando evento** — a decisão da E1-T8 fica como está; o que a
   E1-T9 acrescenta é justamente o que a E1-T8 deixou de fora.
4. **O ledger como terceira prova de pasta** — conhecer arquivos sob o caminho é prova de
   que o caminho era pasta; hoje só a memória e o git provam (conforme o D3).
5. **Testes de unidade** no módulo `changeLedger`: o arquivo conhecido que é fechado, o
   que já estava removido e não vira evento de novo, o vizinho com nome de prefixo que
   não pode ser tocado, o arquivo que a observação nunca viu, e o caso da observação que
   reabre com o ledger cheio (memória vazia).
6. **Prova no arnês** — as duas medições do T-0011 (`eventos do arquivo` nas fases 3 e 4)
   viram conferências, e o que sobrar de resíduo continua medido (conforme o D4).
7. **Registro** — `testes-manuais.md` (execução nova do T-0011, acrescentada sem apagar a
   anterior), `overview.md` (E1-T9 → feito, total de testes do módulo e resíduo) e o
   `README.md` do arnês se a descrição do cenário mudar.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Mexer no `coalesceEvents` do watcher do core para deixar de colapsar os filhos | decisão do D1; é código do VS Code usado por todo o IDE (Explorer, SCM, busca) | D1 |
| Arquivo que estava sob a pasta e a observação **nunca** leu | não há evento para fechar, e inventar um evento exigiria enumerar a árvore do `HEAD` — outro contrato e outra promessa | D2 (opção B) |
| Arquivo de pasta rastreada que o git conhece e a observação não viu | idem: é a fase 4 do T-0011, que fica medida como limitação | D2 e D4 |
| Pasta vazia e fora do git que já existia antes da observação | é o resíduo da E1-T8, e não há filho nenhum para fechar; continua medido | — |
| Pasta removida com escrita desligada | a E1-T5 diz que desligado não observa nada, e não há varredura na volta | E5 |
| Faixa de linhas, hunks e `changedLines.ts` | nada a ver com quem sumiu do disco | E3-T1 |
| Selo, decoração e filtro da linha do tempo | são da etapa E2 | E2-T6 a E2-T8 |

## 3. Contexto

### O caminho da remoção da pasta até o ledger

```text
agente apaga src/pacote/  (com regra.ts dentro)
  → @parcel/watcher reporta "delete src/pacote/regra.ts" e "delete src/pacote"
    → coalesceEvents (parcelWatcher.ts:456 → watcher.ts:438-469)
       descarta o DELETED do filho porque o pai também foi apagado
      → fileService.onDidFilesChange (só o DELETED da pasta)
        → WorkspaceWatcherService.observedFiles
          → ChangeRecorderService.recordChange (kind === 'deleted')
            → isFolder (memória → git)  ⇒ pasta, devolve undefined, nada é gravado
```

O colapso é do core, e é deliberado: o comentário do próprio código diz que o algoritmo
"remove todos os DELETE até a pasta raiz que foi apagada" para não produzir um DELETE por
arquivo dentro da pasta (`src/vs/platform/files/common/watcher.ts:442-448`). Isto é,
**o produto nunca vê os filhos**, e nenhuma informação sobre eles chega ao gravador.

### Quem sabe o que existia sob a pasta

| Fonte | Cobre | Custo | Sobrevive ao reinício |
| --- | --- | --- | --- |
| Memória do gravador (`lastEvents`, `folders`) | o que **esta** sessão leu | nenhum I/O | não |
| `readAll()` do ledger | o que o produto já registrou | lê um arquivo por evento gravado | sim |
| Índice do ledger (`indexDir`) | o que o produto já registrou, um arquivo por caminho | lê um arquivo pequeno por caminho conhecido | sim |
| Árvore do `HEAD` (`git ls-tree`) | o que o git conhece sob o caminho | uma consulta ao git, por remoção | sim |
| Sombra (`shadowStore`) | **não serve**: a sombra fica como estava quando o arquivo é removido (`changeRecorderService.ts:239-242`) | — | — |

O índice do ledger existe exatamente para responder "qual é o evento atual deste
caminho" e é derivado dos eventos (`ledgerStorage.ts:62-64`: um arquivo por caminho, com
`fileUri` e `currentEventId` dentro). É a fonte mais barata que sobrevive ao reinício.

### Peças

| Peça | Papel nesta tarefa |
| --- | --- |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | Linhas 189-191: onde a pasta removida é recusada — e onde o fechamento dos filhos tem de acontecer. Linhas 279-294: `isFolder`, que ganha a terceira prova. Linhas 296-313: `rememberFoldersAbove`, que já sabe quais pastas existem |
| `src/vs/platform/changeLedger/common/changeLedgerService.ts` | O contrato de leitura de hoje: `readAll`, `readByFile`, `readById`. Nenhum deles responde "o que existe sob esta pasta" |
| `src/vs/platform/changeLedger/common/ledgerStorage.ts` | `indexDir` e `fileIndexResource`: o índice por caminho, com `fileUri` e `currentEventId` |
| `src/vs/platform/changeLedger/common/changeEvent.ts` | O contrato do evento: `afterHash` ausente é remoção; nenhum campo novo é necessário |
| `src/vs/platform/changeLedger/common/timelineService.ts` | `withDerivedStatus` (linha 159): o último evento de cada arquivo é o `current` — é por isso que a criação do arquivo morto continua sendo exibida como atual |
| `src/vs/platform/changeLedger/common/workspaceWatcherService.ts` | Único consumidor de `recordChange`; o `undefined` já é "nada a registrar" |
| `docs/watch-code/e2e/run-manual-tests.ts` | T-0011, linhas 1930-2043: as fases 3 e 4 são as duas medições que viram conferência |

## 4. Dependências

- **E1-T8** — o `isFolder` com as duas provas, o `WorkspacePathKindReader` e o
  `GitHeadReader.readKind` vieram dela e estão prontos; a E1-T9 acrescenta a terceira
  prova conforme o D3.
- **Ledger** — `indexDir` já é escrito por `record()` a cada evento; a consulta nova do
  D2 lê o que já existe, sem migração e sem dado novo em disco.
- **Baseline** — `BaselineProvider.resolve` já responde o "antes" de um arquivo removido
  (git primeiro, sombra depois), e é o mesmo caminho que o filho fechado vai usar.
- **Arnês** `docs/watch-code/e2e` — o T-0011 já cria a pasta, o arquivo dentro dela e as
  fases com as medições prontas para virar conferência.
- Nenhum serviço novo, nenhum registro novo de instanciação, nenhuma dependência nova.

## 5. Etapas

1. **Consulta no ledger** (D2 = A) — o ledger ganha como responder o que ele conhece sob
   um caminho, com o evento atual de cada arquivo; sem contrato novo se o D2 for B.
2. **Prova adicional de pasta** (D3 = A) — o gravador consulta o ledger sob o caminho
   removido; havendo filho, o caminho era pasta, e a pasta não vira evento.
3. **Fechamento dos filhos** — aceita a pasta, o gravador percorre os arquivos conhecidos
   sob ela e registra a remoção de cada um pelo mesmo caminho público de gravação
   (`recordChange`), para herdar a fila por arquivo, o baseline, a sombra e a regra que
   já suprime a entrega repetida.
4. **Guarda contra o evento repetido** — o arquivo que já tem remoção como evento atual
   não pode ganhar uma segunda; a resposta que já existe (mesmo `afterHash`, que numa
   remoção é ausente dos dois lados) resolve, e o teste guarda isso.
5. **Testes de unidade** — `changeRecorderService.test.ts` (e o teste do ledger, se o
   contrato mudar): o arquivo conhecido fechado, o vizinho de prefixo intocado, o
   arquivo que já estava removido, o que a observação nunca viu, a remoção sem prova
   nenhuma, e a observação reaberta com a memória vazia e o ledger cheio.
6. **Arnês** — as medições das fases 3 e 4 do T-0011 viram conferências (D4 = A) e o
   resíduo que sobrar continua medido.
7. **Execução** — `npm run transpile-client`, testes do módulo, `npm run typecheck-client`,
   `npx eslint` nos arquivos tocados, `npm run valid-layers-check` e o arnês inteiro.
8. **Registro** — `testes-manuais.md`, `overview.md`, `README.md` do arnês se a
   conferência mudar, e o commit.

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| O prefixo pegar o vizinho (`src/legado` casando com `src/legado2/x.ts`) | A comparação é por pasta, com o separador: só entra o que está **sob** o caminho, e o teste do vizinho de prefixo é a guarda |
| Fechar de novo um arquivo que já tinha sido removido | A regra que já existe no `record()` (mesmo `afterHash`, ausente dos dois lados) devolve o evento anterior sem gravar; o teste guarda |
| O caminho que já foi arquivo e o ledger ainda tem filho antigo | O D3 (A) desempata pela evidência mais recente: se o evento mais novo do caminho é dele mesmo, o caminho é arquivo e a remoção é gravada como hoje |
| Uma remoção de pasta virar dezenas de eventos de uma vez | É o número de arquivos que a observação conhece sob a pasta, e cada um é uma alteração de verdade; se a medição mostrar volume em pasta grande, a E5-T3 (retenção) é o lugar de tratar |
| Eventos filhos com a mesma sessão e o mesmo instante, em ordem indefinida entre si | É o esperado: eles são um lote, e a sessão do agrupamento é a mesma; a ordem entre eles não carrega informação |
| Uma escrita nova no filho correndo com o fechamento | O fechamento passa pelo caminho público de gravação, que serializa por arquivo — a escrita que chegar depois entra na fila do mesmo arquivo |
| Consulta ao ledger ficar caro em workspace grande | O D2 = A lê o índice (um arquivo pequeno por caminho conhecido), não os eventos; o custo só é pago quando uma pasta é removida |
| Nome do caminho com caixa diferente entre o evento e o ledger (Windows) | É o mesmo pressuposto de hoje em `readByFile` e na timeline, que comparam o caminho normalizado e não a caixa; a tarefa não muda esse contrato e o risco fica registrado |
| Workspace com mais de uma pasta | O fechamento usa o `folderUri` da própria remoção, como todo o resto do gravador |
| A conferência nova reprovar por causa do tempo entre remover e ler o ledger | Reaproveita `waitForEvents` e `waitUntilQuiet`, já calibrados no T-0011 |

## 7. Decisões pendentes

### D1 — Onde o problema é resolvido

| Opção | Como fica | Custo |
| --- | --- | --- |
| **A** (recomendada) | **No produto, depois do fato**: o gravador fecha os arquivos que o ledger conhece sob a pasta removida, sem tocar no watcher | Nenhum risco para o resto do IDE; a informação vem do que o produto já registrou, e a pasta continua não virando evento |
| **B** | **No core**: `coalesceEvents` deixa de descartar os `DELETED` dos filhos quando o pai foi apagado | Mexe em código do VS Code que serve todo consumidor de watcher (Explorer, SCM, busca, extensões) e desfaz uma otimização deliberada do core; o ganho para os outros consumidores é nenhum |
| **C** | Não fazer nada: aceitar como limitação e registrar | A linha do tempo continua mostrando arquivo que já não existe, e o salto (E2-T4) cai no aviso de arquivo ausente |

Recomendo **A**. O core colapsa os filhos de propósito, e essa decisão não é do produto:
mudá-la afetaria o IDE inteiro para resolver um problema que é do produto. E o que a
E1-T9 precisa saber — quem existia sob a pasta — o produto já tem guardado; falta apenas
perguntar.

### D2 — De onde sai a lista de arquivos sob a pasta removida

| Opção | Como fica | Custo |
| --- | --- | --- |
| **A** (recomendada) | **Do ledger**: consulta nova que responde o que ele conhece sob o caminho, lendo o índice por caminho | Contrato novo no ledger (`IChangeLedgerService`); cobre o que qualquer sessão já registrou, inclusive antes de reiniciar |
| **B** | **Do `readAll()`**, filtrando no gravador: nenhum contrato novo | Lê um arquivo por evento gravado a cada remoção de pasta; funciona, mas paga o histórico inteiro por uma pergunta de pasta |
| **C** | **Só da memória do gravador** (`lastEvents`): o que esta sessão leu | Nenhum I/O e nenhum contrato novo; deixa fantasma todo arquivo que a sessão anterior registrou — e o ledger sobrevive ao fechar e reabrir o workspace (§8.11) |

Recomendo **A**. A pergunta é "o que existia sob esta pasta", e quem sabe isso é o ledger —
não a memória de uma sessão. O índice por caminho já é escrito a cada evento e responde
com um arquivo pequeno por caminho, então o custo é proporcional ao que já foi observado,
não ao histórico.

**Fora das três:** enumerar a árvore do `HEAD` (`git ls-tree`) para também fechar os
arquivos que o git conhece e a observação nunca viu. É a resposta completa para pasta
rastreada (a fase 4 do T-0011, hoje com `eventos do arquivo=0`), mas amplia a promessa —
inventa evento para arquivo que o produto nunca observou — e pede decisão própria sobre
limite e caminhos ignorados numa pasta grande. Se você quiser isso, eu registro como
tarefa nova depois desta, como foi feito com a própria E1-T9.

### D3 — O ledger conhecer filhos conta como prova de que o caminho era pasta

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | **Sim**, como terceira prova, depois da memória e antes do git: se o ledger tem arquivo sob o caminho, o caminho era pasta e ele não vira evento. Com o desempate pela evidência mais recente — se o evento mais novo do próprio caminho for dele (um arquivo que já existiu ali), o caminho é arquivo e a remoção é gravada como hoje |
| **B** | **Não**: a prova da E1-T8 fica intocada (memória e git) e a E1-T9 só fecha os filhos. Quando a pasta não for provada, ela continua virando um evento **e** os filhos são fechados — a linha do tempo mostraria a "pasta removida como arquivo" e as remoções dos filhos, uma contradição |

Recomendo **A**. Sem ela, o caso mais comum de todos — abrir o app hoje e apagar uma pasta
que a observação registrou ontem, sem git e sem memória — produz uma linha fantasma para a
pasta junto das remoções dos filhos. O conhecimento do ledger é da mesma natureza das
outras duas provas: ele só existe se um arquivo sob aquele caminho já foi lido, e arquivo
não tem filho. O desempate pela evidência mais recente é o que impede que um registro
antigo do filho engula a remoção de um arquivo de verdade que nasceu no lugar da pasta.

### D4 — Como provar no arnês

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | As duas medições viram **conferências**: na fase 3, `eventos do arquivo` tem de ser 2 (criação + remoção) e o último evento do arquivo tem de ser a remoção, sem `afterHash`; na fase 4 continua `0` e vira **medição do que não foi feito** (a pasta rastreada cuja observação nunca leu arquivo nenhum), junto do `pasta vazia=1` |
| **B** | Além disso, uma fase que **fecha e reabre o app** sobre o mesmo perfil para provar o caso da sessão anterior de ponta a ponta | Exige um ajudante novo no arnês (hoje `openSession` apaga o perfil do cenário, linha 1112) e soma minutos à execução; o caso já é coberto por teste de unidade (dois gravadores sobre o mesmo ledger) |

Recomendo **A**. As duas medições já existem e já estão no lugar certo; transformá-las em
conferência não custa quase nada e é o que fecha o ciclo — foi esse desenho que, na E1-T8,
transformou uma medição incômoda em tarefa com nome. O reinício do app fica coberto pelo
teste de unidade, que reproduz a mesma coisa sem abrir janela.

## 8. Critérios de aceite

1. Apagar, com a observação ligada, uma pasta que contém arquivo conhecido pela observação
   grava um evento de remoção para **cada** arquivo conhecido sob ela: `afterHash`
   ausente, `beforeHash` do baseline de sempre, mesma `sessionId` e mesmo `timestamp` da
   remoção da pasta.
2. O caminho da pasta removida continua **não** virando evento (E1-T8 preservada).
3. O arquivo que já tinha remoção como evento atual **não** ganha uma segunda.
4. O vizinho cujo caminho começa com o mesmo texto (`src/legado` × `src/legado2`) não é
   tocado.
5. O arquivo que a observação **nunca** viu sob a pasta não vira evento — nada é
   inventado.
6. O arquivo conhecido por uma sessão anterior (memória vazia, ledger cheio) é fechado
   igual.
7. Sem prova nenhuma de que o caminho era pasta (memória, git e ledger silenciosos), a
   remoção continua sendo gravada como era antes da E1-T8.
8. Depois da remoção da pasta, a linha do tempo não mostra nenhum arquivo sob ela como
   atual.
9. Os testes de unidade do módulo `changeLedger` passam com o total novo, e os testes de
   `git` seguem verdes.
10. No arnês, as fases 3 e 4 do T-0011 viram conferências (D4 = A) e o T-0011 fica verde; o
    que sobrar de resíduo aparece medido na saída do cenário.
11. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e
    `npm run valid-layers-check` sem erro.
12. `testes-manuais.md` com o T-0011 executado de verdade depois da correção,
    acrescentando a execução nova sem apagar a anterior.
13. `overview.md` com a E1-T9 em `feito`, o total de testes do módulo atualizado e o
    resíduo registrado.
14. A SPEC registra as divergências entre o que este plano previu e o que a implementação
    exigiu.
15. Nenhum arquivo fora do escopo da tarefa foi tocado.
