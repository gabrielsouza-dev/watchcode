# Especificação — E3-T1 · Cálculo de diff

**Plano:** `docs/watch-code/PLANS/e3-t1-calculo-de-diff.md`
**Workflow:** High · etapa SpecWriter (2 de 5)
**Próxima etapa:** Developer

## 1. Decisões

### 1.1 Herdadas do plano

| # | Decisão | Onde no plano |
| --- | --- | --- |
| D1 | O algoritmo é o **`LcsDiff` da base**, sobre uma sequência de linhas | §7 |
| D2 | O evento **não** passa a guardar hunks: o campo continua `ChangeLineRange[]` | §7 |
| D3 | O produtor provisório e o teste dele **saem agora** | §7 |
| D4 | Remoção pura aponta a linha onde o trecho saiu | §7 |
| D5 | Arquivo esvaziado ou removido **não tem faixa** | §7 |
| D6 | O módulo é puro: dois conteúdos entram, o diff sai | §7 |
| D7 | Acima de um limite de linhas, o diff é **grosso** (um bloco) e o resultado diz isso | §7 |
| D8 | O corte interno do `LcsDiff` (`quitEarly`) é **repassado**, não escondido | §7 |

### 1.2 Decisões locais desta etapa

| # | Decisão | Por quê |
| --- | --- | --- |
| L1 | O módulo é `common/changeDiff.ts`, com `computeChangeDiff`, `changedLineRanges` e os tipos `IChangeDiff`/`IChangeHunk` | Ocupa o lugar do provisório, no mesmo diretório e com a mesma natureza (puro, sem serviço); o nome diz o que ele é |
| L2 | O hunk tem os **dois lados**, cada um opcional: `before` ausente é inserção pura, `after` ausente é remoção pura | É a forma que a decoração da E3-T3 precisa (verde de um lado, vermelho do outro) e é honesta: lado ausente é ausência, não faixa vazia |
| L3 | A **contagem de linhas** é do diff inteiro (`addedLines`/`removedLines`), não de cada hunk | Contagem por hunk é o tamanho da própria faixa, que o consumidor já tem na mão; guardar as duas seria redundância que pode divergir |
| L4 | O limite do diff fino é **4000 linhas por lado** (`MAX_DIFF_LINES`) | Medido no pior caso (conteúdo inteiro diferente): 4000 linhas custam ~460 ms, 6000 custam ~930 ms e 12000 custam ~3 s. O caso comum não é afetado: 8000 linhas com duas mudanças distantes custam ~10 ms — o custo é do **número** de diferenças, não do tamanho. Acima do limite, um arquivo reescrito por inteiro cai no bloco único, que é o mesmo resultado do diff fino |
| L5 | A faixa derivada de um hunk de **remoção pura** é a linha `modifiedStart + 1` do lado de depois, limitada ao tamanho do arquivo | É a conta que reproduz o comportamento provado no T-0008, no T-0010 e no T-0014 (a linha onde o trecho saiu) |
| L6 | A ordem dos hunks é a do arquivo **antes** (e, no empate, a do depois) | É a ordem natural do algoritmo e a que a lista já mostra; sem ordenação própria não há o que divergir |
| L7 | As linhas saem da **mesma normalização** do provisório: CRLF vira LF e a quebra final sozinha não conta | É o que impede o Windows de acusar alteração onde não houve, e já está provado por teste |
| L8 | O gravador troca **uma linha**: calcula o diff e grava `changedLineRanges(diff)` | O resto do caminho (a guarda de "sem antes", o registro do evento) não muda; a tarefa é o cálculo, não o gravador |

## 2. Comportamento esperado

