# Testes manuais — Watch Code

Registro único dos testes manuais do projeto, conforme a regra em `CLAUDE.md`.
Testes são **acrescentados**, nunca substituídos.

Os testes que precisam da interface montada passaram a ser executados no
aplicativo pelo arnês `docs/watch-code/e2e/run-manual-tests.ts`:

```
node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts [T-0001 ...]
```

O que fica aqui é o cenário, o que cada teste comprova e o resultado da execução.

- **T-0004** passou em 10/09/2026 e saiu deste registro: o arnês cobre os mesmos
  passos, com Playwright no comando da barra de status e da Paleta de Comandos.
- **T-0001**, **T-0002** e **T-0003** foram reprovados na primeira execução e
  **aprovados na segunda**, depois da correção do registro duplicado — descrita no
  **defeito corrigido**, no fim deste arquivo.

---

## T-0001 — Baseline do "antes" com repositório git real

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | aprovado |
| Data de execução | 10/09/2026 |

### Objetivo

Comprovar que o baseline por git devolve o conteúdo real do arquivo em `HEAD`, e que a degradação para o store de sombra funciona quando não há git.

Um teste automatizado não cobre isto porque exige um **repositório git de verdade** e o binário `git` no PATH. A suíte de unidade injeta a leitura do `HEAD` como função justamente para não depender disso — então a ligação real com o git (`git show HEAD:<arquivo>`, executado no processo compartilhado) fica sem cobertura automática.

### Pré-condições

- Build atualizado: `npm run compile-client` concluído sem erros.
- `git` disponível no PATH (`git --version` responde).
- Uma pasta de teste vazia, fora do repositório do projeto. Ex.: `D:\tmp\wc-baseline`.
- A IDE aberta nessa pasta, pelo script `watchcode.bat`.

### Passos

1. No terminal, prepare o repositório de teste:

   ```powershell
   mkdir D:\tmp\wc-baseline
   cd D:\tmp\wc-baseline
   git init
   "linha original" | Out-File -Encoding utf8 note.txt
   git add note.txt
   git commit -m "estado inicial"
   ```

2. Abra a pasta na IDE:

   ```powershell
   .\watchcode.bat D:\tmp\wc-baseline
   ```

3. Com a IDE aberta, altere o arquivo **fora** dela — pelo PowerShell, sem tocar no editor:

   ```powershell
   "linha alterada" | Out-File -Encoding utf8 D:\tmp\wc-baseline\note.txt
   ```

4. Inspecione os eventos gravados. O caminho é o armazenamento por workspace do perfil isolado; localize pelo id do workspace:

   ```powershell
   Get-ChildItem -Recurse -Filter '*.json' "$env:LOCALAPPDATA\watchcode-udd\User\workspaceStorage" |
     Where-Object { $_.FullName -like '*changeLedger\events\*' } |
     Select-Object -ExpandProperty FullName
   ```

5. Leia o evento encontrado:

   ```powershell
   Get-Content <caminho-do-evento>.json
   ```

6. Confirme o conteúdo guardado como "antes", pelo hash em `beforeHash`:

   ```powershell
   Get-Content "$env:LOCALAPPDATA\watchcode-udd\User\workspaceStorage\<id>\changeLedger\snapshots\<beforeHash>"
   ```

### Resultado esperado

- O passo 4 encontra **um** arquivo de evento.
- O evento traz `"beforeHash"` **presente** (não ausente) — o git respondeu.
- O evento traz `"source": "agent"`, `"attribution": "observed"` e `"status": "current"`.
- O passo 6 imprime `linha original` — o conteúdo que estava em `HEAD`.
- O snapshot de `afterHash` contém `linha alterada`.

### Resultado obtido

Executado em 10/09/2026 pelo arnês `docs/watch-code/e2e/run-manual-tests.ts`
(Playwright), com o mesmo cenário deste teste: repositório git com um commit,
`note.txt` na raiz da pasta observada e a escrita feita por fora do app.

O que este teste comprova, comprovou:

