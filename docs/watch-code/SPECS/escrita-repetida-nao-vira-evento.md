# SPEC — Escrita repetida não vira evento

| Campo | Valor |
| --- | --- |
| Tarefa | Correção do defeito aberto em `docs/watch-code/testes-manuais.md` |
| Workflow | Medium — `SpecWriter → Developer → Reporter` |
| Origem | Testes manuais T-0001, T-0002 e T-0003, reprovados em 10/09/2026 |
| Módulo | `src/vs/platform/changeLedger` |
| Decisão aprovada | Opção 2: descarte no recorder, comparando conteúdo |

## 1. Objetivo

Uma entrega repetida do sistema de arquivos — a mesma alteração chegando mais de
uma vez — não pode virar dois eventos. O recorder passa a **não registrar** quando
o conteúdo do arquivo no disco é exatamente o do último evento gravado para
aquele arquivo, e devolve o evento que já representa esse estado.

## 2. Contexto

O defeito está descrito e comprovado em `docs/watch-code/testes-manuais.md`, seção
**Defeito aberto — uma escrita vira dois eventos**. Em resumo:

- a raiz do workspace é observada **duas vezes**: uma pelo nosso watcher recursivo
  (E1-T4) e outra pelo localizador de `AGENTS.md`/`CLAUDE.md` do chat, que observa
  a raiz **sem recursão** para enxergar os arquivos da raiz;
- uma observação não recursiva de uma pasta acompanha os **filhos diretos** dela;
- a coalescência que existe hoje no watcher só junta o que vem **dentro** de um
  lote, então os dois lotes viram dois `recordChange` e, sem esta correção, dois
  eventos: um deles rebaixado para `history` no mesmo instante, o outro fora do
  índice.

A causa é de fora do nosso código e não se corrige por lá: o `IFileService` não
oferece observador correlacionado recursivo (`createWatcher` só aceita
`recursive: false`). Quem consome `onDidFilesChange` precisa tolerar a entrega
repetida — e é isso que esta correção faz.

## 3. Escopo

**Entra**

- O descarte, no recorder, de uma alteração cujo conteúdo é igual ao do último
  evento gravado **para o mesmo arquivo**, incluindo a remoção repetida.
- Testes de unidade que travam esse comportamento e os casos de borda do §6.

**Não entra**

- Mudar a assinatura de `IChangeRecorderService.recordChange` — ela continua
  devolvendo `Promise<ChangeEvent>`.
- Mexer no watcher, no serviço de arquivos ou no localizador de prompts do chat.
- Persistir o estado do descarte: ele vive em memória, dentro do recorder.
- Descartar por janela de tempo, por `mtime` ou por tamanho: o critério é conteúdo.
- Limpar o histórico de duplicados já gravado por execuções anteriores.

## 4. Comportamento esperado

Para cada chamada de `recordChange`:

1. O conteúdo do arquivo é lido (removida a exceção da remoção, que não lê nada) e
   endereçado no store de snapshots, como hoje.
2. Se **já existe** um evento anterior registrado por este recorder para o mesmo
   arquivo e o `afterHash` dele é igual ao de agora, **nada é gravado** e a chamada
   devolve aquele evento.
3. Caso contrário, o fluxo de hoje segue inteiro: resolve o "antes", grava o
   evento, atualiza a sombra — e o estado deste arquivo passa a ser o evento novo.

A comparação é por `afterHash`, e `undefined` é um valor válido dela: duas
notificações da remoção do mesmo arquivo têm as duas `afterHash` ausente e a
segunda é descartada.

## 5. Contratos

Nenhuma interface muda. O que muda é a **semântica documentada** de `recordChange`,
que passa a valer como "registra a alteração **se houver alteração**".

| Símbolo | Antes | Depois |
| --- | --- | --- |
| `IChangeRecorderService.recordChange` | grava sempre e devolve o evento gravado | grava só quando o conteúdo mudou; devolve o evento gravado ou o que já representa o estado atual |

O único consumidor de produção é `WorkspaceWatcherService.record()`, que ignora o
valor devolvido — a mudança é invisível para ele.

## 6. Casos de borda e tratamento de erro

