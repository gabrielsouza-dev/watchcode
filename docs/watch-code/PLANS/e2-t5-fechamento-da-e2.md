# Plano — E2-T5 · Fechamento da E2

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T5 — Fechamento da E2 |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E2 em `docs/watch-code/Workflow/overview.md` §6 |
| Saída | Este plano → `docs/watch-code/SPECS/e2-t5-fechamento-da-e2.md` |

## 1. Objetivo

Provar, no aplicativo de verdade, que a E2 fecha o ciclo: um script externo —
sem agente nenhum — produz uma **sessão inteira** de alterações no workspace, a
linha do tempo mostra essas alterações na ordem certa e o desenvolvedor
**percorre a sessão do começo ao fim**, com o arquivo e a linha certos a cada passo.

Em uma frase: **a linha do tempo deixa de ter só teste de unidade e teste de
salto isolado, e passa a ter a prova de que a sessão inteira é navegável.**

O que falta hoje não é código: é a travessia. O T-0008 provou cada **gesto** do
salto (F5, clique, seta, Enter, duplo clique) num workspace de dois arquivos e
poucos eventos, e o `run-e2e.ts` provou o **ledger** no disco, sem interface.
Ninguém ainda percorreu uma sessão do primeiro ao último evento conferindo que o
painel diz a mesma coisa que o disco.

## 2. Escopo

### Entra

1. **Estímulo de sessão** — um cenário que cria, com o app já aberto, uma sessão
   de alterações em vários arquivos, com extensões de código reais (`.ts`, `.js`
   e `.cs`), dentro da janela de agrupamento (`DEFAULT_PAUSE_MS = 1500`) para que
   tudo caia numa sessão só.
2. **Conferência painel × disco** — as linhas desenhadas são comparadas, uma a
   uma e na mesma ordem, com os eventos do ledger lidos do perfil: nome do
   arquivo, faixa de linhas, hora e origem. É a invariante "o painel não mente".
3. **Travessia completa** — **F5** do primeiro ao último evento da sessão, com o
   editor caindo no arquivo e na linha certos a cada passo, e **Shift+F5** de
   volta até o primeiro.
4. **Segunda sessão ao vivo** — depois da pausa de agrupamento, uma escrita nova
   no mesmo app: as linhas novas entram na lista sem apagar nem reordenar as
   antigas, o evento anterior daquele arquivo passa a `history` no ledger e
   continua navegável.
5. **Remoção dentro da sessão** — o evento de arquivo removido é percorrido como
   qualquer outro e avisa em vez de abrir.
6. **Evidência real** — a saída do cenário, com o veredito, registrada no
   relatório, em `docs/watch-code/testes-manuais.md` e no §6 do `overview.md`.
7. **Correção do que a execução revelar** — condicionada à decisão D3.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Selo de novo/visualizado na linha | É o próximo item da etapa; a linha de hoje não mostra `status` nenhum | E2-T6 |
| Decoração nos arquivos do Explorer | Não é sobre percorrer a sessão | E2-T7 |
| Filtro "só o que mudou" (F7) | Idem | E2-T8 |
| Comandos de apoio (`newest`/`oldest`, `focus`, `filterByActiveFile`) | O filtro por arquivo existe só como API do serviço, sem gatilho na interface | E8-T3 |
| Diff, hunks e cores | A travessia prova navegação, não comparação | E3 |
| Aviso para a entrada `history` cujo trecho já não existe | Decisão D7 já aprovada: o aviso é da E5-T1 | E5-T1 |
| Hook do agente | Canal independente da captura por disco | E6 |

## 3. Contexto

O que a E2 entregou e o que esta tarefa exercita junto, pela primeira vez:

| Peça | Papel na prova |
| --- | --- |
| `platform/changeLedger/common/timelineService.ts` | Ordena cronologicamente e deriva `current`/`history` por arquivo (E2-T1) |
| `workbench/contrib/watchCode/browser/timelineView.ts` | A lista, dentro do Explorer: monta as linhas, acompanha a gravação ao vivo e guarda o evento ativo (E2-T2) |
| `workbench/contrib/watchCode/common/timelineRows.ts` | Converte o evento em linha: nome, pasta, faixa de linhas, hora e origem |
| `.../common/timelineNavigation.ts` + `timelineNavigation.contribution.ts` | `stepActiveId` e as teclas **F5** e **Shift+F5** (E2-T3) |
| `.../common/changeReveal.ts` + `timelineView.reveal` | Abre o arquivo, seleciona a faixa e centraliza (E2-T4) |
| `docs/watch-code/e2e/run-manual-tests.ts` | O arnês que abre o app com Playwright, em perfil isolado, e lê o ledger do disco |

