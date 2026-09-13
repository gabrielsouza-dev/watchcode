# Plano — E3-T1 · Cálculo de diff

**Tarefa:** E3-T1 — Cálculo de diff (`docs/watch-code/Workflow/overview.md:396`)
**Workflow:** High (implementação: contrato de diff novo e troca do produtor que já está no ar)
**Depende de:** E2-T5 (feito) — e, pela cadeia, E2-T4 (decisão D9), E2-T1 e E1-T2

## 1. Objetivo

Calcular o diff de verdade entre os dois snapshots de um evento — hunks, faixas e contagem de
linhas — e fazer o gravador usar esse cálculo no lugar do produtor provisório da E2-T4.

## 2. Escopo

**Dentro:**

1. Um módulo **puro** de diff de linhas: dois conteúdos entram, hunks e contagens saem.
2. A derivação das faixas do arquivo **depois** a partir dos hunks — é o que o campo
   `linesChanged` do evento guarda hoje.
3. A troca do gravador para o módulo novo, sem mudar o contrato do evento.
4. A remoção de `changeLedger/common/changedLines.ts` e do teste dele, no mesmo movimento
   — o guia manda que os dois não convivam.
5. Testes de unidade do módulo novo, cobrindo o que o antigo cobria **e** o que só o diff
   por hunks responde: alterações distantes em faixas separadas e a contagem de linhas.
6. Teste manual T-0015 no arnês: duas alterações distantes no mesmo arquivo aparecem como
   duas faixas na linha do tempo, e o salto cai na primeira.

**Fora:**

1. Documentos virtuais `aih-before:`/`aih-after:` (E3-T2), decorações (E3-T3) e modos de
   visualização (E3-T4). Esta tarefa **produz o cálculo**, não o mostra.
2. Diff por caractere (intralinha), diff de três vias, renomeação e movimentação de bloco
   detectada como "movido": o produto promete linha, não palavra.
3. Guardar o diff no ledger. O evento continua guardando **faixas**, não hunks (D2).
4. Qualquer mudança no formato do `.aih`, no schema do ledger ou na configuração.
5. Índice, poda de snapshots e desempenho de leitura (E5).

## 3. Contexto

| Fato conferido | Onde |
| --- | --- |
| O produtor de hoje é declarado provisório pelo próprio código: "não separa hunks, não conta linhas removidas e não conhece deslocamento de bloco, o que a E3-T1 faz" | `src/vs/platform/changeLedger/common/changedLines.ts:12-20` |
| O guia manda o arquivo **sair** quando os hunks entrarem, "sem os dois conviverem" | `docs/watch-code/Workflow/overview.md:396` |
| A decisão D9 da E2-T4 já fixou o alvo: "A E3-T1 troca por hunks no mesmo campo, sem mudar contrato" | `docs/watch-code/PLANS/e2-t4-salto-ao-local.md:270` |
| O campo é `ChangeLineRange[]` (1-based, inclusivo), e o comentário do contrato já diz que "o diff é recalculado de qualquer forma" | `src/vs/platform/changeLedger/common/changeEvent.ts:24-25` e `:61-62` |
| O gravador mede a faixa **na hora da escrita**, com os dois conteúdos na mão, para que o salto e a lista não voltem aos snapshots | `src/vs/platform/changeLedger/common/changeRecorderService.ts:252-267` |
| O salto lê a **primeira** faixa, e o comentário já reserva as outras para a E3 | `src/vs/workbench/contrib/watchCode/common/changeReveal.ts:34-35` |
| A lista já sabe escrever várias faixas: `'12', '12-14' ou '12-14, 20, 30-31'` — e o texto entra no detalhe da linha e no tooltip | `src/vs/workbench/contrib/watchCode/common/timelineRows.ts:67-74` e `browser/timelineView.ts:74` e `:81-82` |
| Existe um diff de linhas pronto na camada mais baixa, com a mesma forma de "mudança" que o produto precisa | `src/vs/base/common/diff/diff.ts:231` (`LcsDiff`), `:327` (`ComputeDiff`) e `:33-57` (`IDiffChange`) |
| A camada de plataforma pode usar a base — e o editor já faz exatamente essa adaptação "sequência de linhas" | `src/vs/editor/common/diff/legacyLinesDiffComputer.ts:19-26` |
| Os snapshots já estão no disco: o "antes" entra no store na hora do evento, justo para o diff ter de onde ler | `changeRecorderService.ts:244-250` e `common/snapshotStore.ts:48-61` |
| O que o produto mostra hoje da faixa: o detalhe da linha e o tooltip "Lines {0}" | `timelineView.ts:74` e `:81-82` |

