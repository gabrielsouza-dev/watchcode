# Especificação — E2-T5 · Fechamento da E2

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T5 — Fechamento da E2 |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Plano | `docs/watch-code/PLANS/e2-t5-fechamento-da-e2.md` (D1 a D5 aprovadas: **A** em todas) |
| Saída | Este documento → Developer |

## 1. Comportamento esperado

Um cenário novo no arnês de testes manuais — **T-0010 — Sessão inteira percorrida** —
que produz, com o app aberto, uma sessão de seis alterações em seis arquivos e prova
que o painel conta a mesma história que o ledger, percorrendo a sessão inteira com o
teclado. Depois, uma segunda sessão, no mesmo app, prova o acréscimo ao vivo e a
transição `current` → `history`.

Nenhum arquivo de `src/` muda para isso acontecer. O que a tarefa acrescenta é a
prova; se a prova falhar, o defeito é corrigido aqui (D3).

### 1.1 O workspace preparado, antes de o app abrir

Tudo commitado (o `HEAD` é o "antes" da primeira alteração de cada arquivo):

| Arquivo | Estado inicial | Papel no cenário |
| --- | --- | --- |
| `src/alvo.ts` | 200 linhas, inalteradas | Alteração na linha 100, e depois o arquivo encurtado |
| `src/apoio.js` | 120 linhas, inalteradas | Alteração na linha 60 |
| `src/servico.cs` | 80 linhas, inalteradas | Alteração na linha 30 — linguagem que a IDE não conhece |
| `src/modulo/indice.ts` | 40 linhas, inalteradas | Alteração na linha 25, dentro de uma subpasta |
| `src/legado.js` | 5 linhas | Será **removido** durante a sessão |

A subpasta `src/modulo/` existe desde o commit — de propósito: pasta criada durante a
observação é o defeito conhecido e ainda pendente do gravador, e esta tarefa não é
sobre ele.

### 1.2 A sessão, escrita de uma vez

Seis escritas em sequência, sem espera entre elas, dentro da janela de agrupamento
(`DEFAULT_PAUSE_MS = 1500`):

| # | Arquivo | Escrita | Faixa esperada |
| --- | --- | --- | --- |
| 1 | `src/alvo.ts` | 200 linhas, linha 100 marcada | `[100, 100]` |
| 2 | `src/apoio.js` | 120 linhas, linha 60 marcada | `[60, 60]` |
| 3 | `src/servico.cs` | 80 linhas, linha 30 marcada | `[30, 30]` |
| 4 | `src/modulo/indice.ts` | 40 linhas, linha 25 marcada | `[25, 25]` |
| 5 | `src/modulo/regra.ts` | **arquivo novo**, 12 linhas | `[1, 12]` — primeiro evento sem "antes" |
| 6 | `src/legado.js` | **remoção** | sem faixa — evento sem "depois" |

Linha alterada diferente por arquivo, de propósito: se todas fossem a mesma, um
salto que sempre caisse na mesma linha passaria despercebido.

### 1.3 A segunda sessão

Depois de `BETWEEN_SESSIONS_MS` (3000 ms), `src/alvo.ts` é reescrito com 5 linhas de
conteúdo. Isso faz duas coisas ao mesmo tempo: acrescenta um evento novo ao fim da
lista, ao vivo, e rebaixa o evento anterior daquele arquivo a `history` no ledger.

A entrada antiga aponta para a linha 100, que já não existe: é a pendência registrada
no T-0008, exercitada de propósito (D4). O esperado é o que o produto faz hoje — o
salto para na última linha do arquivo, **sem aviso**; o aviso é escopo da E5-T1.

### 1.4 A travessia

Sempre com o teclado, porque a lista é virtualizada e só algumas linhas existem no DOM
por vez:

- **Voltar ao começo** — `Shift+F5` até a primeira linha ficar selecionada. Sem evento
  ativo o "anterior" entra pela ponta de baixo (`stepActiveId`), então a repetição
  leva ao começo e de lá não sai.
- **Ida** — `F5` uma vez por evento do ledger, na ordem; a cada passo, a linha
  selecionada e o editor são medidos.
