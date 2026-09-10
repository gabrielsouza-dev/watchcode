# Plano — E1-T6 · Fechamento da E1

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T6 — Fechamento da E1 |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Entrada | Backlog da E1 em @docs/watch-code/Workflow/overview.md §6 |
| Saída | Este plano → @docs/watch-code/SPECS/e1-t6-fechamento-da-e1.md |

## 1. Objetivo

Provar, no aplicativo de verdade, que a captura por disco da E1 fecha o ciclo:
com a observação ligada, um script externo — **sem agente nenhum** — altera
arquivos do workspace e cada alteração vira um evento no ledger, com antes e
depois corretos.

Em uma frase: **o núcleo da E1 deixa de ter só teste de unidade e passa a ter
prova de ponta a ponta.**

O app é a metade que nenhum teste cobre hoje. Todos os 92 testes do módulo rodam
sobre o `InMemoryFileSystemProvider`: nenhum deles toca o disco, o watcher nativo
ou a montagem do workbench. É exatamente essa metade que a E1-T6 coloca à prova.

## 2. Escopo

### Entra

1. **Estímulo** — um script Node, sem dependências, sem agente e sem IDE, que
   altera arquivos do workspace seguindo uma sequência declarada. Ele escreve
   também a **expectativa**: o que fez, quando fez e o hash do conteúdo de cada
   escrita, num JSON que o verificador usa como referência.
2. **Cobertura mínima do estímulo** — os sete casos que juntos exercitam todo o
   comportamento contratado na E1:

   | # | Caso | O que prova |
   | --- | --- | --- |
   | 1 | Alterar arquivo versionado | O "antes" vem do git `HEAD` |
   | 2 | Criar arquivo novo | Sem "antes" o evento nasce parcial, como projetado |
   | 3 | Alterar de novo o arquivo criado | O "antes" vem da sombra: a cadeia continua |
   | 4 | Remover arquivo | O evento registra a saída, sem "depois" |
   | 5 | Rajada de escritas dentro da pausa | Agrupamento: uma sessão só |
   | 6 | Escrita depois da pausa de 1500 ms | Agrupamento: sessão nova |
   | 7 | Escrita em caminho ignorado (`node_modules/`) | Ruído não vira evento |

3. **Verificador** — um script Node que encontra a pasta do workspace dentro do
   perfil, lê o ledger (`events/`, `index/`, `snapshots/`) e checa as invariantes
   do §8, comparando com a expectativa declarada pelo estímulo. Devolve veredito
   e um resumo legível.
4. **Executor** — um script PowerShell que prepara a pasta de trabalho e o perfil
   isolado, confere o frescor do `out/`, abre o app, roda o estímulo, espera o
   ledger estabilizar, fecha o app pela linha de comando do próprio perfil e roda
   o verificador. Sem intervenção manual.
5. **Documentação curta do arnês** — como executar, o que ele cria e o que ele
   deixa para trás.
6. **Evidência de execução real** — a saída do executor e do verificador,
   registrada no relatório da tarefa e no §8 do overview.
7. **Correção do que a execução revelar** — condicionada à decisão D3.

### Não entra

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Levar o caso para o `npm run test-node` (teste com disco e watcher nativo) | Watcher nativo em teste de unidade é instável e não prova o app montado, que é justamente o que falta | E5 (robustez) |
| Verificação visual do comando e do indicador | É o T-0004, da E1-T5; segue manual | E1-T5 / T-0004 |
| Varredura de recuperação ao religar a observação | Não está no backlog e mudaria o custo do `start()` | — |
| Lista de ignorados configurável e ruído de escrita em massa | Fora do escopo da E1 | E5-T3 |
| Timeline na interface | A E1 prova o ledger; quem mostra é a E2 | E2-T2 |
| Hook do agente | Canal independente da captura por disco | E6 |

## 3. Contexto

O que já existe e é exercitado por esta tarefa:

| Arquivo | Papel na prova |
| --- | --- |
| `src/vs/platform/changeLedger/common/workspaceWatcherService.ts` | Liga o watcher recursivo das pastas e entrega cada alteração ao recorder |
| `src/vs/platform/changeLedger/common/sessionGrouper.ts` | Agrupa por pausa (`DEFAULT_PAUSE_MS = 1500`) — os casos 5 e 6 do estímulo |
| `src/vs/platform/changeLedger/common/ignoredPaths.ts` | Descarta ruído por segmento de caminho — o caso 7 |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | Resolve o "antes", guarda o "depois" e grava o evento |
| `src/vs/platform/changeLedger/common/baseline.ts` | Ordem do "antes": git, depois sombra, depois ausência — os casos 1 a 4 |
| `src/vs/workbench/services/changeLedger/electron-browser/gitHeadReader.ts` | A leitura real no `HEAD`, com a raiz do repositório descoberta uma vez |
| `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts` | A montagem do workbench: singletons, recorder com o leitor do git e o `start()` no `AfterRestored` |
| `src/vs/workbench/contrib/watchCode/browser/observationControl.contribution.ts` | O liga/desliga da E1-T5, que nasce ligado |