**Fluxo de dados:** disco → watcher → gravador (`readFile` + baseline) → **cálculo de diff** →
evento com `linesChanged` → lista do produto (texto e tooltip) e salto (`planReveal`).
O cálculo acontece uma vez, no gravador, e o resultado derivado (as faixas) viaja no evento;
os hunks completos são recalculados por quem precisar deles (E3-T2/T3), a partir dos mesmos
snapshots.

## 4. Dependências

- Snapshots antes/depois no store endereçado por hash — E1-T2.
- `ChangeEvent.linesChanged` e `ChangeLineRange` — E1-T1.
- O gravador e o ponto onde a faixa é medida — E2-T4 (D9).
- Consumidores que não podem regredir: a lista (E2-T3), o salto (E2-T4, manuais T-0008/T-0009),
  o selo de visto (E2-T6/T-0012), o T-0010 e o T-0014.
- `LcsDiff` da base — não é dependência nova de produto, é utilitário do próprio editor.

## 5. Etapas

1. **O módulo de diff.** Em `src/vs/platform/changeLedger/common/`, uma função pura que
   recebe os dois conteúdos (`VSBuffer | undefined`) e devolve os hunks, os totais de linhas
   somadas e removidas e a marca de "diff grosso" (D7). Sem serviço, sem disco, sem estado.
2. **A derivação das faixas.** Do diff para `ChangeLineRange[]` no arquivo **depois**,
   preservando o que a E2-T4 promete: remoção pura aponta a linha onde o trecho saiu, arquivo
   esvaziado não tem faixa, remoção do arquivo não tem faixa.
3. **A troca do gravador.** `changeRecorderService` passa a chamar o módulo novo; a guarda de
   "sem antes não há o que comparar, a não ser arquivo novo" continua igual.
4. **A remoção do provisório.** `changedLines.ts` e `changedLines.test.ts` saem no mesmo
   commit em que os testes novos entram.
5. **Testes de unidade.** Os casos do antigo viram casos do novo (mesmo comportamento
   observável) mais: duas alterações distantes → **dois hunks**, alteração de bloco com
   deslocamento, contagem de linhas somadas e removidas, arquivo novo inteiro como um hunk,
   remoção de tudo, e o corte do diff grosso.
6. **Teste manual T-0015.** Cenário novo no arnês: arquivo com base no `HEAD`, duas
   alterações distantes escritas de fora, conferência de que a linha do tempo mostra as duas
   faixas (texto e tooltip) e de que o clique cai na **primeira**; registro em
   `docs/watch-code/testes-manuais.md` e linha nova no `docs/watch-code/e2e/README.md`.
7. **Validação.** `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check`,
   `test-node` dos dois módulos e `hygiene`; depois o arnês inteiro, que é onde o T-0008,
   o T-0010 e o T-0014 provam que o salto não regrediu.
8. **Guia.** Status da E3-T1 no `overview.md`, com os números medidos.

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| O diff por linhas é **mais caro** que a comparação de pontas de hoje: uma reescrita grande vira trabalho de segundos **dentro do caminho de observação**, travando a janela | Um corte por tamanho, decidido antes de calcular, e um resultado único e grosso acima dele (D7); o corte é determinístico, não depende da carga da máquina |
| Regressão no salto — é o consumidor mais sensível, e o T-0008/T-0010/T-0014 são a prova | As faixas derivadas preservam o comportamento observável caso a caso, com teste de unidade para cada um deles; o arnês inteiro roda antes do commit |
| O campo `linesChanged` passa a ter **várias** faixas na prática (hoje tem no máximo uma) | O contrato já é uma lista e a formatação já trata vários intervalos; a conferência fica no teste manual |
| O store pode não ter o "antes" (evento parcial) ou o arquivo pode ter sido removido | Os dois casos são de primeira classe no módulo: `undefined` é conteúdo vazio, não erro |
| Fim de linha do Windows e quebra final mudando sozinhas não podem virar alteração | A normalização de hoje (CRLF e quebra final) é preservada e testada |
| Apagar `changedLines.ts` deixa o `out/` velho apontando para um módulo que não existe mais | `transpile-client` antes de qualquer teste ou execução do app |