- o evento traz `beforeHash=8b70c4b4…`, que é o hash de `linha original\n` — o
  conteúdo que estava no `HEAD`;
- `beforeHash` e `afterHash` presentes, `source=agent`, `attribution=observed`,
  `status=current`;
- o snapshot do "antes" guarda `linha original` e o do "depois", `linha alterada`;
- e o ledger guardou **um** evento para essa escrita, como este teste espera.

Na primeira execução o teste foi reprovado: o ledger gravou **dois** eventos para
essa única escrita (`…880387` e `…880433`, 46 ms de diferença). Causa e correção no
**defeito corrigido**, no fim deste arquivo.

### Observações

Se `beforeHash` vier **ausente**, o baseline caiu para o modo parcial: verifique se o commit do passo 1 foi feito de fato e se `git --version` responde no PATH do usuário que roda a IDE.

---

## T-0002 — Degradação para a sombra sem git

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | aprovado |
| Data de execução | 10/09/2026 |

### Objetivo

Comprovar que, **sem** repositório git, a segunda alteração de um arquivo usa como "antes" o conteúdo da primeira — ou seja, a sombra cobre a ausência do git.

### Pré-condições

- Build atualizado.
- Uma pasta de teste que **não** seja repositório git. Ex.: `D:\tmp\wc-shadow`.
- A IDE aberta nessa pasta.

### Passos

1. ```powershell
   mkdir D:\tmp\wc-shadow
   "versao um" | Out-File -Encoding utf8 D:\tmp\wc-shadow\note.txt
   ```

2. Abra a pasta na IDE: `.\watchcode.bat D:\tmp\wc-shadow`

3. Altere o arquivo fora da IDE:

   ```powershell
   "versao dois" | Out-File -Encoding utf8 D:\tmp\wc-shadow\note.txt
   ```

4. Altere de novo, depois de alguns segundos:

   ```powershell
   Start-Sleep -Seconds 3
   "versao tres" | Out-File -Encoding utf8 D:\tmp\wc-shadow\note.txt
   ```

5. Liste os eventos do arquivo e leia os dois últimos.

### Resultado esperado

- Existem **dois** eventos para `note.txt`.
- O **primeiro** não tem `beforeHash` — não havia git nem sombra.
- O **segundo** tem `beforeHash` presente, apontando para um snapshot cujo conteúdo é `versao dois`.
- O `afterHash` do segundo contém `versao tres`.

### Resultado obtido

Executado em 10/09/2026 pelo arnês (Playwright), com o mesmo cenário: pasta
sem git, `note.txt` na raiz e duas escritas separadas por três segundos.

A sombra funcionou como este teste espera: os dois eventos da segunda escrita
trazem `beforeHash=45c5b9a4…`, o hash de `versao dois\n`, que só podia vir dela.

E a contagem fechou: **dois** eventos para `note.txt`, um por escrita, com sessões
diferentes — o primeiro sem antes e o segundo com `antes=45c5b9a4…`, o conteúdo de
`versao dois`.

Na primeira execução o teste foi reprovado: cada escrita virava **dois** eventos, o
ledger ficava com quatro em vez de dois, e a posição que o teste esperava ser a
segunda escrita era a cópia da primeira. Causa e correção no **defeito corrigido**,
no fim deste arquivo.

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha: é a regra do evento parcial do §4.1 do guia.

---

## T-0003 — Observação do disco pelo watcher nativo

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T4 — Watcher do workspace |
| Situação | aprovado |
| Data de execução | 10/09/2026 |

### Objetivo

Comprovar que o **watcher nativo do sistema operacional** detecta uma escrita feita
por um script externo, com a IDE aberta, e grava o evento no ledger com o
antes/depois correto.

Um teste automatizado não cobre isto porque a suíte de unidade usa o
`InMemoryFileSystemProvider`, cujo `watch()` é um **no-op** — ele não observa o
disco, apenas deixa os eventos passarem para os assinantes. Os testes em memória
exercitam o tratamento do evento, mas nunca a detecção real pelo sistema de
arquivos.

