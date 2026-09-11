# Plano — E1-T8 · Remoção de pasta não é alteração

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T8 — Remoção de pasta não é alteração |
| Workflow | High (mexe no comportamento do recorder e no baseline do git) |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Linha E1-T8 do backlog (`overview.md` §6) e a medição feita no T-0011 durante a E1-T7 |
| Saída | Este plano → `docs/watch-code/SPECS/e1-t8-remocao-de-pasta-nao-e-alteracao.md` |

## 1. Objetivo

A E1-T7 fez a pasta que **chega** ao watcher deixar de ser tratada como alteração: o
`readChange` dela devolve `undefined` e nada é gravado. Quando a pasta é **apagada**, a
regra não alcança — numa remoção nada é lido, então não há veredito nenhum — e o ledger
recebe um evento para o caminho da pasta. A medição do D2 da E1-T7, no T-0011, deixou o
número registrado:

```text
medicao (nao reprova): a pasta removida vira evento? — pasta=1 arquivo=1
```

O objetivo é que a remoção de uma pasta deixe de virar evento no ledger, do mesmo jeito
que a criação dela já não vira.

Em uma frase: **o caminho que já não existe no disco não pode ser gravado como arquivo
só porque não há mais a quem perguntar.**

A tarefa está registrada no backlog (`overview.md` §6) e em `tasks.md`, com a E1-T7 como
dependência — já concluída.

## 2. Escopo

### Entra

1. **Decisão da remoção no recorder** — reconhecer que o caminho removido não é arquivo
   e devolver `undefined`, **sem tocar no ledger, na sombra e em `lastEvents`**, como a
   E1-T7 já faz para a criação (mecanismo conforme o D1).
2. **Prova de pasta acumulada durante a observação** — o que o recorder já sabe ser pasta
   (o veredito `FILE_IS_DIRECTORY` da E1-T7 e os ancestrais de todo arquivo lido) passa a
   ser lembrado e consultado na remoção.
3. **Resposta do git para o tipo do caminho no `HEAD`** — só se o D1 for **C**: quando a
   observação não sabe o tipo, o git responde se o caminho no `HEAD` é arquivo ou pasta.
4. **Vestígio no log** — a remoção ignorada fica no `trace` do watcher, no mesmo formato
   da E1-T7 (`[watchCode] ignored non-file change: <caminho>`), e nenhum erro é escrito.
5. **Testes de unidade** no módulo `changeLedger`: a pasta removida que não vira evento,
   o arquivo removido que continua virando, a remoção repetida que continua suprimida e
   o caso do arquivo que nasce no caminho de uma pasta removida.
6. **Prova no arnês** — a fase 3 do T-0011 deixa de ser medição e passa a **reprovar** se
   a pasta removida virar evento; o resíduo que sobrar é medido e registrado.
7. **Registro** — `testes-manuais.md` (T-0011 com a execução nova, acrescentada),
   `overview.md` (E1-T8 → feito) e, se a conferência mudar, o `README.md` do arnês.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Varredura do workspace ao ligar a observação para conhecer as pastas | contraria a decisão da E1-T5 (`start()` não varre nada) e custa caro em repositório grande; ver D1 | — |
| Pasta que já existia antes da observação, sem filho observado e fora do git | é o resíduo do D1; se sobrar, é medido no arnês e registrado no guia com o número | D1 e D3 |
| `git show` devolvendo árvore como se fosse conteúdo | é defeito irmão, no baseline do git (E1-T3); sob o D1 = C ele fica inalcançável pelo recorder, e o conserto é defesa em profundidade | D2 |
| Limpar o evento de pasta já gravado em ledger existente | o ledger é append-only; o que está gravado fica | — |
| Faixa de linhas, hunks e `changedLines.ts` | nada a ver com o caminho que não é arquivo | E3-T1 |
| Selo, decoração e filtro da linha do tempo | são da etapa E2 | E2-T6 a E2-T8 |

## 3. Contexto

### O caminho da remoção até o ledger

```text
fileService.onDidFilesChange (DELETED)
  → WorkspaceWatcherService.observedFiles   (KIND_PRIORITY: 'deleted' vence 'added' e 'updated')
    → WorkspaceWatcherService.record        (agrupa, chama o recorder, loga o que voltar)
      → ChangeRecorderService.recordChange  (fila por arquivo)
        → ChangeRecorderService.record      (kind === 'deleted' → não lê o disco)
          → baselineProvider.resolve → ledger.record → (sem sombra, sem conteúdo)
```