| # | Situação | O que acontece |
| --- | --- | --- |
| 1 | Conteúdos iguais | Nenhum hunk; `addedLines` e `removedLines` valem 0; `coarse` é falso |
| 2 | Uma linha trocada | **Um** hunk com `before` e `after` de uma linha cada; o diff soma 1 e remove 1 |
| 3 | Linhas seguidas trocadas | **Um** hunk cobrindo o bloco dos dois lados |
| 4 | Linhas inseridas no meio | **Um** hunk **sem** `before`, com o `after` do tamanho do que entrou; só soma |
| 5 | Linhas removidas do meio, arquivo continuando | **Um** hunk **sem** `after`, com o `before` do tamanho do que saiu; só remove |
| 6 | **Duas alterações distantes** no mesmo arquivo | **Dois** hunks (é o ganho da tarefa: hoje o produtor provisório devolveria uma faixa só, cobrindo tudo entre elas) |
| 7 | Bloco movido de lugar | **Dois** hunks: uma remoção onde ele estava e uma inserção onde ele ficou. O produto não promete detectar movimentação |
| 8 | Arquivo novo (sem "antes") | **Um** hunk com o arquivo inteiro do lado de depois; o lado de antes não existe |
| 9 | Arquivo removido (sem "depois") | **Um** hunk com o arquivo inteiro do lado de antes; nenhuma faixa é derivada |
| 10 | Arquivo esvaziado (antes com linhas, depois vazio) | **Um** hunk de remoção; **nenhuma** faixa é derivada |
| 11 | Só o fim de linha mudou (CRLF ↔ LF) ou a quebra final apareceu | Nenhum hunk |
| 12 | Arquivo acima de `MAX_DIFF_LINES` | **Um** hunk cobrindo do primeiro ao último ponto diferente, com `coarse: true` |
| 13 | O `LcsDiff` desiste no meio | Os hunks que ele devolveu são usados, com `coarse: true` |
| 14 | Um evento com duas faixas | A lista mostra `2, 8` no detalhe e `Lines 2, 8` no tooltip; o salto abre o arquivo e seleciona **só** a primeira |

## 3. Fatos conferidos

| Fato | Onde |
| --- | --- |
| `IDiffChange` é `[originalStart, originalLength, modifiedStart, modifiedLength]`, 0-based, com `modifiedLength === 0` na remoção pura e `originalLength === 0` na inserção | `src/vs/base/common/diff/diff.ts:33-57` |
| `LcsDiff.ComputeDiff(pretty)` devolve `{ quitEarly, changes }`; o corte por memória vem de dentro do algoritmo | `src/vs/base/common/diff/diff.ts:327-351` e `:436-439` |
| Passar `string[]` em `ISequence.getElements()` faz o algoritmo comparar as linhas pelo texto | `src/vs/base/common/diff/diff.ts:268-288` |
| Medição feita nesta etapa, sobre o algoritmo compilado: duas alterações distantes em 10 linhas devolvem dois `changes`; `a,b,c → a,c` devolve `[1,1,1,0]`; `[] → a,b` devolve `[0,0,0,2]` | sonda própria sobre `out/vs/base/common/diff/diff.js` |
| Custo medido: 4000 linhas inteiramente diferentes = 461 ms; 6000 = 927 ms; 12000 = 2983 ms; 8000 linhas com duas mudanças distantes = 10 ms | sonda própria sobre `out/vs/base/common/diff/diff.js` |
| O produtor de hoje normaliza CRLF e quebra final antes de comparar, e é essa normalização que o produto tem provada | `src/vs/platform/changeLedger/common/changedLines.ts:57-69` |
| Quem mais usa o produtor antigo: só o gravador | `changeRecorderService.ts:17` e `:256` |
| A lista já escreve várias faixas e o tooltip já as mostra | `timelineRows.ts:67-74` e `timelineView.ts:74` e `:81-82` |

## 4. Contratos

### 4.1 `changeLedger/common/changeDiff.ts` (novo)