### Pré-condições

- Build atualizado: `npm run compile-client` concluído sem erros.
- Uma pasta de teste **sem** repositório git. Ex.: `D:\tmp\wc-watcher`.
- A IDE aberta nessa pasta, pelo script `watchcode.bat`.
- Observação **ligada**: o item `$(eye) Watch Code` visível na barra de status.

### Passos

1. Prepare a pasta de teste:

   ```powershell
   mkdir D:\tmp\wc-watcher
   "versao um" | Out-File -Encoding utf8 D:\tmp\wc-watcher\note.txt
   ```

2. Abra a pasta na IDE e espere a interface terminar de subir:

   ```powershell
   .\watchcode.bat D:\tmp\wc-watcher
   ```

3. Confirme o item `$(eye) Watch Code` na barra de status (é o indicador da
   E1-T5; se a observação estiver desligada, ligue antes de continuar).

4. Espere a observação se estabilizar e altere o arquivo **fora** da IDE:

   ```powershell
   Start-Sleep -Seconds 3
   "versao dois" | Out-File -Encoding utf8 D:\tmp\wc-watcher\note.txt
   ```

5. Espere a pausa de agrupamento vencer e altere de novo:

   ```powershell
   Start-Sleep -Seconds 3
   "versao tres" | Out-File -Encoding utf8 D:\tmp\wc-watcher\note.txt
   ```

6. Liste os eventos gravados pelo workspace:

   ```powershell
   $raiz = "$env:LOCALAPPDATA\watchcode-udd\User\workspaceStorage"
   $eventos = Get-ChildItem -Recurse -Filter '*.json' $raiz |
     Where-Object { $_.FullName -like '*changeLedger\events\*' }
   "total de eventos: $($eventos.Count)"
   Select-String -Path ($eventos.FullName) -Pattern '"fileUri"' |
     ForEach-Object { $_.Line.Trim() }
   ```

7. Leia o evento mais recente por inteiro:

   ```powershell
   Get-Content ($eventos | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
   ```

8. Confirme o conteúdo guardado como "antes" do último evento, pelo hash em
   `beforeHash`:

   ```powershell
   Get-Content "$env:LOCALAPPDATA\watchcode-udd\User\workspaceStorage\<id>\changeLedger\snapshots\<beforeHash>"
   ```

### Resultado esperado

- O passo 6 mostra **dois** eventos, ambos com `"fileUri": "note.txt"`.
- Os dois eventos têm a mesma `sessionId`? **Não** — as escritas estão separadas
  por mais de 1,5 s, então cada uma abre a sua própria sessão.
- O primeiro evento não tem `beforeHash`: a pasta não tem git e a sombra ainda
  estava vazia.
- O segundo evento tem `beforeHash` presente, e o snapshot correspondente contém
  `versao dois`.
- Os dois eventos têm `"source": "agent"` e `"attribution": "observed"`. O
  `"status"` segue a regra de atualidade do ledger: quando o segundo evento entra,
  o primeiro daquele arquivo vira `"history"` — só o último fica `"current"`.
  *(Expectativa corrigida em 10/09/2026: a versão original deste teste pedia os dois
  como `current`, o que contradiz a regra de atualidade do ledger.)*
- O `afterHash` do segundo evento corresponde ao snapshot com `versao tres`.
- Alterar o arquivo do PowerShell **não** dispara nenhuma ação da IDE: o evento
  nasce da observação do disco, não de um comando da interface.

### Resultado obtido

Executado duas vezes em 10/09/2026 pelo arnês (Playwright), com o mesmo cenário:
pasta sem git, `note.txt` na raiz, duas escritas separadas por três segundos e o
indicador da observação conferido antes de medir.

O watcher nativo detectou as duas escritas, e a origem está certa nos dois eventos
(`agent`/`observed`). A partição de sessões fechou: **dois** eventos para `note.txt`,
com `sessionId` diferente para cada escrita, o primeiro sem `beforeHash` e o segundo
com `antes=45c5b9a4…`, o conteúdo de `versao dois`. O último está `current` e o
anterior virou `history`.