| Caso | Comportamento |
| --- | --- |
| B1 — primeira alteração de um arquivo | Grava: não há evento anterior para comparar. |
| B2 — conteúdo igual ao do último evento | Descarta e devolve o evento anterior; o ledger continua com um evento só. |
| B3 — remoção repetida | Descarta: `afterHash` ausente nos dois lados da comparação. |
| B4 — remoção depois de uma alteração | Grava: `afterHash` ausente é diferente de um hash. |
| B5 — arquivo removido que volta com o conteúdo de antes | Grava: o último evento era a remoção, cujo `afterHash` é ausente. |
| B6 — A → B → A | Grava os três: cada passo tem conteúdo diferente do evento imediatamente anterior. |
| B7 — mesmo caminho relativo em pastas diferentes do workspace | São arquivos diferentes: a chave do descarte é o recurso completo (pasta + caminho), não o caminho relativo. |
| B8 — arquivo ilegível | Continua rejeitando, como hoje; nada é descartado nem gravado. |
| B9 — reinscrição da observação (`stop()`/`start()`) | O estado do descarte é do recorder, não do watcher: sobrevive à reinscrição. Conteúdo igual continua descartado — o ledger não conhece alteração nenhuma nesse meio-tempo. |
| B10 — repetição depois de reiniciar o app | É gravada: o estado vive em memória. Limitação aceita e registrada no §10. |
| B11 — duas entregas quase simultâneas da mesma escrita | Uma fila por arquivo garante que a segunda só decida depois de a primeira ter gravado: ela encontra o evento no mapa e é descartada. Sem a fila as duas leem o mapa antes de qualquer gravação e as duas entram. |

## 7. Alterações necessárias

### 7.1 `src/vs/platform/changeLedger/common/changeRecorderService.ts`

- Novo campo privado: mapa do recurso observado para o último evento gravado por
  este recorder (`Map<string, ChangeEvent>`, chave `resource.toString()`).
- `recordChange` passa a **enfileirar por arquivo**: a chamada seguinte daquele
  arquivo só decide depois de a anterior terminar. É o que faz o descarte valer
  quando as duas entregas chegam juntas (caso B11).
- O corpo do registro sai para um método privado, chamado pela fila, e é ali que a
  comparação acontece: depois de calcular o `afterHash` e antes de resolver o
  "antes", comparar com o evento guardado e devolvê-lo quando o `afterHash` for
  igual.
- Guardar o evento recém-gravado no mapa, no fim da chamada.
- Comentário em português explicando por que o descarte existe (entrega repetida do
  sistema de arquivos, mesma alteração em dois lotes).
- O bloco de documentação de `recordChange` na interface passa a registrar a regra.

Nada mais no arquivo muda: a ordem de leitura do arquivo, o store de snapshots, a
resolução do baseline e a atualização da sombra continuam iguais.

### 7.2 `src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts`

- Casos novos: B2, B3, B6, B7 e B11 do §6.
- Nenhum teste existente muda: todos usam conteúdos diferentes entre chamadas.

## 8. Validação esperada

| O que | Como |
| --- | --- |
| Tipos | `npx tsc --noEmit -p src/tsconfig.json` sem erro novo |
| Unidade | `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` — todos passando, com os casos novos |
| Estilo | `npx eslint` nos arquivos tocados, sem erro |
| Higiene | `node --experimental-strip-types build/hygiene.ts` com os arquivos no índice |
| Ponta a ponta | `npm run compile-client` e `node --experimental-strip-types docs/watch-code/e2e/run-e2e.ts` — continua com 7 eventos, ou seja, a correção não engole alteração de verdade |
| Testes manuais | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts` — **T-0001, T-0002 e T-0003 passam** |

## 9. Critérios de aceite

1. `T-0001`, `T-0002` e `T-0003` passam no executor dos testes manuais, com a
   contagem de eventos batendo com o que cada teste espera.
2. O teste ponta a ponta continua passando com 7 eventos.
3. Os casos B2, B3, B6, B7 e B11 têm teste de unidade, e o módulo inteiro fica verde.
4. `recordChange` mantém a assinatura e continua rejeitando quando o arquivo não
   pode ser lido.
5. `tsc`, `eslint` e a higiene ficam sem erro novo.

## 10. Limitações aceitas

- **Repetição depois de reiniciar o app é gravada.** O estado do descarte é de
  memória; não há leitura do histórico para decidir. As entregas repetidas que
  motivaram esta correção acontecem milissegundos depois da primeira, dentro do
  mesmo processo, então o caso não é afetado.
- **O critério é o conteúdo do arquivo no disco.** Uma escrita que só mexe em
  `mtime`, sem mudar byte nenhum, deixa de virar evento — que é o comportamento
  desejado: não houve alteração a mostrar.
- O histórico duplicado de execuções anteriores permanece no perfil; limpar isso
  é assunto de manutenção do ledger, não desta correção.