Três fatos do código atual que definem o formato da prova:

- A lista **só acrescenta**: `append()` insere no fim, e não reordena nem remove
  nada. Se o painel divergir da ordem do ledger, é aqui que aparece — e é
  exatamente o que a conferência do §2.2 pega.
- A lista é **virtualizada** (`TIMELINE_ROW_HEIGHT = 44`): só algumas linhas
  existem no DOM por vez. A conferência e a travessia precisam andar pela lista,
  não pedir a linha *n* do DOM — lição que o T-0008 pagou.
- O `status` derivado **não é desenhado** hoje. Provar `current`/`history` na
  interface, nesta tarefa, é provar que a entrada antiga continua na lista e
  continua navegável depois de o arquivo mudar de novo.

Fluxo que a execução percorre, inteiro, sem simulação:

```
escrita externa no disco
  -> watcher -> agrupador -> recorder -> ledger  (E1, já provado pelo run-e2e.ts)
  -> TimelineService.onDidChange -> timelineView.append -> lista no Explorer
  -> F5 / Shift+F5 -> setActiveEvent -> reveal -> arquivo aberto na linha certa
```

## 4. Dependências

- **Tarefas:** E2-T1 a E2-T4 concluídas. A E3-T1 depende desta.
- **Ambiente:** Node 24, `git` no PATH (o "antes" vem do `HEAD`),
- `.build/electron/Code - OSS.exe` presente e `out/` compilado a partir do código
  atual — `assertFreshBuild()` aborta dizendo o comando quando estiver velho.
- **Escrita:** nada é escrito no workspace do desenvolvedor. A pasta de trabalho e
  o perfil isolado nascem em `%TEMP%`.

## 5. Etapas

1. **Cenário de sessão** no arnês de testes manuais: prepara o workspace com git e
   commit inicial, com os arquivos-alvo nas três extensões; abre o app em perfil
   isolado; aquece a observação como os outros cenários fazem; escreve a sessão de
   uma vez, dentro da janela de agrupamento.
2. **Espera pelo painel**: a lista precisa mostrar tantas linhas quantos eventos o
   ledger tiver. A espera é pelo **ledger** (fonte de verdade), e depois pela lista
   alcançar a mesma contagem.
3. **Conferência painel × disco**: lê os eventos do ledger e as linhas desenhadas e
   compara nome, faixa de linhas, hora e origem, uma a uma, na ordem.
4. **Travessia de ida**: **F5** até o último evento, conferindo a cada passo o
   arquivo ativo e a posição do cursor; a remoção avisa em vez de abrir.
5. **Travessia de volta**: **Shift+F5** até o primeiro evento, conferindo que a
   ordem se mantém.
6. **Segunda sessão**: escrita nova depois da pausa; conferir o acréscimo ao vivo, a
   contagem nova no painel, o evento anterior do arquivo como `history` no ledger e
   o salto até ele ainda funcionando.
7. **Registro**: cenário em `docs/watch-code/testes-manuais.md` (T-0010, conforme
   D1), com objetivo, pré-condições, passos, resultado esperado e o resultado
   obtido verbatim; parágrafo "Provado na E2-T5" no §6 do `overview.md`; E2-T5
   marcada como `feito` e a etapa E2 fechada.
8. **Validação do repositório**: `npm run typecheck-client`, `npm run test-node --
   --runGlob "**/{changeLedger,watchCode}/test/**/*.test.js"` (164 casos devem
   continuar passando), `npx eslint` nos arquivos tocados, `npm run
   valid-layers-check` e `node --experimental-strip-types build/hygiene.ts`.
9. **Correção**: se a execução revelar defeito, corrigir na própria E2-T5 (D3) e
   reexecutar até o veredito ser positivo.

## 6. Riscos e impactos

| Risco | Probabilidade | Mitigação |
| --- | --- | --- |
| A lista ser virtualizada e a conferência linha a linha medir o DOM errado | Alta | Andar pela lista com o teclado, como o T-0008 já faz, e comparar sempre pela janela visível |
| As escritas da sessão caírem em sessões diferentes | Média | Escrever dentro da janela de 1500 ms do agrupador e conferir a partição no ledger antes de atravessar |
| A ordem do painel divergir da ordem do ledger | Média | É um dos objetivos da tarefa: se divergir, é defeito real a corrigir (D3) |
| O app ser fechado com notificação pendente e a travessia medir a janela errada | Baixa | Esperar a notificação pelo texto e não pelo contador, como o T-0008 |
| A janela não desenhar quadros o tempo todo e a medida envelhecer | Média | Medir sempre por cursor da barra de rolagem e por `status.editor.selection`, nunca por número de linha desenhado na margem |
| O `out/` estar velho e a prova valer para código antigo | Baixa | `assertFreshBuild()` já aborta com o comando a rodar |