Na primeira execução o teste foi reprovado: cada escrita virava **dois** eventos com
a mesma `sessionId` dentro do par, o ledger ficava com quatro em vez de dois e o par
da primeira escrita era lido como se fosse as duas escritas. Causa e correção no
**defeito corrigido** abaixo.

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha — é a
mesma regra do T-0002. Repare que este teste também é o critério de fechamento da
E1: qualquer alteração feita fora da IDE vira um evento com arquivo, origem,
horário e snapshots corretos.

---

## Defeito corrigido — uma escrita virava dois eventos

Descoberto pelos testes T-0001 a T-0003 em 10/09/2026 e **corrigido no mesmo dia**.
T-0001, T-0002 e T-0003 estão aprovados depois da correção.

### O que acontece

Uma alteração de um arquivo **na raiz do workspace** é gravada **duas vezes** no
ledger. Em uma das execuções, o arquivo de sonda chegou a receber **três** eventos
para uma escrita só.

### Como foi verificado

Com o serviço instrumentado para registrar cada lote entregue pelo serviço de
arquivos, aparecem **dois lotes** para a mesma escrita, de 1 a 100 ms de diferença:

```
[watchCode][diag] lote added=[] updated=[.../workspace/raiz.txt] deleted=[] ativo=true
[watchCode][diag] lote added=[] updated=[.../workspace/raiz.txt] deleted=[] ativo=true
```

A coalescência que existe hoje no serviço só junta o que vem **dentro** de um lote
(o caso `added` + `updated` da criação de arquivo), então dois lotes viram dois
eventos.

### Por que só na raiz

A segunda entrega não vem do nosso código. O localizador de arquivos de prompt do
chat observa a **raiz do workspace sem recursão**, para enxergar `AGENTS.md` e
`CLAUDE.md`:

- `src/vs/workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.ts`,
  `createAgentInstructionsUpdatedEvent`, chama `fileService.watch(workspaceRoot)`
  sem `recursive`;
- uma observação não recursiva de uma pasta acompanha os **filhos diretos** dela;
- todo arquivo na raiz chega então duas vezes ao fluxo compartilhado
  `onDidFilesChange`, e arquivo em subpasta chega uma vez só.

Comprovado por experimento, duas vezes: escrita em `raiz.txt` produziu **2**
eventos; escrita em `sub/pasta.txt`, **1**. A duplicação continua com
`--disable-extensions`, logo não é extensão. O `IFileService.createWatcher`, o
observador correlacionado que isolaria o nosso pedido, só aceita
`recursive: false` e não serve para observar a pasta inteira.

### Consequências no ledger

- dois eventos para uma alteração: a linha do tempo mostraria duas entradas;
- um dos dois fica `status=history` no mesmo instante;
- o índice lista apenas um deles, deixando o outro como arquivo órfão;
- o evento repetido pode sair com `antes` igual ao `depois`.

### Por que o teste ponta a ponta não pegou

O estímulo dele escreve só dentro de `src/` — subpasta, portanto fora do alcance da
observação não recursiva da raiz.

### Correção aplicada

**No recorder**, por conteúdo: `ChangeRecorderService` guarda o último evento gravado
por arquivo e não grava de novo quando o conteúdo no disco tem exatamente o
`afterHash` dele — a alteração não existiu. Quem decide é o conteúdo, e não o relógio:
nenhuma escrita de verdade depende do carimbo de tempo. A especificação está em
`docs/watch-code/SPECS/escrita-repetida-nao-vira-evento.md`.

A primeira tentativa não passou nos testes, e o motivo vale o registro: as duas
entregas **chegam quase juntas**, e cada registro passa por leituras assíncronas. A
segunda entrega olhava o mapa antes de a primeira ter gravado, então as duas
gravavam. A correção ganhou uma **fila por arquivo**: a chamada seguinte só decide
depois de a anterior terminar. O caso está travado no teste
`duas entregas simultâneas da mesma escrita não viram dois eventos`, que falhou antes
da fila e passa com ela.