Fluxo que a execução percorre, inteiro, sem simulação:

```
escrita externa no disco
  -> fileService.watch(folder, { recursive: true })
  -> WorkspaceWatcherService.onFilesChange   (ignora ruído, atribui a pasta)
  -> SessionGrouper.sessionFor               (agrupa por pausa)
  -> ChangeRecorderService.recordChange      (o antes vem do git ou da sombra)
  -> ChangeLedgerService.record              (grava evento, índice e rebaixa o anterior)
  -> <perfil>/User/workspaceStorage/<id>/changeLedger/{events,index,snapshots,shadow}
```

Dois pontos que definem o formato da prova:

- O ledger mora no **armazenamento do editor**, não dentro do workspace observado.
  Isso mantém o repositório limpo e impede que o observador reaja às próprias
  escritas — não há laço de realimentação a temer.
- O `beforeHash` do primeiro evento de um arquivo novo é **legitimamente ausente**:
  sem git e sem sombra não há "antes". O verificador precisa tratar isso como
  acerto, não como falha. Uma alteração só é "sem antes" quando realmente não
  havia conteúdo anterior observável.

## 4. Dependências

- **Tarefas:** E1-T1 a E1-T5 concluídas (contratos, ledger, baseline, watcher,
  controle de observação). A E1-T6 é a última da etapa; a **E2-T1 depende dela**.
- **Ambiente:** Node 24 (`.nvmrc`), `git` no PATH para o baseline do `HEAD`,
  `.build/electron/Code - OSS.exe` presente e `out/` compilado a partir do
  código atual.
- **Escrita:** nada é escrito no workspace do desenvolvedor. O executor cria a
  pasta de trabalho, o repositório git de teste e o perfil isolado dentro de
  `%TEMP%`.

## 5. Etapas

1. **Estímulo** (`write-changes.mjs`): recebe a pasta do workspace e executa a
   sequência do §2.2 com os intervalos que ela exige — ≥ 300 ms entre escritas no
   mesmo arquivo (para o watcher não coalescer) e > 1500 ms onde o caso pede
   sessão nova. Ao final, grava o JSON de expectativa com, para cada escrita:
   caminho relativo, tipo, instante e hash do conteúdo.
2. **Verificador** (`verify-ledger.mjs`): localiza a pasta do workspace no perfil
   (comparando `workspace.json` de cada `workspaceStorage/*`), lê os eventos, o
   índice e os snapshots, aplica as invariantes do §8 contra a expectativa e
   imprime um veredito por invariante. Sai com código diferente de zero na
   primeira falha.
3. **Executor** (`run-e2e.ps1`):
   - prepara `%TEMP%/watchcode-e2e`: pasta do workspace com um repositório git de
     teste (arquivo versionado, commit inicial), pasta de expectativa e perfil
     isolado próprio;
   - confere que `out/` é mais novo que o `src/` mais recente e aborta com o
     comando a rodar quando não for;
   - abre o app apontando para a pasta de teste, com `--user-data-dir` próprio;
   - espera o armazenamento do workspace aparecer e mais alguns segundos de
     acomodação;
   - roda o estímulo;
   - espera o ledger estabilizar (nenhum evento novo por alguns segundos);
   - fecha o app pelos processos cuja linha de comando cite o perfil do e2e;
   - roda o verificador e devolve o veredito.
4. **Execução real**: rodar o executor, guardar a saída e o dump resumido do
   ledger como evidência.
5. **Correção**: se alguma invariante falhar, corrigir a causa na E1 (ver D3) e
   reexecutar até o veredito ser positivo.
6. **Validação do repositório**: `npx tsc --noEmit -p src/tsconfig.json`,
   `npm run valid-layers-check`, `npm run test-node -- --runGlob
   "**/changeLedger/test/common/*.test.js"` (92 testes devem continuar passando)
   e `node --experimental-strip-types build/hygiene.ts` nos arquivos versionados.
7. **Fechamento documental**: `overview.md` com a E1-T6 em `feito` e a etapa E1
   fechada; `testes-manuais.md` só muda se a execução criar teste manual novo
   (o arnês automatizado não é teste manual).

## 6. Riscos e impactos