```typescript
/** Limite de linhas por lado acima do qual o diff deixa de ser fino. */
export const MAX_DIFF_LINES = 4000;

/** O que a alteracao consumiu de um lado e produziu do outro. */
export interface IChangeHunk {
	/** Linhas do arquivo antes que a alteracao consumiu; ausente na insercao pura. */
	readonly before?: ChangeLineRange;
	/** Linhas do arquivo depois que a alteracao produziu; ausente na remocao pura. */
	readonly after?: ChangeLineRange;
	/** Linha do depois onde a remocao pura caiu; ausente quando ha lado de depois (D9). */
	readonly afterLine?: number;
}

/** O diff entre os dois conteudos de um evento. */
export interface IChangeDiff {
	/** Em ordem de leitura; vazio quando nada mudou. */
	readonly hunks: readonly IChangeHunk[];
	/** Linhas somadas; a linha trocada conta uma somada e uma removida. */
	readonly addedLines: number;
	/** Linhas removidas. */
	readonly removedLines: number;
	/** O diff nao e fino: veio do limite de tamanho ou do corte do proprio algoritmo. */
	readonly coarse: boolean;
}

/** Diff entre os dois conteudos. Ausente e conteudo vazio. */
export function computeChangeDiff(before: VSBuffer | undefined, after: VSBuffer | undefined): IChangeDiff;

/** Faixas do arquivo depois, para o salto e para a linha do tempo. */
export function changedLineRanges(diff: IChangeDiff): ChangeLineRange[];
```

**Regras do contrato:**

1. `before`/`after` de um hunk são `[primeira, ultima]`, 1-based e inclusivos, no arquivo
   **daquele lado**. Faixa de uma linha é `[n, n]`.
2. Hunk de inserção pura **não tem** `before`; de remoção pura **não tem** `after`. Nunca uma
   faixa vazia ou invertida.
3. `addedLines` é a soma das linhas dos lados `after`; `removedLines`, a dos lados `before`.
4. `changedLineRanges` devolve uma faixa por hunk, na ordem dos hunks: o lado `after` quando
   existe; na remoção pura, a linha **onde o trecho saiu** (`modifiedStart + 1`, limitada a
   `[1, linhas do depois]`); nada quando o arquivo depois não tem linha nenhuma.
5. Sem "depois" (arquivo removido), a lista devolvida é vazia.
6. A função é pura, síncrona e não lança: qualquer combinação de `undefined` e conteúdo vazio
   tem resposta (diff vazio ou hunk de um lado só).

### 4.2 `changeLedger/common/changeRecorderService.ts` (alterado)

No ponto em que a faixa é medida hoje:

```typescript
// O diff sai dos dois conteudos que ja estao na mao: a lista e o salto leem o
// evento depois, sem voltar aos snapshots. Sem "antes" nao ha o que comparar — o
// evento e parcial e fica sem faixa —, a nao ser que o arquivo seja novo: ai o
// "antes" e o vazio, e o arquivo inteiro mudou.
const diff = baseline.content || change.kind === 'added' ? computeChangeDiff(baseline.content, content) : undefined;
const ranges = diff ? changedLineRanges(diff) : [];

// ...
linesChanged: ranges.length > 0 ? ranges : undefined,
```

Nada mais muda no gravador: a guarda que decide se o evento é registrado, o store de snapshots
e a sombra ficam como estão.

## 5. Alterações necessárias

| Arquivo | Ação |
| --- | --- |
| `src/vs/platform/changeLedger/common/changeDiff.ts` | **criar** — o módulo do §4.1 |
| `src/vs/platform/changeLedger/common/changedLines.ts` | **remover** |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | alterar o import (`:17`) e o cálculo da faixa (`:252-256` e `:267`) |
| `src/vs/platform/changeLedger/test/common/changedLines.test.ts` | **remover** |
| `src/vs/platform/changeLedger/test/common/changeDiff.test.ts` | **criar** — os casos do §7.1 |
| `src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts` | acrescentar o caso de duas faixas no evento (§7.1) |
| `docs/watch-code/e2e/run-manual-tests.ts` | acrescentar o cenário `T-0015` (§7.2) |
| `docs/watch-code/e2e/README.md` | linha do T-0015 na tabela |
| `docs/watch-code/testes-manuais.md` | entrada do T-0015, com o resultado da execução |
| `docs/watch-code/Workflow/overview.md` | status da E3-T1 com os números medidos |

**Nenhum outro arquivo é tocado.** O contrato do evento, o serviço da timeline, a lista, o salto
e as contribuições ficam como estão.