**No próprio teste T-0003**, a expectativa estava errada: ele pedia os dois eventos
como `current`, e a regra de atualidade do ledger — a mesma que o e2e verifica desde
a E1 — rebaixa o primeiro para `history` quando o segundo entra. A expectativa foi
corrigida.

**Evidência da correção**

| Verificação | Resultado |
| --- | --- |
| Suíte do módulo | **98 passing** (eram 93 antes dos casos novos; o caso da entrega simultânea falhava sem a fila) |
| `npm run compile-client` | `compile-src … with 0 errors` |
| `npx eslint` nos arquivos tocados | sem erro |
| higiene | sem erro |
| Teste ponta a ponta | **PASSOU (7 eventos, 5 arquivos)**, as 12 invariantes ok — a correção não engole alteração de verdade |
| T-0001, T-0002, T-0003 | **aprovados** |
| T-0004 | aprovado |

Onde o registro duplicado antigo ficou no perfil de um desenvolvedor, ele continua
lá: limpar histórico já gravado é manutenção do ledger, não desta correção.
---

## T-0005 — View da timeline no Explorer

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E2-T2 — View da timeline |
| Situação | aprovado |
| Data de execução | 11/09/2026 |

### Objetivo

Comprovar que a lista da linha do tempo aparece na janela, dentro do Explorer,
abaixo da árvore de arquivos, recolhida, e que cada alteração registrada vira uma
linha com arquivo, hora e origem — crescendo com a janela aberta, sem recarregar.

Um teste automatizado não cobre isto porque a view só existe montada dentro do
workbench: a suíte de unidade roda no Node, sem DOM, e cobre apenas a derivação da
linha (`timelineRows.ts`). O que sobra — registro da view, altura da lista, estado
vazio, atualização incremental e o recolher/expandir — só se prova no aplicativo
em execução.

### Pré-condições

- Build atualizado: `npm run compile-client` (ou `npm run transpile-client`) concluído sem erros.
- Uma pasta de teste vazia. Ex.: `D:	mpwc-timeline`.
- A IDE aberta nessa pasta, pelo script `watchcode.bat`.
- Observação **ligada**: o item `$(eye) Watch Code` visível na barra de status.
- A janela **não pode ser tocada** durante a execução: o arnês dirige a interface, e um clique de fora muda o estado medido (foi o que reprovou uma das execuções).

### Passos

1. Prepare a pasta de teste:

   ```powershell
   mkdir D:	mpwc-timeline
   "versao inicial" | Out-File -Encoding utf8 D:	mpwc-timeline
ote.txt
   ```

2. Abra a pasta na IDE:

   ```powershell
   .watchcode.bat D:	mpwc-timeline
   ```

3. No Explorer, confira que existe **uma** view "Timeline", abaixo da árvore de
   arquivos, e que ela está **recolhida** (seta para a direita no título). A
   Timeline nativa do VS Code (histórico de commits do arquivo) não aparece.
4. Clique no título da view para expandir. Sem nenhum evento no ledger, ela
   anuncia **No changes were observed yet.** e não mostra nenhuma linha.
5. Em um terminal **de fora** da IDE, altere um arquivo da pasta observada:

   ```powershell
   "alterado com a janela aberta" | Out-File -Encoding utf8 D:	mpwc-timeline
ote.txt
   ```

6. Sem recarregar a janela, confira a linha nova: nome do arquivo, hora local e
   origem "Disk".
7. Altere o arquivo outra vez e confira a lista crescendo, com a alteração nova
   no fim.
8. Clique no título de novo: a view recolhe e a lista sai de cena.

### Resultado esperado

- Passo 3: uma única view "Timeline", recolhida, dentro do Explorer.
- Passo 4: mensagem de vazio, zero linhas e nenhum botão de tentar de novo.
- Passo 6: uma linha com o arquivo (`note.txt`), a hora `HH:MM` local e a origem "Disk".
- Passo 7: a lista cresce uma linha por alteração, na ordem cronológica.
- Passo 8: recolhida, a lista sai de cena.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026:

