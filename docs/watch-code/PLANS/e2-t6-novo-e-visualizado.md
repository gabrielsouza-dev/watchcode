# Plano — E2-T6 · Novo e visualizado

| Campo | Valor |
| --- | --- |
| Tarefa | **E2-T6 — Novo e visualizado** |
| Workflow | High (implementação: contrato, persistência e interface) |
| Depende de | E2-T5 (feito) |
| Slug | `e2-t6-novo-e-visualizado` |
| Entrada | Backlog do `overview.md`: "Selo por alteração, gravado no próprio evento; o lote é **derivado** — fica visualizado quando todas as suas alterações estiverem" |
| Saída desta etapa | Este plano → `docs/watch-code/SPECS/e2-t6-novo-e-visualizado.md` |

## 1. Objetivo

Dizer de relance o que o agente alterou e o desenvolvedor **ainda não olhou**. Cada alteração carrega o próprio selo — nova enquanto ninguém foi até ela, visualizada depois — e o lote (a sessão do agente) tem o seu, **derivado**: fica visualizado quando todas as alterações dele estiverem.

A analogia: hoje a linha do tempo é uma pilha de cartas abertas, todas com a mesma cara. A E2-T6 entrega o **carimbo de "não lida"**: a carta nasce carimbada, o carimbo some quando o desenvolvedor a abre, e o maço inteiro só é dado por lido quando todas as cartas dele estiverem.

## 2. Escopo

**Entra:**

1. Selo por alteração, **gravado no próprio evento** do ledger (sobrevive a fechar o app, porque não vive na memória).
2. Marcação automática: a alteração vira visualizada quando o desenvolvedor **vai até ela** — o mesmo gesto que já existe hoje (F5/Shift+F5, clique, setas, Enter, duplo clique).
3. Selo do **lote** derivado dos selos das alterações (regra pura, sem campo próprio).
4. Superfície na lista da timeline: marca na linha das alterações novas.
5. Superfície do lote: contador no título da view da timeline (decisão D1, aprovada pelo usuário).
6. Teste manual novo (T-0012) no registro acumulativo, transcrito para o arnês de `docs/watch-code/e2e`.

**Não entra:**

1. Agrupar a lista por sessão, com cabeçalho de lote — entregável declarado da **E5-T3**.
2. Decoração dos arquivos no Explorer — **E2-T7**.
3. Comando "marcar tudo como visualizado". Nada no backlog pede isso, e o caminho normal (percorrer com F5) já fecha o lote.
4. Notificação do sistema operacional, som ou contador na barra de atividade.
5. Retenção, limpeza e ruído de escrita em massa — **E5-T3**.

## 3. Contexto

O caminho do dado, de ponta a ponta, e onde cada peça entra:

| Arquivo | Papel hoje | O que a E2-T6 faz nele |
| --- | --- | --- |
| `platform/changeLedger/common/changeEvent.ts` | Contrato `ChangeEvent` (id, sessão, origem, hashes, linhas, instante, status) | Ganha `viewedAt` — o selo mora aqui |
| `platform/changeLedger/common/changeLedgerService.ts` | Grava, rebaixa e lê eventos; `record` é o único caminho de escrita | Ganha `markViewed`, que reescreve **só** a marca do evento |
| `platform/changeLedger/common/timelineService.ts` | Modelo de leitura: lista em memória, status derivado (`current`/`history`), `onDidChange` | Ganha `getSummary` e `onDidMarkViewed` — a derivação do lote é dele, não da view |
| `workbench/contrib/watchCode/common/timelineRows.ts` | Converte evento em linha pronta para desenhar (nome, pasta, linhas, hora, origem) | A linha passa a dizer se a alteração é nova |
| `workbench/contrib/watchCode/browser/timelineView.ts` | A lista dentro do Explorer; ponto único do evento ativo (`setActiveEvent`) | Marca ao ir até a alteração, desenha o selo e escreve o contador no título |
| `workbench/contrib/watchCode/browser/media/timelineView.css` | Estilo da lista e da mensagem de estado | Estilo do ponto de "nova" |
| `docs/watch-code/e2e/run-manual-tests.ts` | Arnês que roda os testes manuais no app de verdade (Playwright + leitura do ledger) | Cenário **T-0012** |
| `docs/watch-code/testes-manuais.md` | Registro único dos testes manuais | Teste **T-0012** |

Duas peças de contexto que decidem o desenho:

