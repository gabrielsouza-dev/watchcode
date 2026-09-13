# Plano — E3-T2 · Documentos virtuais

**Tarefa:** E3-T2 — Documentos virtuais (`docs/watch-code/Workflow/overview.md:397`)
**Workflow:** High (implementação: esquema de URI novo e um provedor de sistema de arquivos no produto)
**Depende de:** E3-T1 (feito) — e, pela cadeia, E2-T4/T5 e E1-T2

## 1. Objetivo

Dar ao produto dois documentos virtuais **somente leitura** — `aih-before:` e `aih-after:` — que
servem o conteúdo dos snapshots que o ledger já guarda, para que a E3-T3 possa abrir o antes e o
depois no editor de diff.

## 2. Escopo

**Dentro:**

1. O contrato de URI dos dois esquemas: como se monta e como se lê — o caminho espelha o arquivo
   do workspace e a consulta carrega o hash do snapshot.
2. Um ajudante puro que, dado um evento, devolve o documento de um lado — ou `undefined` quando
   aquele lado não existe (evento parcial, arquivo removido).
3. O provedor de sistema de arquivos que serve os bytes do snapshot, registrado nos dois esquemas.
4. Somente leitura de verdade: o editor nasce travado e a escrita é recusada pelo próprio serviço
   de arquivos.
5. Testes de unidade do contrato e do provedor — este último lido **pelo serviço de arquivos**,
   que é o caminho do editor.
6. Teste manual T-0016 no arnês: o app aberto mostra o antes e o depois do evento em editores
   somente leitura, com o conteúdo exato dos snapshots.

**Fora:**

1. Abrir o diff, colorir linhas, gutter e visão geral (E3-T3) e os modos de visualização (E3-T4).
   Esta tarefa **serve o conteúdo**; quem o mostra é a tarefa seguinte.
2. Comando, menu, clique na linha do tempo ou qualquer superfície nova no produto.
3. Rótulo de lado ("antes"/"depois") na aba ou no diff: é decisão de quem abre, pelo `label` do
   input do editor (`platform/editor/common/editor.ts:44`), e essa abertura é da E3-T3.
4. Poda, limite e cache de snapshots (E5-T3) e qualquer mudança no formato do ledger.
5. `aih-before:`/`aih-after:` para a sombra: o produto promete o antes e o depois **do evento**.

## 3. Contexto

| Fato conferido | Onde |
| --- | --- |
| O ledger guarda conteúdo endereçado por hash e o expõe prontos para leitura: `recordSnapshot` e `readSnapshot` | `src/vs/platform/changeLedger/common/changeLedgerService.ts:96-100` e `:236-242` |
| O store não interpreta o conteúdo e nunca reescreve um hash existente: o endereço é o próprio conteúdo | `snapshotStore.ts:12-25`, `:35-46` e `:48-61` |
| Hash de conteúdo é SHA-1 em hexadecimal minúsculo, com validação pronta | `snapshotHash.ts:14` e `:27-28` |
| O evento carrega os dois hashes do que foi observado — e o "antes" pode não existir (evento parcial) e o "depois" pode não existir (arquivo removido) | `changeEvent.ts:57-60` |
| Um provedor de sistema de arquivos é `stat` + `readdir` + `watch` + o que a capacidade declarar; ler precisa de `FileReadWrite`, `FileReadStream` ou `FileOpenReadWriteClose` | `platform/files/common/files.ts:598-706` e `:756-762` |
| Declarar `Readonly` é o que faz o **editor** nascer travado, com mensagem própria | `platform/files/common/files.ts:799-811` e `workbench/services/filesConfiguration/common/filesConfigurationService.ts:205-213` |
| Sem capacidade de escrita o próprio serviço de arquivos recusa gravar: nem chega ao provedor | `platform/files/common/fileService.ts:159-177` |
| Na leitura, o serviço prefere o fluxo: um provedor com `FileReadStream` é lido por `readFileStream` | `platform/files/common/fileService.ts:622-638` |
| Existe no core um provedor somente leitura para servir conteúdo avulso a um editor, com `readdir` vazio, escrita lançando `NoPermissions` e `stat` de arquivo | `workbench/contrib/chat/common/widget/chatResponseResourceFileSystemProvider.ts:69-214` |
| O desenho de URI "recurso real + consulta" já é usado no core para conteúdo guardado | `workbench/contrib/localHistory/browser/localHistoryFileSystemProvider.ts:39-62` |
| O registro do provedor é feito por uma contribuição do workbench, e contribuição só existe se o módulo for importado | `localHistoryTimeline.ts:66`, `chatResponseResourceFileSystemProvider.ts:269-279` e `workbench/workbench.common.main.ts:478-483` |
| As fases de contribuição existem para isso: `BlockStartup` é a mais cedo, `AfterRestored` só roda quando a janela fica ociosa | `workbench/common/contributions.ts:31-62` |
| O app aceita abrir uma URI de esquema próprio no arranque: `--file-uri` vira documento a abrir, e o arquivo entra na **janela da pasta**, não numa janela vazia | `platform/environment/node/argv.ts:164`, `platform/windows/electron-main/windowsMainService.ts:965-977`, `:379-382` e `:698` |
| No renderizador, esses documentos são abertos pelo mesmo caminho do editor de sempre | `workbench/electron-browser/window.ts:215` e `:1030-1054` |
| O produto já sabe transformar o caminho relativo do evento no recurso do workspace | `workbench/contrib/watchCode/common/timelineFileDecoration.ts:49-53` |
| O arnês abre o app com `--folder-uri` e perfil isolado, e pode receber argumentos a mais | `docs/watch-code/e2e/harness.ts:150-181` |