| Peça | Papel nesta tarefa |
| --- | --- |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | Linha 142: na remoção o conteúdo nasce `undefined` sem leitura nenhuma. Linha 146: a saída "não é arquivo" só vale para quem não é remoção — **é aqui que a pasta removida passa**. Linhas 207-219: o veredito `FILE_IS_DIRECTORY` que a E1-T7 usa e que esta tarefa passa a memorizar |
| `src/vs/platform/changeLedger/common/workspaceWatcherService.ts` | Linhas 146-164: o único consumidor de `recordChange`; o `undefined` já é tratado como "nada a registrar" |
| `src/vs/platform/changeLedger/common/baseline.ts` | `BaselineProvider.resolve` — git primeiro, sombra depois, ausência honesta |
| `src/vs/workbench/services/changeLedger/electron-browser/gitHeadReader.ts` | Linha 41: `localGitService.show(rootPath, filePath)` — o único consumidor de `show` em todo o `src/vs` |
| `src/vs/platform/git/node/localGitService.ts` | Linha 166: `show` roda `git show HEAD:<caminho>` |
| `docs/watch-code/e2e/run-manual-tests.ts` | Linhas 1966-1977: a fase 3 do T-0011, hoje uma medição que nunca reprova |

### Por que a remoção escapa, em três linhas

A regra da E1-T7 é *"sem conteúdo e sem remoção, o caminho não é um arquivo"*
(`changeRecorderService.ts:146`). A condição `change.kind !== 'deleted'` existe porque
numa remoção **não há o que ler** — o `afterHash` do evento é a ausência, e ela é
legítima. O efeito colateral é que a única prova de tipo que o produto tinha (a leitura)
deixa de existir justo no caso em que a pasta não pode ser distinguida de um arquivo.

### O que se sabe — e o que não se sabe — de um caminho que já não existe

Verificado nesta investigação: **não existe consulta pós-morte**. Depois que o caminho
some, `readFile`, `stat` e `resolve` respondem a mesma coisa para arquivo e pasta
(`FILE_NOT_FOUND`), e o evento do watcher não carrega tipo: `IFileChange` tem
`resource` e `type`, e o backend do disco (`@parcel/watcher`) só distingue
`create`/`update`/`delete` (`parcelWatcher.ts:143-147`). **O tipo tem de vir de memória,
do git, ou do próprio lote.** São as três fontes consideradas no D1:

| Fonte | Cobre | Custo |
| --- | --- | --- |
| **Memória do recorder** — o que já se provou ser pasta | pasta criada durante a observação e pasta que tem filho lido | nenhum I/O; um `Set` no recorder |
| **Git** — `HEAD:<caminho>` é árvore? | pasta que já existia e é rastreada | uma consulta ao git por remoção desconhecida |
| **Lote** — o caminho tem filho removido junto? | pasta que perdeu os filhos na mesma remoção | nenhum; porém depende da entrega dos filhos no mesmo lote, que o watcher não promete |

### Segunda face do mesmo defeito: o git devolve árvore como se fosse conteúdo

Conferido no próprio repositório do projeto:

```text
$ git show HEAD:src/vs/platform/changeLedger
tree HEAD:src/vs/platform/changeLedger

common/
test/
$ echo $LASTEXITCODE
0
$ git cat-file -t HEAD:src/vs/platform/changeLedger
tree
```

Ou seja: para um caminho de **pasta rastreada**, `git show` sai com código 0 e imprime a
listagem da árvore. Como `GitHeadReader.readFromHead` devolve isso como se fosse conteúdo
(`gitHeadReader.ts:41-43`), a remoção de uma pasta rastreada não só vira evento como vira
evento **com um "antes" falso** — o hash da listagem da árvore. É a mesma pergunta desta
tarefa (*este caminho é arquivo?*) feita ao git; a resposta existe e é estável
(`git cat-file -t` responde `blob` para arquivo, `tree` para pasta e erro para caminho
inexistente — os três conferidos acima).

## 4. Dependências

- **E1-T7** — o contrato `Promise<ChangeEvent | undefined>`, o `trace` no watcher e a
  varredura do log no arnês vieram dela e estão prontos.
- `FileOperationResult.FILE_IS_DIRECTORY` e `toFileOperationResult()` — já importados
  pelo recorder desde a E1-T7.
- `ILocalGitService` e `GitHeadReader` — só se o D1 for C; o `show` já é usado pelo
  baseline e tem **um consumidor** em todo o `src/vs`.
- Arnês `docs/watch-code/e2e` — `run-manual-tests.ts` já tem o cenário T-0011 com a
  fase 3 pronta para virar conferência.