**Impacto no produto:** se tudo passar, nenhum arquivo de `src/` muda — a tarefa
acrescenta cenário e evidência. Se algo falhar, a correção é no módulo
`watchCode` ou no serviço de timeline, sem contrato novo.

## 7. Decisões pendentes

**D1 — Onde mora a prova da E2?**

> **Aprovada: A.** Cenário novo T-0010 no arnês de testes manuais.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Cenário novo **T-0010** no arnês de testes manuais (`run-manual-tests.ts`), registrado em `testes-manuais.md`. A prova olha a interface, que é onde a E2 vive, e reusa o que já existe: perfil isolado, Playwright, `LedgerReader` e os ajudantes de lista e de editor |
| B | Executor novo, irmão do `run-e2e.ts`, com estímulo e verificador próprios. Separa as duas provas, mas duplica a abertura do app em perfil isolado e obriga a refazer a ligação com a interface |
| C | Estender o T-0008 com mais arquivos e mais eventos. Mistura dois cenários num só, e o T-0008 já está aprovado e fechado com cinco execuções no histórico |

**D2 — O que a sessão percorrida contém?**

> **Aprovada: A.** 4 arquivos, 6 eventos numa sessão, mais a segunda sessão.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | 4 arquivos nas três extensões (`.ts`, `.js`, `.cs`, mais um `.ts` em subpasta), 6 eventos numa sessão — criação, alterações e uma remoção — mais a segunda sessão do §2.4. Cobre o painel com mais linhas do que cabem na área visível, que é o caso real |
| B | 3 arquivos e 4 eventos, sem remoção e sem segunda sessão. Mais curto, mas não exercita a virtualização nem a transição `current` → `history` |

**D3 — O que fazer se a execução revelar defeito?**

> **Aprovada: A.** O defeito é corrigido dentro da própria E2-T5, com registro da causa e da correção.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Corrigir dentro da própria E2-T5, registrando o defeito, a causa e a correção. Mesma regra que a E1-T6 adotou |
| B | Registrar o defeito e abrir `E2-T9` no backlog, deixando a E2-T5 apenas como validação |

**D4 — A pendência do T-0008 entra na prova?**

> **Aprovada: A.** A segunda sessão encurta o arquivo e a travessia exercita o caso.

(Entrada `history` que aponta para linhas que já não existem: o salto para na última
linha do arquivo, **sem aviso** — o aviso é da E5-T1, por decisão D7.)

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | A segunda sessão encurta o arquivo de propósito, e a travessia exercita o caso: registra o comportamento atual como pendência aceita, com a E5-T1 dona do aviso |
| B | Não exercitar: a pendência continua só registrada, sem prova de como se comporta hoje |

**D5 — O arquivo de aquecimento do arnês.**

> **Aprovada: A.** `aquecimento.txt` vira `aquecimento.ts` nesta tarefa.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Trocar `aquecimento.txt` por `aquecimento.ts` nesta tarefa, alinhando o arnês à regra de extensões de código. O arquivo é escrito e conferido em toda execução, e a troca vale para todos os cenários |
| B | Deixar `.txt`: é sonda de aquecimento, não fixture de cenário, e a regra do `CLAUDE.md` não o alcança |

## 8. Critérios de aceite

1. Existe um cenário que produz uma sessão inteira de alterações com o app aberto,
   em arquivos `.ts`, `.js` e `.cs`.
2. As linhas do painel conferem com os eventos do ledger, uma a uma e na mesma
   ordem — nome, faixa de linhas, hora e origem.
3. **F5** percorre a sessão do primeiro ao último evento, com o editor no arquivo e
   na linha alterada a cada passo.
4. **Shift+F5** volta até o primeiro evento, na ordem inversa.
5. A remoção dentro da sessão é percorrida e avisa em vez de abrir.
6. A segunda sessão acrescenta linhas ao vivo, sem apagar nem reordenar as
   anteriores, e o evento anterior daquele arquivo fica `history` e navegável.
7. A execução real acontece, com a saída registrada como evidência.
8. `typecheck-client`, a suíte dos dois módulos, `eslint`, `valid-layers-check` e
   `hygiene` passam.
9. O backlog marca a E2-T5 como `feito`, com a etapa E2 fechada.
10. Nenhum arquivo é alterado fora da lista do §5 — a menos que uma correção de D3
    exija, e nesse caso ela está registrada.