**Fluxo de dados:** observação → evento com `beforeHash`/`afterHash` → snapshots no store →
**URI de documento (`aih-before:`/`aih-after:` + hash)** → provedor → serviço de arquivos →
editor somente leitura. O documento é um endereço para o que já está guardado; nada é copiado,
nada é recalculado e o ledger não muda.

## 4. Dependências

- Snapshots antes/depois no store endereçado por hash — E1-T2, alimentados pelo gravador da E3-T1.
- O contrato do evento (`beforeHash`/`afterHash`) — E1-T1.
- `IFileService.registerProvider` e as capacidades de provedor — plataforma de arquivos, já usada
  pelo produto.
- Nada do produto regride: nenhuma tela, comando, teste ou arquivo de comportamento muda.

## 5. Etapas

1. **O contrato de URI.** Em `platform/changeLedger/common/`, um módulo puro com os dois esquemas,
   o tipo do lado (`before`/`after`), o construtor e o leitor do recurso, e o ajudante que mapeia
   evento + lado + arquivo para o documento — ou `undefined` quando aquele lado não tem hash.
2. **O provedor.** Um `IFileSystemProvider` somente leitura que responde `stat`, `readdir` e
   `readFileStream` a partir do hash da consulta, e recusa tudo o mais. Hash ausente, malformado ou
   fora do store é `FileNotFound`.
3. **O registro.** Uma contribuição do workbench do produto que registra o mesmo provedor nos dois
   esquemas, na fase mais cedo, e a linha de import em `workbench.common.main.ts`.
4. **Testes de unidade.** O contrato (montar, ler, evento sem hash, recurso alheio) e o provedor
   lido pelo serviço de arquivos: conteúdo exato, tamanho, somente leitura, hash inexistente.
5. **Teste manual T-0016.** Cenário novo no arnês: escrever de fora, ler os hashes do ledger, reabrir
   o app com `--file-uri` apontando para o antes, o depois e um hash que não existe; conferir o
   conteúdo desenhado contra o snapshot do disco e que digitar não altera nada. Registro em
   `testes-manuais.md` e linha no `README.md` do arnês.
6. **Validação.** `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check`,
   `test-node` dos dois módulos e `hygiene`; depois o arnês inteiro, que é onde os quinze cenários
   anteriores provam que nada regrediu.
7. **Guia.** Status da E3-T2 no `overview.md`, com os números medidos.

## 6. Riscos e impactos

| Risco | Mitigação |
| --- | --- |
| O app nunca abriu um esquema próprio no arranque: se o provedor não estiver registrado a tempo, o documento não abre | O registro vai na fase mais cedo (`BlockStartup`); se ainda assim falhar, o defeito é medido no T-0016 e o relatório diz que a prova no app depende da superfície da E3-T3 — sem esconder a falha |
| Um "antes" ausente virar arquivo vazio em silêncio mentiria sobre o que o agente fez | Hash ausente é `FileNotFound`: documento que não existe é erro, não conteúdo em branco |
| O provedor aceitar escrita e descartar o conteúdo (como alguns do core fazem) seria perda silenciosa | Somente leitura nas duas camadas: capacidade `Readonly` e nenhuma capacidade de escrita |
| A aba do documento tem o mesmo nome da aba do arquivo real | Não há superfície nesta tarefa; a medição fica registrada no T-0016 e o rótulo do lado entra na E3-T3, pelo `label` do input |
| Esquema novo colidindo com algo do VS Code | Os nomes são do produto (`aih-before`, `aih-after`), reservados no guia (`overview.md:484`), e não existem no core |
| Um comando a mais aqui seria refeito na E3-T3/T4 | Nada de superfície: a prova no app usa o próprio caminho do editor para abrir uma URI |