## 6. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | `before` e `after` ausentes | Diff vazio, sem hunks |
| B2 | Conteúdo só com quebra de linha (`''` ou `'\n'`) | Zero linhas nos dois lados: nada mudou |
| B3 | Arquivo esvaziado | Um hunk de remoção; `changedLineRanges` devolve vazio, e o gravador grava `linesChanged: undefined` |
| B4 | Remoção de tudo com o arquivo removido | Igual ao B3 |
| B5 | Remoção pura no começo do arquivo | `modifiedStart` é 0: a faixa é a linha 1 |
| B6 | Remoção pura no fim do arquivo | `modifiedStart + 1` passa do fim: a faixa é a última linha que ficou |
| B7 | Inserção no fim | `after` é `[n+1, n+1]`, a última linha do arquivo depois |
| B8 | Arquivo grande (acima do limite) com **uma** alteração local | O hunk grosso cai exatamente no trecho alterado: o recorte por prefixo e sufixo não perde nada quando a alteração é uma só |
| B9 | Arquivo grande com várias alterações distantes | Um hunk grosso cobrindo do primeiro ao último ponto diferente — a faixa fica larga, mas ainda **começa** onde começa a alteração, então o salto continua caindo no lugar certo |
| B10 | Arquivo grande sem alteração nenhuma | Nenhum hunk, mesmo sem rodar o diff fino |
| B11 | `quitEarly` verdadeiro | Hunks do algoritmo, `coarse: true` |

## 7. Plano de testes

### 7.1 Unidade — `changeLedger/test/common/changeDiff.test.ts` (novo)

Substitui os 12 casos do produtor provisório, com os mesmos conteúdos de entrada, mais o que só
o diff por hunks responde. Asserção única por caso (`assert.deepStrictEqual` sobre o diff
inteiro, com um ajudante `hunk()`/`diff()` para manter a leitura curta):

| # | Caso |
| --- | --- |
| 1 | Conteúdo igual não tem hunk |
| 2 | Uma linha trocada aponta os dois lados |
| 3 | Linhas seguidas trocadas viram um hunk só |
| 4 | Inserção no meio só tem o lado de depois |
| 5 | Remoção pura só tem o lado de antes |
| 6 | Remoção no começo aponta a primeira linha |
| 7 | Remoção no fim aponta a última linha que ficou |
| 8 | Arquivo novo é um hunk com o arquivo inteiro |
| 9 | Arquivo removido é um hunk sem lado de depois |
| 10 | **Duas alterações distantes viram dois hunks** |
| 11 | Bloco movido vira remoção e inserção |
| 12 | A contagem soma o que entrou e o que saiu |
| 13 | Linha trocada conta uma somada e uma removida |
| 14 | Quebra de linha final a mais não é alteração |
| 15 | Fim de linha do Windows não é alteração |
| 16 | Dois arquivos vazios não têm hunk |
| 17 | Acima do limite o diff vem grosso, em um hunk só |
| 18 | O diff grosso ainda recorta as duas pontas |
| 19 | `changedLineRanges` devolve as faixas na ordem dos hunks |
| 20 | `changedLineRanges` de remoção pura aponta a linha de depois |
| 21 | `changedLineRanges` de arquivo esvaziado ou removido é vazio |

**Um caso no gravador** (`changeRecorderService.test.ts`): uma escrita de fora com duas
alterações distantes grava **duas** faixas no evento — é a prova de que a troca do produtor
chegou ao caminho de verdade, e não só ao módulo.

### 7.2 Manual — `T-0015` no arnês, no app de verdade

Cenário novo em `docs/watch-code/e2e/run-manual-tests.ts`, no padrão dos anteriores (perfil
isolado, sonda de prontidão, leitura do ledger sossegado, varredura do log no fim).

