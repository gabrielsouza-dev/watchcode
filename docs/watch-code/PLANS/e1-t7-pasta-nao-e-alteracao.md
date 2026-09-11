# Plano — E1-T7 · Pasta não é alteração

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T7 — Pasta não é alteração |
| Workflow | High (muda contrato) |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E1 (`overview.md` §6) e o defeito 3 da `SPECS/e1-t6-fechamento-da-e1.md` |
| Saída | Este plano → `docs/watch-code/SPECS/e1-t7-pasta-nao-e-alteracao.md` |

## 1. Objetivo

Quando nasce uma pasta nova dentro do workspace, o watcher avisa — e o produto
tenta ler a pasta como se fosse arquivo. A leitura falha, o watcher transforma a
falha em erro no log, e o produto escreve **erro onde não houve erro**:

```text
2026-09-11 15:56:08.284 [error] [watchCode] failed to record src
  Unable to read file '...\watchcode-manual\t-0010\workspace\src'
  (Error: ... that is actually a directory)
```

O ledger fica **correto** — nenhum evento entra —, mas a linha acima é lixo no log
de quem abrir a IDE. O objetivo é que a pasta deixe de ser tratada como alteração:
`recordChange` passa a devolver `Promise<ChangeEvent | undefined>`, e `undefined`
quer dizer **"o caminho não é um arquivo; nada foi registrado"**.

Em uma frase: **o caminho que não é arquivo deixa de ser erro e passa a ser
silêncio.**

A decisão de contrato já foi aprovada pelo usuário em 11/09/2026 e está registrada
na linha da E1-T7 do backlog e em `tasks.md`.

## 2. Escopo

### Entra

1. **Contrato** — `IChangeRecorderService.recordChange` devolve
   `Promise<ChangeEvent | undefined>`, com o significado do `undefined` documentado
   na própria interface.
2. **Recorder** — reconhecer o caminho que não é arquivo e devolver `undefined`
   **sem tocar no ledger, na sombra e no mapa de escrita repetida**.
3. **Watcher** — tratar `undefined` como "nada a registrar": não é erro.
4. **Testes de unidade** no módulo `changeLedger`: o caso da pasta no recorder e o
   caso da pasta nova com arquivo dentro no watcher, com o log conferido.
5. **Prova no arnês** — a execução passa a varrer o log do perfil e a reprovar se o
   `[watchCode]` escrever erro; e um cenário novo confere a pasta nova no ledger.
6. **Registro** — `testes-manuais.md`, `overview.md` (E1-T7 → feito) e o `README.md`
   do arnês.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Corrigir a **remoção** de pasta | quando a remoção chega, o caminho já não existe e não há como perguntar o tipo a ninguém; ver D2 | D2 decide se medimos agora |
| Outras falhas de leitura (arquivo que sumiu, permissão negada) | continuam rejeitando: são erro de verdade, e há teste que exige isso | — |
| Limpar evento de pasta já gravado | a pasta nunca virou evento; não há o que limpar | — |
| Faixa de linhas, hunks e `changedLines.ts` | nada a ver com o caminho que não é arquivo | E3-T1 |
| O hook do agente chamando `recordChange` | ainda não existe; o watcher é o único consumidor | E6 |
| Selo, decoração e filtro da linha do tempo | são da etapa E2 | E2-T6 a E2-T8 |

## 3. Contexto

### O caminho da alteração até o ledger

```text
fileService.onDidFilesChange
  → WorkspaceWatcherService.onFilesChange   (agrupa por pausa, resolve a pasta dona)
    → WorkspaceWatcherService.record        (chama o recorder e loga a falha)
      → ChangeRecorderService.recordChange  (fila por arquivo, supressão de repetida)
        → readFile → baseline → ledger.record → shadowStore
```

| Peça | Papel nesta tarefa |
| --- | --- |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | O contrato e a leitura. É aqui que a pasta vira `undefined` |
| `src/vs/platform/changeLedger/common/workspaceWatcherService.ts` | Linha 149: o único consumidor de `recordChange`; linha 156: o `catch` que virou o erro do log |
| `src/vs/platform/files/common/fileService.ts` | Linha 742: o `stat` que já sabe que é pasta; linha 675: o outro caminho de erro, que chega ao mesmo código |
| `src/vs/platform/files/common/files.ts` | `FileOperationResult`, `FileSystemProviderErrorCode` e `toFileOperationResult()` |
| `docs/watch-code/e2e/harness.ts` | `newestLogDir()` e `logTail()` já leem o log do perfil; falta a varredura |
| `docs/watch-code/e2e/run-manual-tests.ts` | Onde os cenários vivem (T-0001 … T-0010) |

### Por que a leitura falha, e por que isso não é um erro