| Risco | Probabilidade | Mitigação |
| --- | --- | --- |
| O watcher nativo nunca foi exercitado em disco real e pode simplesmente não disparar | Média | É o risco que a tarefa existe para eliminar. Se não disparar, a causa é investigada e corrigida na própria E1-T6 (D3) |
| Diferença de caixa entre o caminho que o watcher reporta e a URI da pasta do workspace | Média | O executor passa a pasta já normalizada. Se ainda assim falhar, `isEqualOrParent` cai para comparação sem caixa no Windows — correção no produto, registrada |
| Duas escritas próximas no mesmo arquivo chegarem coalescidas num evento só | Média | O estímulo separa por ≥ 300 ms, acima do coalescimento e abaixo da pausa de 1500 ms |
| `fileService.watch` com `excludes: []` observar um repositório grande (o do fork tem centenas de milhares de arquivos) | Alta se o alvo fosse o fork | A pasta de teste é pequena e descartável; o caso pesado é ruído de escrita em massa, tratado na E5-T3 |
| O app ficar aberto ou sobrar processo depois da execução | Média | O executor fecha pelos processos cuja linha de comando cite o perfil do e2e, e não por nome de imagem |
| O `out/` estar desatualizado e a prova valer para código antigo | Média | A checagem de frescor é obrigatória antes de abrir o app |
| Cache da raiz do git feito antes de o repositório existir | Baixa | O repositório de teste é criado e commitado **antes** de o app abrir |

**Impacto no produto:** se as invariantes passarem, nenhum arquivo de `src/` muda
— a E1-T6 acrescenta arnês e evidência. Se falharem, a correção é no módulo
`changeLedger`, sem mudança de contrato público e sem dependência nova.

## 7. Decisões pendentes

**D1 — Onde mora o arnês do teste ponta a ponta?**

> **Aprovada: A.** O arnês fica permanente em `docs/watch-code/e2e/`.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Permanente em `docs/watch-code/e2e/`, versionado. Todos os fechamentos seguintes (E2-T5, E3-T5, E4-T6, E6-T3) reusam o mesmo estímulo: o guia chama essa validação de "ponta a ponta universal", ou seja, é um instrumento do projeto, não um arquivo de ocasião |
| B | Descartável: roda uma vez, a evidência vai para o relatório e os scripts são apagados, seguindo a regra de limpar arquivos temporários |

**D2 — O ponta a ponta é executado por um executor automatizado?**

> **Aprovada: A.** O executor abre o app em perfil isolado próprio e conduz a
> execução inteira, sem intervenção manual.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Executor em PowerShell que abre o app num perfil isolado próprio, roda o estímulo, fecha e verifica. Deixa a prova repetível e executa uma janela do app na sua máquina durante a tarefa |
| B | Só o estímulo e o verificador; abrir o app, rodar e fechar fica na mão de quem executa, com o registro em `testes-manuais.md`. Nada abre sozinho, mas a E1 fecha com um teste pendente |

**D3 — O que fazer se a execução revelar defeito no núcleo da E1?**

> **Aprovada: A.** O defeito é corrigido dentro da própria E1-T6, com registro
> da causa e da correção.

| Opção | O que é |
| --- | --- |
| **A (recomendada)** | Corrigir dentro da própria E1-T6, registrando o defeito, a causa e a correção. A E2 depende da E1 inteira: abrir uma tarefa nova no meio da etapa adia a E2 por um ciclo completo de workflow |
| B | Registrar o defeito e abrir `E1-T7` no backlog, deixando a E1-T6 apenas como validação |

## 8. Critérios de aceite

1. Existe um estímulo Node que altera arquivos do workspace sem agente nenhum.
2. Existe um verificador que lê o ledger do perfil e confere as invariantes.
3. Existe um executor que prepara, abre, estimula, fecha e verifica sem
   intervenção manual.
4. Os sete casos do §2.2 passam numa execução real, com a saída registrada como
   evidência.
5. Todo `afterHash` gravado corresponde ao hash do conteúdo real daquela escrita,
   e todo `beforeHash` ao conteúdo anterior — conferidos na cadeia do mesmo
   arquivo e contra o store de snapshots.
6. Só o último evento de cada arquivo está `current`; os anteriores estão
   `history`.
7. Caminho ignorado não gera evento.
8. Escritas dentro da pausa compartilham a sessão; escritas separadas pela pausa
   não.
9. Um arquivo novo tem o primeiro evento sem "antes" — parcial por ausência real,
   não por falha.
10. Remoção gera evento sem "depois".
11. Os 92 testes do módulo continuam passando, e `tsc`, `valid-layers-check` e
    `hygiene` passam.
12. O backlog marca a E1-T6 como `feito` e a etapa E1 como fechada.
13. Nenhum arquivo é alterado fora da lista do §5 — a menos que uma correção de
    D3 exija, e nesse caso ela está registrada.