- Nenhum serviço novo, nenhum registro novo de instanciação, nenhuma dependência nova.

## 5. Etapas

1. **Memória de tipos no recorder** — guardar os caminhos provados pasta (veredito da
   leitura) e os ancestrais de todo arquivo lido; um arquivo lido no mesmo caminho
   **desfaz** a marca de pasta.
2. **Decisão da remoção** — no `record()`, antes de tocar no ledger: remoção de caminho
   conhecido como pasta devolve `undefined`; o resto segue como hoje (conforme o D1).
3. **Resposta do git** (D1 = C) — o leitor do git ganha como responder o tipo do caminho
   no `HEAD`, e o recorder consulta isso só quando a memória não sabe.
4. **Endurecimento do `show`** (D2 = A) — `git show HEAD:` passa a pedir só `blob`, para
   nunca devolver árvore como conteúdo, com teste.
5. **Watcher** — nada muda no comportamento: o `undefined` já é "nada a registrar" com
   `trace`. Conferir que a remoção ignorada não escreve erro nem aviso.
6. **Testes de unidade** — `changeRecorderService.test.ts`: pasta criada e removida na
   mesma observação não vira evento e não mexe no ledger; arquivo removido continua
   virando; pasta removida e arquivo nascendo no mesmo caminho depois vira evento; a
   remoção repetida continua devolvendo o mesmo evento; sem memória e sem git (ou com o
   git respondendo `blob`/erro) nada muda em relação a hoje.
7. **Arnês** — a fase 3 do T-0011 vira conferência que reprova; a fase 4 mede o resíduo
   (conforme o D3).
8. **Execução** — `npm run transpile-client`, testes do módulo, `npm run typecheck-client`,
   `npx eslint` nos arquivos tocados, `npm run valid-layers-check` e o arnês inteiro.
9. **Registro** — `testes-manuais.md`, `overview.md`, `README.md` do arnês se a conferência
   mudar, e o commit.

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| Engolir a remoção de um arquivo de verdade | A marca de pasta só nasce de prova (veredito da leitura ou ancestral de arquivo lido); arquivo lido no caminho apaga a marca. Teste do arquivo que nasce no lugar da pasta removida guarda isso |
| Perder a supressão da remoção repetida | A saída acontece **antes** de `lastEvents`/`shadowStore`; o teste `a remoção repetida não vira um segundo evento` é a guarda |
| A memória crescer sem limite numa sessão longa | São caminhos provados pasta: nascem de pasta criada e de pastas ancestrais de arquivo lido — alguns por pasta do workspace, e a marca some quando o caminho vira arquivo. Reavaliar na E5-T3 (retenção) se a medição mostrar crescimento |
| A memória sobreviver errada ao desligar e religar a observação | Decisão local: a memória vive com o serviço e é limpa quando a observação para, para não usar prova de um estado que já mudou |
| Consulta ao git na remoção de todo arquivo desconhecido (D1 = C) | Só quando a memória não sabe — o caminho comum (arquivo criado e apagado na sessão, ou pasta criada na sessão) não paga nada; e o `show` do baseline já paga uma consulta por alteração gravada |
| A resposta do git usar o caminho relativo à pasta do workspace como se fosse a raiz do repositório | É o mesmo pressuposto do `GitHeadReader` hoje (linha 40-41), provado na E1-T6; a tarefa não muda esse contrato, e o teste do leitor cobre o que ele devolve para pasta, arquivo e caminho inexistente |
| A conferência nova reprovar por ruído do próprio app | A varredura transversal da E1-T7 já exige o prefixo `[watchCode]` depois do nível; a conferência da fase 3 olha o ledger, não o log |
| A fase 3 ficar instável por causa do tempo entre remover e ler o ledger | Reaproveita `waitUntilQuiet` e as constantes de pausa já calibradas no T-0011 |

## 7. Decisões pendentes

### D1 — Como o recorder reconhece que a remoção é de uma pasta