O `FileService.readFile` consulta o `stat` do recurso antes de ler e, quando o
recurso é pasta, lança
`FileOperationError(..., FileOperationResult.FILE_IS_DIRECTORY)`
(`fileService.ts:742`). O outro caminho de erro — `restoreReadError` →
`toFileOperationResult(error)` (`fileService.ts:675`) — chega **ao mesmo código**:
`FileIsADirectory` do provider é traduzido para `FILE_IS_DIRECTORY`.

Ou seja: **o serviço de arquivos já sabe que é pasta e diz isso num código estável,
independente do provider.** A informação está na mão; ela só não é usada, e o
`catch` do watcher transforma o veredito em erro.

### A evidência de que o defeito é real e isolado

Varredura dos dez perfis da última execução do arnês (`%TEMP%\watchcode-manual\t-0001 … t-0010`),
procurando `[error]` ou `[warning]` com `[watchCode]` no log do renderer:

```text
t-0010\...\renderer.log : 59: 2026-09-11 15:56:08.284 [error] [watchCode] failed to record src ...
```

- É a **única** linha de erro do produto em dez execuções.
- Aparece onde uma **pasta nasce**: o T-0010 cria `src/` e `src/modulo/`.
- O T-0010 passou com 24 conferências **mesmo assim**: a suíte e o arnês não olham o log.
- O aviso `Creation of workbench contribution 'workbench.contrib.watchCode.hiddenViews'`
  aparece em todas as execuções e **não** é prefixado por `[watchCode]` — o padrão da
  varredura precisa distinguir os dois.

## 4. Dependências

- **E1-T4 e E1-T6** (watcher e fechamento da E1) — prontos; o caminho observado veio deles.
- `FileOperationResult` e `toFileOperationResult()` de `vs/platform/files/common/files.js` —
  já exportados e já importados pelo próprio `fileService.ts`.
- Arnês `docs/watch-code/e2e` — `logTail()` já resolve a pasta de log mais recente do
  perfil (`user-data/logs/<stamp>/window1/renderer.log`).
- Nenhum serviço novo, nenhuma dependência nova, nenhum registro novo de instanciação.

## 5. Etapas

1. **Contrato** — `recordChange` devolve `Promise<ChangeEvent | undefined>` na interface
   `IChangeRecorderService` e na implementação, com o significado do `undefined` no
   comentário do contrato.
2. **Recorder** — a leitura passa a distinguir "não é arquivo" das demais falhas; o
   `record()` devolve `undefined` antes de tocar no ledger, na sombra e em `lastEvents`.
3. **Watcher** — `record()` trata o `undefined` como nada a registrar e deixa o vestígio
   no `trace`, em vez de erro.
4. **Testes de unidade** — `changeRecorderService.test.ts` (pasta → `undefined`, ledger
   vazio, sem rejeição; o arquivo ausente continua rejeitando) e
   `workspaceWatcherService.test.ts` (pasta nova + arquivo dentro → só o arquivo vira
   evento, sem erro no log).
5. **Arnês** — varredura do log no fim da execução e o cenário novo do D4.
6. **Execução** — testes do módulo, `npm run typecheck-client`, `npx eslint`,
   `npm run valid-layers-check` e o arnês inteiro.
7. **Registro** — `testes-manuais.md`, `overview.md`, `README.md` do arnês e o commit.

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| Engolir erro de verdade (permissão negada, arquivo que sumiu) junto com a pasta | Só o código de "é pasta" vira `undefined`; todo o resto continua subindo. O teste `arquivo ilegível não vira evento`, que exige rejeição, fica como guarda |
| Perder a supressão da escrita repetida | O `undefined` sai **antes** de mexer em `lastEvents` e no `shadowStore`; os testes de entrega repetida e de entregas simultâneas seguem valendo |
| A pasta abrir sessão no agrupador e não registrar nada | Sessão sem evento não entra no ledger nem na linha do tempo; e é o comportamento certo quando pasta e arquivo chegam no mesmo lote |
| A varredura do log reprovar por ruído que não é do produto | O padrão exige o prefixo `[watchCode]` **depois** do nível; o aviso do `hiddenViews`, que apenas cita o nome, não casa |
| Contrato muda e quebra outro consumidor | Busca no `src/vs` mostra um consumidor só: `workspaceWatcherService.ts:149` |
| A varredura não achar nada por ler o log errado | Usa a mesma pasta do `logTail()` e **imprime quantas linhas conferiu**, para o verde não ser confundido com "não leu nada" |
| O cenário novo ficar lento ou instável | Reaproveita os ajudantes que já existem (`writeWorkspaceFile`, `LedgerReader.waitForCount`, `waitUntilQuiet`) e as constantes de pausa já calibradas |

## 7. Decisões pendentes

### D1 — Como o recorder reconhece que o caminho não é arquivo