## 7. Decisões tomadas (autônomas, reversíveis)

| # | Questão | Decisão | Por quê |
| --- | --- | --- | --- |
| **D1** | Escrever um algoritmo de diff ou usar o que já existe? | **Usar o `LcsDiff` da base** (`vs/base/common/diff/diff.ts`) sobre uma sequência de linhas, como o próprio editor faz | É o algoritmo do VS Code, na camada mais baixa, e a plataforma pode usá-lo. Escrever um Myers próprio seria duplicar código testado em batalha por nenhum ganho |
| **D2** | O evento passa a guardar hunks? | **Não.** O campo continua `ChangeLineRange[]`; só o produtor muda | Já decidido na D9 da E2-T4 ("sem mudar contrato"). Guardar hunks ampliaria o schema do ledger — e o contrato diz que "o diff é recalculado de qualquer forma" |
| **D3** | O provisório fica até a E3-T3? | **Sai agora**, com o teste dele | Ordem explícita do guia: "sem os dois conviverem" |
| **D4** | Qual a faixa de uma **remoção pura** (o trecho saiu, o arquivo continua)? | A linha onde o trecho saiu, no arquivo depois | É o comportamento que o T-0008 e o T-0010 já provam; mudar seria regressão sem pedido |
| **D5** | E quando o arquivo fica **vazio** ou é removido? | Sem faixa (`undefined`) | Não há linha para apontar depois; é o que o produto faz hoje |
| **D6** | O módulo conhece snapshot store, serviço ou configuração? | **Não**: recebe dois conteúdos e devolve o diff | Mantém o cálculo testável sem sistema de arquivos, que é o padrão dos módulos `common` do produto |
| **D7** | E se o arquivo for enorme? | Acima de um limite de linhas, o cálculo **não** roda o diff fino: devolve **um hunk** cobrindo o bloco alterado (o mesmo que o provisório devolvia) e marca o resultado como grosso | O diff fino é O(ND): sem corte, uma reescrita grande trava a observação. O corte é por tamanho, não por tempo, para o mesmo arquivo dar sempre o mesmo resultado. O limite vai na SPEC |
| **D8** | O que fazer quando o próprio `LcsDiff` desiste no meio (memória)? | Repassar a marca de "grosso" ao chamador, em vez de fingir que o diff está completo | O algoritmo tem corte interno (`quitEarly`); escondê-lo faria o produto exibir faixa errada como se fosse exata |

## 8. Critérios de aceite

1. `changedLines.ts` e o teste dele **não existem mais** no repositório.
2. Existe um módulo puro que devolve hunks com o lado "antes" e o lado "depois", os totais de
   linhas somadas e removidas, e a marca de diff grosso — tudo coberto por teste de unidade.
3. Duas alterações distantes no mesmo arquivo produzem **dois hunks** e **duas faixas** no
   evento; o salto continua caindo na primeira.
4. O comportamento da E2-T4 está preservado: remoção pura, arquivo esvaziado, remoção do
   arquivo, arquivo novo, CRLF e quebra final.
5. O contrato do evento não mudou: nenhum campo novo, nenhum schema novo, nenhuma
   configuração nova.
6. `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` verdes.
7. `test-node` verde nos dois módulos, com a contagem medida e registrada.
8. O arnês inteiro verde — em especial T-0008, T-0010 e T-0014, que provam o salto e a lista.
9. O teste manual T-0015 registrado em `docs/watch-code/testes-manuais.md` com resultado
   obtido e situação, e presente no `run-manual-tests.ts`.
10. O guia (`overview.md`) atualizado com o status da E3-T1 e os números medidos.