```text
  ok    passo 3: existe uma única view "Timeline" na janela — 1 cabeçalho(s) com "Timeline"
  ok    passo 3: o corpo da Timeline nativa não está na janela — .timeline-tree-view
  ok    passo 4: a view nasce recolhida — aria-expanded=false
  ok    passo 5: o clique no cabeçalho expande a view — aria-expanded=true
  ok    passo 5: sem alteração nenhuma, a view anuncia o vazio — mensagem="No changes were observed yet."
  ok    passo 5: sem erro, não há botão de tentar de novo — botões de tentar de novo=0
  ok    passo 5: a lista está vazia — linhas na lista
  ok    passo 6: a alteração feita com a janela aberta aparece na lista — linhas=["aquecimento.txt"]
  ok    passo 6: a linha mostra a hora e a origem — detalhe="23:24 · Disk"
  ok    passo 7: a segunda alteração entra na lista — linhas=["aquecimento.txt","note.txt"]
  ok    passo 7: a lista cresceu uma linha e manteve a anterior — 1 -> 2
  ok    passo 7: a alteração nova ficou depois da primeira — posição=1 de 2
  ok    passo 8: o clique recolhe a view de novo — aria-expanded=false
  ok    passo 8: recolhida, a lista sai de cena — lista visível=false

veredito: PASSOU
```

O arquivo `aquecimento.txt` é a sonda do próprio arnês: ele escreve antes de medir,
para provar que a observação estava de pé.

### Histórico de execução

A primeira execução **reprovou** em cinco passos: a lista não desenhava linha
nenhuma depois de a view ser expandida. A causa era a falta do `layoutBody` na
view — uma lista virtualizada só desenha o que cabe na altura que recebe, e a
altura nunca chegava. Corrigido na view, com execução seguinte aprovada.

Uma segunda execução reprovou em dois passos porque a janela **foi mexida de fora**
enquanto o teste corria: o passo "nasce recolhida" mediu o clique de quem estava
olhando. Nada a corrigir no produto; a execução foi repetida sem interferência e
passou.

---

## T-0006 — Anterior/Próximo na linha do tempo

**Tarefa de origem:** E2-T3 — Anterior/Próximo.

### Objetivo

Comprovar que o desenvolvedor anda pelas alterações que o agente fez **pelo
teclado**, partindo de uma view recolhida, e que existe **um** evento ativo — a
posição de onde a E2-T4 vai abrir o arquivo.

Um teste automatizado não cobre isto: tecla, foco de teclado e seleção de lista só
existem na janela. A suíte de unidade prova a regra do passo
(~stepActiveId~, 9 testes), mas não prova que a tecla **chega** ao comando, nem
que o foco permanece onde estava.

### Pré-condições

- App compilado: ~npm run transpile-client~.
- O teste é executado pelo arnês, que abre o app em perfil isolado e observa a
  pasta dele:

  ~~~powershell
  node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0006
  ~~~

- **A janela do app não pode ser tocada durante a execução**: o teste mede o foco
  do teclado e a linha selecionada, e o clique de quem estiver olhando entra na
  medida.
- Três alterações no workspace: a sonda de aquecimento do arnês
  (~aquecimento.txt~), ~note.txt~ e ~extra.txt~. Nomes distintos de propósito:
  deixam claro qual linha está selecionada na evidência.

### Passos

1. Sem nenhuma alteração registrada, olhe o título da view "Timeline", no
   Explorer: **nenhum** botão de navegação aparece.
2. Em um terminal de fora da IDE, altere três arquivos da pasta observada, com
   uma pausa entre eles (o agrupador fecha a sessão em ~1,5 s).
3. Com a view **recolhida**, aperte **F5**. Confira: a view abre, a primeira
   alteração (a mais antiga) fica selecionada, e o foco do teclado **não** vai
   para a lista.
4. Aperte **F5** outra vez: a seleção anda uma linha. Aperte **Shift+F5**: volta
   uma linha.