| Opção | Como fica | Custo |
| --- | --- | --- |
| **A** | Perguntar o tipo antes de ler: `fileService.stat(resource)` e, se for pasta, devolver `undefined` | Uma ida a mais ao disco **por alteração registrada** — a leitura faz o `stat` dela mesma, então seriam duas |
| **B** (recomendada) | Deixar a leitura falhar e reconhecer o veredito: `toFileOperationResult(error) === FileOperationResult.FILE_IS_DIRECTORY` → `undefined` | Nenhuma ida a mais; usa o código que o serviço de arquivos já produz, independente do provider |
| **C** | Filtrar no watcher, antes de chamar o recorder | Exigiria o mesmo `stat` no caminho quente e não cumpriria o contrato aprovado |

Recomendo **B**: o `stat` já acontece dentro da leitura, e o erro de "é pasta" é o
veredito do próprio serviço de arquivos, não uma adivinhação. A opção A é mais óbvia
de ler, mas paga uma consulta por alteração num caminho que roda o tempo todo.

### D2 — Remoção de pasta

Quando uma pasta é removida, o watcher avisa a pasta (provavelmente) e o recorder
grava — porque numa remoção ele não lê nada —, o que criaria um evento para um
caminho que é pasta. **Não medi isso ainda**: nenhum cenário do arnês apaga pasta.

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | Corrigir só o caso observado (pasta que chega como criação/alteração) e **medir** a remoção no cenário novo do arnês: se a pasta removida virar evento, a pendência entra no guia com o número e a correção vira tarefa própria |
| **B** | Não medir agora: corrigir o defeito observado e deixar a pergunta aberta |
| **C** | Corrigir a remoção também, agora |

Recomendo **A**. A opção C é a única que eu não faria: sem o caminho no disco não há
como saber o tipo, e a heurística disponível ("caminho nunca visto não é arquivo")
engoliria o caso legítimo do arquivo criado e removido entre dois lotes — que hoje tem
teste próprio exigindo o evento de remoção.

### D3 — O que o watcher faz quando o recorder devolve `undefined`

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | Nada é registrado e fica um `trace` (`[watchCode] ignored non-file change: src`), visível só com o log detalhado ligado |
| **B** | Silêncio total: nenhuma linha, em nenhum nível |

Recomendo **A**: o `trace` não polui o log normal e deixa rastro para quem estiver
depurando por que uma pasta não aparece na linha do tempo.

### D4 — Como provar no arnês

| Opção | Como fica |
| --- | --- |
| **A** (recomendada) | **Varredura transversal** no fim de toda execução (procura `[error]`/`[warning]` com prefixo `[watchCode]` no `renderer.log` e reprova se achar) **e** um cenário novo `T-0011 — Pasta nao e alteracao` que cria uma pasta nova com um arquivo dentro, confere o ledger e, conforme o D2, mede a remoção |
| **B** | Só a varredura transversal, sem cenário novo: o T-0010 **já** cria `src/` e `src/modulo/`, então a varredura sozinha já reprovaria a execução se o erro voltasse |
| **C** | Só os testes de unidade, sem tocar no arnês |

Recomendo **A**. A varredura custa poucas linhas, vale para os dez cenários e responde
exatamente ao sintoma ("erro no log"), que nenhum teste de unidade prova de ponta a
ponta; o cenário novo dá nome à conferência e é o lugar natural da medição do D2.
Se você achar que o cenário é excesso para uma correção deste tamanho, **B** já cobre
o defeito com metade do trabalho.

## 8. Critérios de aceite

1. `recordChange` de um caminho que é pasta **resolve** `undefined` e não rejeita.
2. Nada entra no ledger por causa da pasta: nem evento, nem snapshot.
3. A pasta não mexe em `lastEvents` nem no `shadowStore`: o arquivo de mesmo nome que
   venha depois continua virando evento normalmente.
4. Um caminho que não existe continua **rejeitando** (o teste `arquivo ilegível não
   vira evento` segue verde).
5. A supressão da escrita repetida e a fila por arquivo seguem intactas — os testes
   que já existem para os dois continuam verdes.
6. No watcher, criar uma pasta nova com um arquivo dentro produz **um** evento — o do
   arquivo — e **nenhum** erro no log.
7. O único vestígio da pasta é o `trace` do watcher, que só aparece com o log detalhado.
8. A execução inteira do arnês termina com a conferência transversal verde (hoje ela
   reprovaria) e os cenários anteriores seguem passando.
9. `npm run typecheck-client`, `npx eslint` nos arquivos tocados e
   `npm run valid-layers-check` sem erro.
10. `testes-manuais.md` com o teste novo executado de verdade, com a saída real e a
    situação preenchida.
11. `overview.md` com a E1-T7 em `feito`, o total de testes do módulo atualizado e a
    pendência do D2 registrada (se o D2 for A e a medição achar o problema).
12. `docs/watch-code/e2e/README.md` explicando a conferência transversal.
13. Nenhum arquivo fora do escopo da tarefa foi tocado.