- **A view é burra por contrato.** O comentário de classe do `TimelineService` diz que quem deriva estado é o serviço: "a view só pergunta ao serviço da timeline: não lê disco, não ordena e não deriva status". O selo derivado do lote segue essa regra e mora no serviço.
- **`ViewPane.setTitleDescription` usa o mesmo texto para a descrição e para o tooltip** (`viewPane.ts:607-616`). Isso limita o título a um texto curto e autoexplicativo — o motivo da decisão D6.

## 4. Dependências

1. **E2-T5 (feito)** — a navegação que define o evento ativo já existe: `stepActiveId` (F5/Shift+F5), clique, setas, Enter e duplo clique desembocam todos em `setActiveEvent`.
2. **E2-T1 (feito)** — `ITimelineService` com a lista em memória e `onDidChange` é o lugar do resumo derivado.
3. **E1-T2 (feito)** — o ledger grava um JSON por evento; reescrever o arquivo de um evento já é prática da casa (`demote` troca o `status`).
4. **Nada de fora do módulo.** Não há dependência nova, nem pacote, nem configuração.

## 5. Decisões

| # | Decisão | Situação | Motivo |
| --- | --- | --- | --- |
| **D1** | O selo do **lote** aparece como **contador no título da view** da timeline (`Timeline  2 lotes`), e não agrupando a lista nem ficando só no modelo | **Aprovada pelo usuário** ("segue A") | Dá retorno imediato — "tem coisa nova que eu não olhei" — sem antecipar o agrupamento por sessão, que é entregável da E5-T3 |
| **D2** | O selo da alteração é um campo do próprio evento: `viewedAt?: number` (epoch em ms), gravado pelo ledger | Decidida — óbvia | O backlog manda gravar "no próprio evento"; um arquivo paralelo de visualizados seria segunda fonte de verdade, que sai de sincronia quando o ledger é limpo, e ainda por cima perderia a associação com o evento |
| **D3** | A alteração vira visualizada quando ela se torna o **evento ativo** — o instante em que o desenvolvedor vai até ela | Decidida — óbvia | Existe **um** ponto de entrada para "o desenvolvedor foi até esta alteração" (`setActiveEvent`): marcar em qualquer outro lugar duplicaria a regra. E vale também quando o arquivo já não existe: o aviso de "nada para abrir" é a leitura possível daquela alteração |
| **D4** | A regra do lote é **derivada**, calculada em função pura sobre a lista de eventos e exposta pelo serviço de timeline (`getSummary`), sem campo no evento nem estado na view | Decidida — óbvia | É a regra escrita no backlog ("o lote é derivado") e a mesma divisão que o serviço já usa para o status `current`/`history` (`withDerivedStatus`) |
| **D5** | O selo na linha é um **ponto** antes do nome, só nas alterações novas; a visualizada não ganha marca nenhuma | Decidida — local | O estado normal não se decora: a lista fica calma e o olho acha o que é novo. Um "visto" explícito em cada linha transformaria a exceção em ruído |
| **D6** | O número do título conta **lotes** com alteração não visualizada ("2 lotes"), não alterações | Decidida — local | A API do `ViewPane` dá **um** texto para descrição e tooltip, então o número precisa se explicar sozinho. Contar alterações aqui competiria com os pontos da lista e ficaria ambíguo ("2" com três pontos na tela) |
| **D7** | Evento gravado antes desta tarefa, sem `viewedAt`, conta como **novo** | Decidida — óbvia | Ausente é "ninguém olhou ainda", que é a verdade. Custo aceito: na primeira abertura depois da tarefa, o histórico inteiro aparece como novo até ser percorrido |

Nenhuma decisão fica pendente de aprovação: D1 foi aprovada pelo usuário e D2 a D7 são técnicas, locais e reversíveis.

## 6. Etapas

1. **Contrato.** `viewedAt?: number` em `ChangeEvent`, com o comentário em português explicando que ausente é "não visualizada".
2. **Ledger.** `markViewed(eventId)` em `IChangeLedgerService`: lê o evento, não escreve nada se já estiver marcado (idempotência — um F5 repetido não gera escrita), e devolve o evento como ficou. Não dispara `onDidRecord`: não é alteração observada, é leitura do desenvolvedor.
3. **Derivação pura.** Módulo em `changeLedger/common` que resume a lista: total de alterações, alterações novas, total de lotes e lotes com alteração nova. Testável sem interface e sem disco.
4. **Serviço de timeline.** `getSummary()` sobre a lista em memória, `markViewed(eventId)` (delega ao ledger, atualiza a cópia em memória, reescreve o selo) e `onDidMarkViewed` para quem desenha.
5. **Linha.** `TimelineRow` ganha o campo que diz se a alteração é nova; o renderizador desenha o ponto e o tooltip/aria-label ganham a palavra.
6. **View.** `setActiveEvent` marca a alteração (sem esperar a resposta e sem quebrar a navegação se a gravação falhar); `onDidMarkViewed` redesenha a linha afetada e atualiza o contador do título.
7. **Teste manual e arnês.** T-0012 no registro acumulativo, transcrito para o arnês com as fases: alteração nova aparece carimbada → ir até ela apaga o carimbo → o lote correspondente sai da contagem → o `viewedAt` está no arquivo do evento no disco.