| Fase | O que faz | O que confere |
| --- | --- | --- |
| 0 | Sonda de prontidão | A observação está ligada antes de medir |
| 1 | `distante.ts` com dez linhas vai para o repositório e é **escrito de fora** com duas alterações distantes (linha 2 e linha 8) | A linha do tempo mostra `2, 8` no detalhe e `Lines 2, 8` no tooltip — e **não** `2-8` |
| 2 | O evento do arquivo no ledger | `linesChanged` é `[[2,2],[8,8]]`: duas faixas gravadas, na ordem |
| 3 | Clique na linha | O arquivo abre e a seleção é **só** a primeira faixa (`Ln 2`, uma linha selecionada), não o trecho entre as duas |
| 4 | Um bloco movido: a linha 1 sai e volta no fim | O evento tem duas faixas (remoção e inserção), e não uma faixa cobrindo o arquivo |

O texto de referência é o que o produto mostra hoje: com o produtor provisório, a linha do
tempo diria `2-8`. O teste registra o antes e o depois no próprio registro.

### 7.3 Regressão

`transpile-client`, `typecheck-client`, `eslint` nos arquivos tocados,
`valid-layers-check`, `test-node` dos dois módulos (`changeLedger` e `watchCode`) e o
arnês inteiro — em especial **T-0008, T-0009, T-0010 e T-0014**, que provam o salto e a lista.

## 8. Critérios de aceite verificáveis

1. `changedLines.ts` e `changedLines.test.ts` não existem mais (`git status` limpo quanto a eles).
2. `computeChangeDiff` devolve hunks com os dois lados, a contagem e a marca de grosso; 21 casos
   de unidade verdes no arquivo novo.
3. Duas alterações distantes produzem dois hunks e duas faixas — provado em unidade e no app.
4. O evento continua com o mesmo contrato: nenhum campo novo em `ChangeEvent`.
5. O caso do gravador prova as duas faixas chegando ao evento.
6. `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` com
   saída 0.
7. `test-node` verde: `changeLedger` com a contagem medida e registrada, `watchCode` em 66.
8. Arnês inteiro verde, com T-0008, T-0010 e T-0014 entre os aprovados.
9. T-0015 no `run-manual-tests.ts`, no `README.md` do arnês e em `testes-manuais.md` com
   resultado obtido e situação.
10. `overview.md` com o status da E3-T1 e os números medidos.

## 9. Limites e preços

1. **Sem diff por caractere.** A linha trocada inteira conta como removida e somada; a
   decoração da E3-T3 vai pintar a linha toda.
2. **Sem detecção de movimentação.** Bloco movido aparece como remoção mais inserção.
3. **O limite de 4000 linhas por lado é um preço declarado**: acima dele, um arquivo com duas
   alterações distantes mostra uma faixa larga em vez de duas. O salto continua caindo no começo
   da alteração, e o caso comum (arquivo grande com uma alteração) não perde nada.
4. **O diff grosso pode variar** em arquivos acima do limite quando o próprio algoritmo desiste:
   `coarse` diz que aconteceu, mas os hunks não são reproduzíveis linha a linha.
5. **O hunk não guarda a faixa "para o salto"** — quem deriva é `changedLineRanges`. Guardar as
   duas formas no mesmo objeto seria duas verdades sobre a mesma coisa.

## 10. Divergências do plano e decisões pendentes

| # | Ponto | Situação |
| --- | --- | --- |
| 1 | O plano pedia "corte por tamanho" sem número | Fixado em `MAX_DIFF_LINES = 4000` por lado, com a medição registrada no §3 |
| 2 | O plano falava em "contagem de linhas" nos hunks | A contagem ficou no diff (`addedLines`/`removedLines`), porque a contagem de um hunk é o tamanho da faixa dele (L3) |
| 3 | O hunk de remoção pura precisava de **onde** a remoção caiu no arquivo depois, e isso não sai das faixas: a linha de depois é o que o salto abre e o que a lista mostra | Acrescentado `afterLine` ao hunk (D9). Sem ele, `changedLineRanges` teria de adivinhar a posição pelo hunk vizinho, ou carregar o tamanho do arquivo depois só para limitar a conta. O campo é ausente quando há lado de depois (a faixa já diz onde ele está) e quando o arquivo depois não tem linha nenhuma |
| 4 | — | Nenhuma decisão pendente de usuário |