5. Na primeira alteração, aperte **Shift+F5**: não sai do lugar.
6. Vá até a última e aperte **F5**: também não sai do lugar.
7. Clique numa linha do meio e aperte **F5**: a navegação continua da linha
   clicada.
8. Segure **Ctrl** e clique em outra linha: só **uma** linha fica selecionada.
9. Com alterações na lista, os dois botões (seta para cima e seta para baixo)
   aparecem no título da view.

### Resultado esperado

- Passo 1: nenhum botão de navegação no título.
- Passo 3: view expandida, primeira linha selecionada, foco inalterado.
- Passo 4: a seleção anda nas duas direções, uma linha por vez.
- Passos 5 e 6: nas pontas o passo para, sem dar a volta.
- Passo 7: o clique define o evento ativo, e o F5 continua dele.
- Passo 8: a seleção nunca é múltipla.
- Passo 9: dois botões, um para cada direção.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026:

~~~text
  ok    passo 1: sem alteração, os botões de navegação não aparecem — ações=[]
  ok    passo 2: o ledger registrou as três alterações — eventos=3 / linhas na tela=[]
  ok    passo 3: a view começa recolhida — aria-expanded=false
  ok    passo 4: o F5 abre a view — aria-expanded=true
  ok    passo 4: a lista mostra as três alterações, na ordem — linhas=["aquecimento.txt","note.txt","extra.txt"]
  ok    passo 4: os dois botões de navegação aparecem no título — ações=["Previous Change (Shift+F5)","Next Change (F5)"]
  ok    passo 4: o primeiro F5 escolhe a alteração mais antiga — selecionadas=["aquecimento.txt"]
  ok    passo 4: o foco não vai para a lista — foco antes="editor-group-container empty active" depois="editor-group-container empty active"
  ok    passo 5: o F5 seguinte anda uma linha — selecionadas=["note.txt"]
  ok    passo 5: o Shift+F5 volta uma linha — selecionadas=["aquecimento.txt"]
  ok    passo 6: no começo, o anterior não dá a volta — selecionadas=["aquecimento.txt"]
  ok    passo 6: dois F5 chegam na última alteração — selecionadas=["extra.txt"]
  ok    passo 6: no fim, o próximo não dá a volta — selecionadas=["extra.txt"]
  ok    passo 7: o clique escolhe a linha clicada — selecionadas=["note.txt"]
  ok    passo 7: o F5 continua a partir do clique — selecionadas=["extra.txt"]
  ok    passo 8: a seleção continua única — selecionadas=["aquecimento.txt"]

veredito: PASSOU (1 testes manuais)
~~~

Vale notar duas coisas na evidência. O rótulo dos botões sai com a tecla entre
parênteses — "Next Change (F5)" —, o que é prova de que a ligação existe. E o
"linhas na tela=" vazio no passo 2 não é falha: com a view recolhida o corpo não é
desenhado (a pane só renderiza o corpo quando expandida), então a lista existe no
modelo e não no DOM — que é exatamente o caso que a carga sob demanda resolve.

### Situação

**aprovado.**

### Histórico de execução

A primeira execução **reprovou em 9 das 16 conferências**: com a view recolhida, o
F5 não fazia absolutamente nada — nem abria a view, nem selecionava linha.

A causa era o ~when~ da tecla. A chave de contexto "há alterações"
(~watchCodeTimeline.hasEvents~) é escrita pela própria view quando ela lê a lista,
e a lista só é lida quando o corpo é desenhado **ou** quando um comando navega —
ovo e galinha. Com a view recolhida, o estado em que ela nasce, a chave ficava
falsa para sempre e a tecla nunca chegava ao comando: quem respondia ao F5 era o
~debug.openView~, o dono antigo da tecla.

Correção: a **tecla** ficou incondicional (o peso maior resolve o dono antigo), e
a chave de contexto continuou comandando apenas os **botões**, que vivem numa view
já desenhada. A execução seguinte passou nas 16 conferências. O registro da
divergência está no §7 da especificação da tarefa.