| Opção | Como fica | Custo |
| --- | --- | --- |
| **A** | **Memória**: o recorder lembra os caminhos provados pasta (o veredito `FILE_IS_DIRECTORY` da E1-T7 e os ancestrais de todo arquivo lido) e ignora a remoção deles | Nenhum I/O. Corrige a pasta criada durante a observação (o caso medido) e a que tem filho lido; **não** corrige a pasta que já existia e nunca teve filho lido |
| **B** | **Remoção sem nenhum lado conhecido não é alteração**: só grava remoção quando existe "antes" (git ou sombra) | Corrige **toda** pasta, sem memória nenhuma. Custa a remoção do arquivo que o produto nunca viu e o git não conhece: hoje isso é fixado pelo teste `a remoção de um arquivo que nunca existiu não rejeita` (linha 327), que passaria a esperar `undefined`, e a linha "o agente apagou X" some da timeline |
| **C** (recomendada) | **A + o git como segunda prova**: quando a memória não sabe, o git responde se o caminho no `HEAD` é `blob` ou `tree`; `tree` é pasta e não vira evento, `blob` grava, erro grava como hoje | Uma consulta ao git por remoção desconhecida e um contrato pequeno no leitor do git. Nunca engole arquivo: sem prova, grava |

Recomendo **C**. Ela responde ao mesmo princípio da E1-T7: **prova, não heurística** — só
deixa de gravar quem foi provado pasta, e quem não foi continua sendo gravado como hoje.
A memória cobre de graça o caso medido (a pasta criada durante a sessão) e o git cobre o
caso que a memória não alcança (a pasta que já existia e é rastreada), que é o mais comum.
As duas provas são de natureza diferente — uma é o veredito do serviço de arquivos, a
outra é o próprio git dizendo que aquele caminho é uma árvore — e nenhuma das duas pode
apontar "pasta" para um arquivo.
Se você preferir o mínimo de máquina, a **A** já corrige o caso medido e mantém a dívida
pequena e explícita; a **B** é a única que promete cobertura total, e eu não a
recomendo porque paga com informação legítima (a remoção de um arquivo não rastreado) um
caso que a A + git resolvem sem perder nada.

### D2 — O `git show` que devolve árvore para pasta rastreada

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | Incluir aqui: `show` passa a pedir só `blob` (`git cat-file blob HEAD:<caminho>`), com teste no serviço do git. Uma palavra, e a classe de defeito "pasta tratada como arquivo" fecha também no baseline |
| **B** | Registrar tarefa própria e deixar como está: sob o D1 = C o caminho fica **inalcançável** pelo recorder (pasta rastreada é ignorada antes do baseline), mas o defeito continua no código |

Recomendo **A**: é uma linha, o `show` tem um consumidor só em todo o `src/vs`, e a
resposta à pergunta "este caminho é arquivo?" já vai ser dada ao git nesta tarefa. Sem
ela, o produto guarda um "antes" feito da listagem de uma árvore em qualquer caminho que
chegue ao baseline sem passar pela memória.

### D3 — Como provar no arnês

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | A fase 3 do T-0011 vira **conferência** (a pasta removida não pode virar evento — hoje ela reprovaria) e uma **fase 4 mede o resíduo**: a pasta que já existia quando a observação começou, apagada com arquivo dentro, imprime quantos eventos virou. O número vai para o guia, e o que sobrar vira registro |
| **B** | Só a conferência da fase 3, sem medir resíduo |

Recomendo **A**, no mesmo desenho que funcionou na E1-T7: a conferência protege o que foi
corrigido e a medição diz, com número, o que **não** foi — é o que transformou um erro no
log em uma tarefa com nome. A fase 4 custa poucas linhas e reaproveita os ajudantes do
cenário.

## 8. Critérios de aceite

1. A remoção de uma pasta criada durante a observação **não** grava evento e não mexe no
   ledger, nem em snapshots.
2. A remoção de um arquivo continua sendo gravada, com o "antes" da sombra quando existe.
3. A remoção de um arquivo que o produto nunca viu continua sendo gravada como hoje.
4. A pasta provada pasta não deixa marca em `lastEvents`: um arquivo que nasça no mesmo
   caminho depois vira evento normalmente.
5. A remoção repetida continua devolvendo o mesmo evento, sem um segundo registro.
6. No watcher, remover uma pasta não escreve nem erro nem aviso no log — só o `trace`.
7. A varredura transversal da E1-T7 continua verde em todos os cenários.
8. A fase 3 do T-0011 passa de medição a conferência e fica **verde**; o resíduo, se
   houver, aparece medido na saída do cenário.
9. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e
   `npm run valid-layers-check` sem erro; os testes do módulo com o total novo.
10. `testes-manuais.md` com o T-0011 executado de verdade depois da correção, acrescentando
    a execução nova sem apagar a anterior.
11. `overview.md` com a E1-T8 em `feito`, o total de testes do módulo atualizado e o
    resíduo registrado (se o D1 = A ou C e a fase 4 achar algum).
12. A SPEC registra as divergências entre o que este plano previu e o que a implementação
    exigiu.
13. Nenhum arquivo fora do escopo da tarefa foi tocado.