## 7. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| `markViewed` reescreve o JSON do evento e pode cruzar com um `demote` concorrente | O arquivo pode ficar com `status` desatualizado | O status que a lista mostra é **derivado** na leitura (`withDerivedStatus`), então o campo gravado não decide nada; e a marca só reescreve quando muda |
| Escrita em disco a cada alteração visitada | Custo no armazenamento do workspace | Idempotência: alteração já marcada não gera escrita. Uma escrita por alteração nova, no máximo |
| O contador no título ocupa espaço no cabeçalho da view, dentro do Explorer | Cabeçalho apertado em painel estreito | O `ViewPane` já trunca a descrição; o teste manual confere em painel estreito |
| O arnês escreve uma sonda de aquecimento antes do cenário | A lista começa com pelo menos uma alteração, que também aparece carimbada | As conferências do T-0012 contam por diferença (o que era antes do passo) e não por igualdade com zero |
| Dublês de teste do ledger e do serviço de timeline usados nas suítes existentes | Compilação quebrada nos testes ao ganhar método novo | Ajuste de dublê exigido por compilação é permitido ao Developer e registrado como divergência, como nas tarefas anteriores |
| Histórico antigo inteiro marcado como novo na primeira abertura | Contador alto no primeiro uso | Efeito aceito e medido no teste manual: é a leitura correta de "ninguém olhou ainda" |

## 8. Fontes de prova

| O que precisa de prova | Onde é provado |
| --- | --- |
| A marca é gravada no evento e sobrevive ao fechamento | Arquivo do evento lido do disco pelo arnês (`LedgerReader`), com `viewedAt` presente |
| Marcar é idempotente e não mexe no resto do evento | Teste de unidade do ledger |
| O lote é derivado: com uma alteração pendente o lote é novo; com todas vistas, não | Teste de unidade da função pura de resumo e do serviço |
| A linha diz que a alteração é nova | Teste de unidade de `timelineRows` |
| O selo some ao ir até a alteração, e o contador do título cai | Cenário T-0012 no arnês, no app de verdade |
| Nada disso quebra o que já existia | Suíte inteira do `changeLedger` e do `watchCode`, `typecheck`, `eslint`, checagem de camadas e arnês completo |

## 9. Critérios de aceite

1. `ChangeEvent` tem `viewedAt` opcional, documentado em português; evento sem o campo é alteração nova.
2. O ledger grava a marca no arquivo do próprio evento, sem tocar em hash, linhas, instante, sessão ou status.
3. Marcar duas vezes a mesma alteração não gera segunda escrita e devolve o mesmo instante.
4. A função de resumo acerta os quatro números (alterações, alterações novas, lotes, lotes novos) com lista vazia, com um lote e com vários.
5. Lote com **todas** as alterações vistas não conta como novo; com **uma** pendente, conta.
6. O serviço de timeline avisa quem observa quando uma alteração é marcada.
7. A lista mostra o ponto nas alterações novas e nenhum ponto nas visualizadas.
8. Ir até uma alteração nova (F5, clique, setas, Enter ou duplo clique) apaga o ponto dela.
9. Ir até uma alteração que já era visualizada não regrava nada.
10. O título da view mostra a contagem de lotes com alteração nova e some quando não há nenhuma.
11. Nenhuma alteração gravada pelo produto muda de `current`/`history` por causa da marca.
12. T-0012 registrado em `testes-manuais.md` com objetivo, pré-condições, passos, resultado esperado, resultado obtido e situação, executado de fato no arnês.
13. `npm run typecheck-client`, `npx eslint` nos arquivos tocados, `npm run valid-layers-check` e a suíte de unidade saem verdes, com as contagens novas anotadas no `overview.md`.
14. O arnês inteiro passa, com o log do produto sem erro nem aviso.