- **Volta** — `Shift+F5` uma vez por evento, conferindo a ordem inversa.

### 1.5 A conferência painel × disco

A cada passo da travessia, a linha selecionada é comparada com o evento correspondente
do ledger, campo a campo:

| Medida | Fonte no evento | Esperado na linha |
| --- | --- | --- |
| Nome do arquivo | último segmento do `fileUri` | o nome, na primeira faixa da linha |
| Segunda faixa | `folderPath`, `linesChanged`, `timestamp`, `attribution` | `pasta · linhas · HH:MM · Disk`, sem as partes vazias |
| Cursor do editor | `linesChanged[0]` | `Ln <min(faixa[1], linhas do arquivo)>,` |

A hora é formatada com o mesmo formato do produto (`HH:MM` local, dois dígitos) e a
faixa com o mesmo formato (`12` ou `12-14`). A contagem de linhas do arquivo é a do
editor: o conteúdo termina em `\n`, então cinco linhas de texto dão **seis** linhas no
modelo — é o que explica o `Ln 6` do T-0008.

## 2. Contratos

Nada em `src/vs/` muda. O que muda é o arnês, que é instrumento de teste:

| Contrato | Antes | Depois |
| --- | --- | --- |
| `WARM_UP_FILE` (`harness.ts`) | `aquecimento.txt` | `aquecimento.ts` (D5) |
| `ILedgerEvent` (`harness.ts`) | sem as faixas | ganha `linesChanged?: readonly (readonly [number, number])[]` |
| `LedgerReader` (`harness.ts`) | só espere por arquivo | ganha `waitForCount(minimum, timeoutMs)` — a rajada não tem arquivo-sentinela |
| `longContent` (`run-manual-tests.ts`) | fixo em 200 linhas, linha 100 | aceita a linha marcada e o total, com os valores de hoje como padrão |

Os cenários T-0001 a T-0009 continuam chamando tudo como chamavam: os parâmetros
novos têm valor padrão, e só a constante do arquivo de sonda muda de valor — os testes
que a citam usam a constante.

## 3. Alterações necessárias

| Arquivo | O que muda |
| --- | --- |
| `docs/watch-code/e2e/harness.ts` | `WARM_UP_FILE` para `.ts`; `linesChanged` em `ILedgerEvent`, lido no `events()`; `waitForCount` no `LedgerReader` |
| `docs/watch-code/e2e/run-manual-tests.ts` | `longContent` com linha e total; constantes e conteúdo do T-0010; o ajudante `selectedRowDetail`; o cenário `T-0010` no registro `TESTS` |
| `docs/watch-code/testes-manuais.md` | O T-0010, com objetivo, pré-condições, passos, resultado esperado e o resultado obtido |
| `docs/watch-code/e2e/README.md` | O T-0010 na tabela de cenários e a sonda com a extensão nova |
| `docs/watch-code/Workflow/overview.md` | E2-T5 `feito`, etapa E2 fechada, parágrafo "Provado na E2-T5" no §6 |

O cenário é acrescentado ao registro `MANUAL_TESTS`, sem tocar nos nove anteriores.

## 4. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | A rajada cair em mais de uma sessão | O esperado é uma sessão só; a partição é conferida contra o ledger. Se dividir, a evidência mostra em que ponto, e a decisão D3 diz o que fazer |
| B2 | A lista não estar expandida no perfil do cenário | O cenário confere `timelineExpanded` e expande com o clique no cabeçalho antes de medir |
| B3 | O evento da remoção não mudar o editor | É o esperado: o passo confere o aviso e que nenhum editor do arquivo removido foi aberto |
| B4 | A linha da lista não estar desenhada quando o passo a mede | A travessia é feita com o teclado, que traz cada linha para a área visível; a medida é sempre da linha selecionada |
| B5 | `out/` desatualizado | `assertFreshBuild()` já aborta dizendo o comando a rodar |
| B6 | A janela não desenhar quadros durante a rolagem | Nenhuma medida desta tarefa depende de quadro desenhado: tudo vem de `status.editor.selection`, da seleção da lista e do ledger |
| B7 | Um passo do `F5` não mudar nada | A caminhada compara o passo com o evento esperado: um passo parado aparece como linha repetida, e o passo seguinte fica deslocado |