## 7. Decisões tomadas (autônomas, reversíveis)

| # | Questão | Decisão | Por quê |
| --- | --- | --- | --- |
| **D1** | O documento é endereçado pelo **hash** ou pelo id do evento? | Pelo **hash do conteúdo**, na consulta do URI | O store é endereçado por conteúdo (E1-T2) e o evento já carrega os dois hashes: o provedor não precisa ler evento nenhum, e o mesmo conteúdo é o mesmo documento — como no git. Preço honesto: dois eventos com o mesmo "antes" abrem a mesma aba, porque o conteúdo é o mesmo |
| **D2** | Que caminho entra no URI? | O do **arquivo real do workspace**, com o esquema trocado e a consulta acrescentada — o mesmo desenho do histórico local e do git | O caminho dá idioma ao editor (`.ts`), nome à aba e um endereço legível; o provedor lê só o hash, e o caminho é identidade, não conteúdo |
| **D3** | Um esquema ou dois? | **Dois** (`aih-before`, `aih-after`), servidos pelo **mesmo** provedor | O esquema diz o **papel** do lado dentro da alteração — é o que faz o diff ter dois lados distintos, que é exatamente o que a E3-T3 precisa. Os bytes são os mesmos: o "antes" de um evento pode ser o "depois" de outro |
| **D4** | Como garantir somente leitura? | Capacidade `Readonly` **e** nenhuma capacidade de escrita | O `Readonly` trava o editor com mensagem própria; a ausência de escrita faz o serviço de arquivos recusar a gravação antes de chegar ao provedor. `writeFile` que não escreve seria perda silenciosa |
| **D5** | Leitura bufferizada ou por fluxo? | Por **fluxo** (`readFileStream` com `FileReadStream`) | É o caminho que o serviço de arquivos prefere para o editor, e não obriga a declarar capacidade de escrita só para poder ler |
| **D6** | O que responder quando o hash não existe? | `FileNotFound` — nunca conteúdo vazio | Um "antes" vazio silencioso diria ao desenvolvedor que o agente criou o arquivo do nada; o documento que não existe tem de falhar |
| **D7** | Onde mora o provedor e quando ele é registrado? | Provedor na **plataforma** (`platform/changeLedger/common`), registro numa **contribuição do workbench** do produto em `BlockStartup` | O provedor é a leitura do store, e o módulo não conhece workspace (recebe o recurso pronto). A fase mais cedo é para o documento existir quando a janela abre com `--file-uri` |
| **D8** | Esta tarefa entrega alguma superfície? | **Não** | O diff é da E3-T3 e os modos, da E3-T4; um comando agora seria refeito nas duas. A prova no app usa o caminho do próprio editor para abrir uma URI (`--file-uri`), que exercita provedor e somente leitura de verdade |
| **D9** | O que `stat` responde? | Tamanho real do snapshot, sem `mtime` | O tamanho é o do conteúdo guardado; instante de modificação não existe para um conteúdo endereçado por hash, e inventar um seria dado falso |
| **D10** | Guardar o conteúdo em memória depois de lido? | **Não** | O store é imutável por construção, mas um cache sem limite é memória presa por nada — retenção é assunto da E5-T3. Cada abertura lê o snapshot do disco |

## 8. Critérios de aceite

1. Os esquemas `aih-before:` e `aih-after:` estão registrados no serviço de arquivos do workbench.
2. Abrir um documento servido pelos dois esquemas devolve **exatamente** os bytes do snapshot
   daquele hash, coberto por teste de unidade lido pelo serviço de arquivos.
3. Um hash ausente, malformado ou fora do store falha como arquivo inexistente — e não como
   documento vazio.
4. Escrever num documento é recusado, provado por teste.
5. O contrato de URI tem construtor, leitor e o mapeamento evento → documento, com o caso "lado sem
   hash" devolvendo `undefined`; tudo coberto por teste de unidade.
6. O contrato do ledger não muda: nenhum campo novo em `ChangeEvent`, nenhum schema novo.
7. `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` verdes.
8. `test-node` verde nos dois módulos, com a contagem medida e registrada.
9. O teste manual T-0016 registrado em `docs/watch-code/testes-manuais.md` com resultado obtido e
   situação, e presente no `run-manual-tests.ts` e no `README.md` do arnês.
10. O arnês inteiro verde, e o guia (`overview.md`) atualizado com o status da E3-T2 e os números
    medidos.