## 5. Plano de testes

**Unidade:** nada novo. O que a tarefa prova é integração de interface, e o módulo já
cobre as regras puras (`timelineRows`, `timelineNavigation`, `changeReveal`).

**Manual (o cenário T-0010, executado pelo arnês):**

1. a sessão de seis alterações entra no ledger com a faixa de linhas esperada em cada
   arquivo e com os seis eventos na mesma sessão;
2. o `F5` percorre a lista do primeiro ao último evento, e cada passo seleciona a linha
   que corresponde ao evento, com a segunda faixa igual à do ledger;
3. o cursor cai na última linha da faixa de cada evento;
4. o evento de remoção avisa em vez de abrir, e nenhum editor do arquivo removido é
   aberto;
5. o `Shift+F5` volta pela mesma ordem, sem pular nem repetir linha;
6. a segunda sessão acrescenta a linha nova ao fim, sem mexer no nome nem na segunda
   faixa das anteriores;
7. a entrada antiga do `src/alvo.ts` para na última linha do arquivo encurtado, sem
   aviso — a pendência do T-0008, com a E5-T1 dona do aviso.

**Validação do repositório:** `npm run typecheck-client`,
`npm run test-node -- --runGlob "**/{changeLedger,watchCode}/test/**/*.test.js"`,
`npx eslint` nos arquivos tocados, `npm run valid-layers-check` e
`node --experimental-strip-types build/hygiene.ts`.

## 6. Critérios de aceite verificáveis

| # | Critério | Verificação |
| --- | --- | --- |
| 1 | O cenário roda sozinho, com o app em perfil isolado | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0010` |
| 2 | A sessão tem os seis eventos, com faixa e sessão corretas | conferências do cenário contra o ledger |
| 3 | A travessia de ida passa por todos os eventos, na ordem | conferência por passo |
| 4 | A travessia de volta passa por todos, na ordem inversa | conferência por passo |
| 5 | A linha da lista confere com o evento: nome, pasta, faixa, hora e origem | conferência por passo |
| 6 | O cursor cai na última linha da faixa, limitada ao tamanho do arquivo | `status.editor.selection` a cada passo |
| 7 | A remoção é percorrida com aviso e sem abrir o arquivo | texto da notificação |
| 8 | A segunda sessão entra ao vivo e rebaixa a entrada antiga | ledger e lista depois da escrita |
| 9 | A pendência do T-0008 é exercitada e registrada | cursor `Ln 6` sem aviso |
| 10 | Os dez cenários do arnês continuam passando | execução do arnês inteiro |
| 11 | `typecheck-client`, suíte, `eslint`, `valid-layers-check` e `hygiene` passam | comandos do §5 |
| 12 | O backlog marca E2-T5 `feito` e a etapa E2 fechada | `overview.md` |

## 7. Decisões pendentes

Nenhuma. D1 a D5 estão aprovadas no plano.

## 8. Divergências do plano

1. **O plano dizia "conferência painel × disco" como passo próprio (§5.3).** A
   conferência não pode ser um passo próprio: a lista é virtualizada e nem todas as
   linhas existem no DOM ao mesmo tempo. Ela passou a ser feita **dentro da travessia**,
   que traz cada linha para a área visível. Mesma prova, formato diferente.
2. **O plano previa 6 eventos com "criação, alterações e uma remoção" em 4 arquivos.**
   São 6 eventos em 6 arquivos (nenhum arquivo recebe duas escritas na primeira
   sessão): a segunda escrita de um mesmo arquivo é justamente o que a segunda sessão
   prova, e misturar as duas coisas embaralharia a leitura da ordem.
3. **`longContent` ganha parâmetros.** O plano não previa mexer no gerador de
   conteúdo, mas com linha fixa em 100 um salto que sempre caísse na mesma linha
   passaria. É mudança de ajudante de teste, com os valores de hoje como padrão.
