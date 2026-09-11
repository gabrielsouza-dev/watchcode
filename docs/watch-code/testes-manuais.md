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


## T-0007 — Leitura de código pelo F12

**Tarefa de origem:** E8-T1 — Inteligência de código para leitura.

### Objetivo

Comprovar que a IDE **lê** código: o F12 leva à definição, o hover mostra a
assinatura — e isso acontece **com** as superfícies de escrita desligadas, sem erro
sublinhado, sem sugestão ao digitar e sem comando de escrita na Paleta de Comandos.

Não é testável por unidade: quem responde ao F12 é um servidor de linguagem que só
existe dentro da janela, conversa por IPC com a extensão e depende dos padrões do
produto. Só a janela real prova a combinação.

### Pré-condições

- Extensão `extensions/typescript-language-features` restaurada, com as dependências
  instaladas (25 pacotes) e o `out/` compilado por
  `npm run gulp -- compile-extension:typescript-language-features`.
- Padrões do produto em vigor (`PRODUCT_SETTING_DEFAULTS`), em perfil de usuário
  **novo**, sem sobrescrita do usuário.
- Workspace com dois arquivos: `biblioteca.ts` (define `saudacao` na linha 2, nome na
  coluna 17) e `consumidor.ts` (importa e usa o símbolo na linha 3, coluna 25).
- O consumidor tem **um erro de tipo proposital** (`const quebrado: number = 'texto';`):
  sem ele, "nenhum erro sublinhado" não provaria nada, porque não haveria erro para
  aparecer.
- O arnês abre o app em perfil isolado e comanda a interface pelo Playwright.
- Comando:

  ```powershell
  node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0007
  ```

- **A janela do app não pode ser tocada durante a execução**: o teste digita no
  editor e mede o foco do teclado.

### Passos

1. Abra `consumidor.ts` no editor.
2. Confira que a extensão do TypeScript está ativa — ela se anuncia na barra de
   status com a versão do servidor.
3. Posicione o cursor sobre `saudacao` na linha 3 (Ctrl+G, `3:25`). A barra de status
   deve mostrar `Ln 3, Col 25`.
4. Aperte **F12**. O editor ativo deve passar a ser `biblioteca.ts`.
5. Confira a posição: o cursor fica na linha da definição (`Ln 2`).
6. Com o cursor ali, aperte **Ctrl+K Ctrl+I** (mostrar hover): o hover traz
   `function saudacao(): string`.
7. Volte ao `consumidor.ts` e confira que **nenhum** erro é sublinhado e que a barra
   de status **não** acusa problema — apesar do erro de tipo plantado no arquivo.
8. Abra a paleta (Ctrl+Shift+P) e procure `sort imports`: **nada** deve aparecer.
9. Digite `sauda` numa linha nova: o widget de sugestão **não** pode abrir.

### Resultado esperado

- Passo 2: a extensão ativa, com a versão do servidor visível.
- Passos 4 e 5: o F12 abre o outro arquivo e para em cima do símbolo definido.
- Passo 6: o hover traz a assinatura da função.
- Passo 7: zero marcas de erro e zero problemas na barra.
- Passo 8: nenhuma linha de `Sort Imports` na paleta.
- Passo 9: nenhuma sugestão.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026:

```text
  ok    passo 1: o consumidor abre no editor — aba ativa="consumidor.ts"
  ok    passo 2: a extensão do TypeScript está ativa — indicador="editor language status: loading intellisense status, next: 6.0.3, typescript version"
  ok    passo 3: o cursor está sobre o símbolo usado — posição="Ln 3, Col 25"
  ok    passo 4: o F12 abre o arquivo da definição — aba ativa="biblioteca.ts"
  ok    passo 5: o cursor fica na linha da definição — posição="Ln 2, Col 17", esperado Ln 2, Col 17
  ok    passo 6: o hover traz a assinatura — hover="function saudacao(): string"
  ok    passo 7: o editor não sublinha o erro de tipo — marcas=0
  ok    passo 7: a barra de status não acusa problema — problemas="No Problems"
  ok    passo 8: Sort Imports não aparece na paleta — linhas=["Organize Imports Shift + Alt + O similar commands"]
  ok    passo 9: digitar não abre sugestão — sugestões=[]

veredito: PASSOU (1 testes manuais)
```

A linha do passo 8 merece leitura: o que a paleta devolveu para a busca "sort
imports" foi o **"Organize Imports"** do editor (com o atalho ao lado). Ele continua
lá — é comando do editor, não da extensão, e ficou fora do escopo aprovado. Fica
registrado como pendência conhecida.

### Situação

**aprovado.**

### Histórico de execução

Foram três execuções até passar, e as duas reprovações valem mais que o resultado
final.

**Primeira execução — 5 de 12 conferências reprovadas.** O F12 não fazia nada e o
hover mostrava `(loading...) import saudacao`. Com o log do tsserver ligado, a causa
apareceu:

```text
servidor sintático (ServerMode: 1): definitionAndBoundSpan x30   <- os 30 F12
servidor semântico:                  definitionAndBoundSpan x0
```

O TypeScript sobe dois servidores. Enquanto o cliente acredita que o projeto está
carregando, ele manda definição e hover para o **sintático** — que não tem projeto e
não responde. E quem tira o cliente desse estado é um evento de **diagnóstico**
(`server.ts`: `projectLoadingFinish`, `semanticDiag`, `syntaxDiag`…). Com
`typescript.validate.enable: false` o diagnóstico nunca acontece, o estado nunca sai
de "carregando" e o F12 fica preso no servidor errado. Desligar a validação quebrava
a leitura.

Correção: `typescript.tsserver.useSyntaxServer: "never"` nos padrões do produto —
um servidor só, sem roteamento (`CompositeServerType.Single`). Com ela, o log virou
`definitionAndBoundSpan x1` e `quickinfo x1`, e o F12 passou a acertar a linha e a
coluna exatas.

**Segunda execução — passos 8 e 9 reprovados.** O `Sort Imports` continuava na
paleta porque a extensão **declara** essas entradas no próprio manifesto: o item
registrado pelo produto com `when` falso suprime apenas o item *implícito*, e
`IMenuRegistry` não tem API de remoção. Correção: as cinco entradas de escrita saíram
do `package.json` da extensão, **junto** com a supressão — as duas metades juntas é
que tiram o comando da paleta. A sugestão restante vinha do
`editor.wordBasedSuggestions` (o log não tinha nenhum `completionInfo`): passou a
`off` nos padrões.

**Terceira execução** reprovou só o passo 6, por corrida no encadeamento
Ctrl+K Ctrl+I — o hover não abria. O atalho ganhou uma pausa entre as duas teclas e
nova tentativa; a conferência não mudou. A execução seguinte passou nas 10.

### Pendência registrada

`Organize Imports` (Shift+Alt+O) continua na Paleta de Comandos e reescreve o
arquivo. Ele é comando do **editor** e chega à paleta pelas ações suportadas pelo
editor ativo, não pelo registro de menus — nenhum ajuste de lista o alcança. Ficou
fora do escopo aprovado, que recusou explicitamente esconder rename e refatorar, e
fica como candidato para a E8-T2, que trata de comandos e atalhos que não são do
produto.


## T-0008 — Salto ao local da alteração

| Campo | Valor |
| --- | --- |
| Tarefa de origem | **E2-T4 — Salto ao local** |
| Comando | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0008` |

### Objetivo

Provar, na janela, que ir do evento à linha alterada acontece **em um gesto**: o
arquivo abre, a faixa alterada fica selecionada e visível, a aba é de
pré-visualização, o foco não é roubado — e, quando não há o que abrir, aparece
aviso em vez de nada. Foco de teclado, aba e rolagem não têm como ser provados por
teste automatizado.

### Pré-condições

- Build fresco: `npm run transpile-client`.
- Workspace que é **repositório git**, com três arquivos já commitados — o commit é
  o "antes" da primeira alteração de cada um:
  - `alvo.ts` — 200 linhas de TypeScript, a alteração na linha 100;
  - `historico.js` — 200 linhas de JavaScript, alterado duas vezes;
  - `apagado.cs` — arquivo de C#, alterado e depois apagado pelo script.
- As três extensões são de propósito: o produto observa o disco e salta para o
  arquivo sem saber nada da linguagem, e o `.cs` prova isso (nenhuma extensão do
  fork entende C#).
- O arnês abre o app em perfil isolado, com a observação ligada, e comanda a
  interface pelo Playwright; o ledger é lido do disco.
- **A janela do app não pode ser tocada durante a execução**: o teste mede foco de
  teclado e posição de rolagem.

### Passos

1. O script escreve em `alvo.ts` (linha 100) e em `historico.js`; o ledger precisa
   registrar as duas alterações.
2. Com o foco no editor, aperte **F5**: a view abre e salta para a alteração mais
   antiga (a sonda de aquecimento).
3. Aperte **F5** de novo: o editor vai para `alvo.ts`, com o cursor na linha 100 e
   a linha visível.
4. Confira a aba: uma só, em pré-visualização (sem o itálico de aba fixada).
5. No editor, vá para a linha 150 (Ctrl+G); arraste o cursor da barra de rolagem
   para baixo e clique na linha do `alvo.ts` na lista: o clique traz a alteração de
   volta para o centro e o cursor volta para a linha 100.
6. Com a lista em foco, aperte **ArrowDown**: o editor troca para `historico.js` e o
   foco continua na lista.
7. Arraste a barra e aperte **Enter**: o Enter salta de novo, mesmo na linha que já
   é o evento ativo, e centraliza outra vez.
8. Dê **duplo clique** na linha do `alvo.ts`: a aba fica fixada, e o F5 seguinte
   abre outra aba em vez de reusar a fixada.
9. O script reescreve `apagado.cs` e depois apaga o arquivo; percorra a lista com
   **ArrowDown** até o fim.
10. A primeira alteração do `historico.js` continua na lista como entrada
    histórica, apontando para uma faixa que já não existe no arquivo.

### Resultado esperado

- Passo 2 e 3: o arquivo da alteração abre, com o cursor na linha alterada e a
  linha dentro da área visível.
- Passo 4: uma aba só, sem itálico.
- Passo 5: o clique desfaz a rolagem e o cursor volta para a linha 100.
- Passo 6: a seta troca o arquivo aberto e o foco fica na lista.
- Passo 7: o Enter reaplica o salto na linha já ativa.
- Passo 8: a aba fixada não é reusada.
- Passo 9: dois avisos diferentes — "no longer in the workspace" para a alteração
  cujo arquivo sumiu, "removed the file" para a remoção — e nenhum editor do
  `apagado.cs` é aberto.
- Passo 10: a entrada histórica abre o arquivo e para na última linha dele, sem
  exceção.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026:

```text
  ok    passo 1: o ledger registrou a alteracao — eventos do alvo=1 linhas na tela=[]
  ok    passo 2: o F5 leva ao arquivo da alteracao mais antiga — editor ativo="aquecimento.txt"
  ok    passo 3: o editor vai para o arquivo da alteracao — editor ativo="alvo.ts"
  ok    passo 3: o cursor cai na linha alterada — posicao="Ln 100, Col 61 (60 selected)"
  ok    passo 3: a linha alterada fica visivel — linhas visiveis=79..120
  ok    passo 4: uma aba so, de pre-visualizacao — abas=1 fixada=false
  ok    passo 5: a barra rolou a vista antes do clique — cursor da barra 510 -> 530
  ok    passo 5: o clique traz a alteracao de volta para o centro — cursor da barra 530 -> 347
  ok    passo 5: o cursor volta para a linha alterada — posicao="Ln 100, Col 61 (60 selected)"
  ok    passo 6: a seta troca o arquivo aberto — editor ativo="historico.js" selecionadas=["historico.js"]
  ok    passo 6: o foco continua na lista — foco na lista=true
  ok    passo 7: o Enter salta de novo, mesmo na linha ja ativa — posicao="Ln 100, Col 46 (45 selected)"
  ok    passo 7: a barra rolou a vista antes do Enter — cursor da barra 347 -> 367
  ok    passo 7: a centralizacao acontece outra vez — cursor da barra 367 -> 347
  ok    passo 8: o duplo clique fixa a aba — abas=2 fixada=true
  ok    passo 8: a aba fixada nao e reusada pelo salto seguinte — abas=2
  ok    passo 9: o passeio visitou as alteracoes da sessao — linhas=["aquecimento.txt","alvo.ts","historico.js","apagado.cs","apagado.cs","historico.js","historico.js","historico.js"]
  ok    passo 9: o arquivo que sumiu avisa, em vez de abrir — avisos=["The file of this change is no longer in the workspace.","This change removed the file. Nothing to open."]
  ok    passo 9: a remocao registrada tem o proprio aviso — avisos=["The file of this change is no longer in the workspace.","This change removed the file. Nothing to open."]
  ok    passo 9: nenhum editor do arquivo apagado e aberto — editores=["aquecimento.txt","alvo.ts","historico.js","historico.js","historico.js","historico.js","historico.js","historico.js"]
  ok    passo 10: a entrada historica para na ultima linha do arquivo — posicao="Ln 6, Col 1"

veredito: PASSOU (2 testes manuais)
```

A evidência da rolagem é o **cursor da barra** (a posição horizontal do controle
deslizante), e não os números de linha desenhados na margem: a janela do arnês não
desenha quadros o tempo todo, e a margem fica com o desenho antigo depois de uma
rolagem programática. O cursor da barra acompanha a rolagem na hora.

O passo 10 merece leitura: o arquivo `historico.js` termina com quebra de linha,
então o editor conta **seis** linhas — a última vazia. A faixa registrada (linha
100) não existe mais, e o salto para na última linha do que existe hoje.

### Situação

**aprovado.**

### Histórico de execução

Foram cinco execuções até passar, e cada reprovação encontrou um defeito de
verdade — três no produto.

**Primeira execução — 7 das 15 conferências reprovadas, só o arquivo abria.** O
salto abria o arquivo certo e parava em `Ln 1, Col 1`: não havia faixa de linhas
para revelar. A causa estava no ledger: `ChangeEvent.linesChanged` é declarado no
contrato e lido pela linha do tempo, mas **ninguém o gravava** — o
`changeRecorderService` montava o evento sem o campo. O produtor é da E3-T1, que
vem depois. Decidido com o usuário: um produtor mínimo já (`changedLineRange`, no
módulo do ledger), e a E3-T1 troca por hunks no mesmo campo.

**Segunda execução — as linhas apareceram, mas a lista só mostrava três.** Os
arquivos de teste não eram repositório git: sem "antes", o evento nasce parcial e
a faixa cobria o arquivo inteiro (`[1,200]`), o que fez o cursor parar na linha
200. Além disso, os ajudantes do teste procuravam linhas da lista pela posição no
DOM, e a view desenha poucas linhas de cada vez. Correções: o cenário monta um
repositório git (o commit é o "antes") e o passeio pela lista passou a andar com a
seta, que traz cada linha para a área visível.

**Terceira execução — as setas não andavam.** `ArrowDown` movia o foco e deixava a
seleção para trás: a lista do workbench só faz a seleção seguir o foco quando
recebe `selectionNavigation: true`, e a nossa não recebia. Com o ajuste, a seta
passou a trocar o evento ativo — e a conferência "o foco continua na lista"
continuou valendo.

**Quarta execução — o passeio parava na primeira linha.** O editor roubava o foco a
cada salto: sem opções vindas do gatilho, `openEditor` recebia `preserveFocus`
ausente, e ausente não é o mesmo que falso — o VS Code trata como "pode focar".
Corrigido com as opções padrão do produto (pré-visualização e foco onde estava),
que é o que a decisão D2 pedia desde o começo.

**Quinta execução — a centralização não era medida.** A conferência comparava os
números de linha desenhados na margem, que ficam velhos depois de uma rolagem
programática (a janela do arnês não desenha quadros o tempo todo). Trocada pelo
cursor da barra de rolagem, que acompanha a rolagem na hora. Nessa mesma passagem
os arquivos de teste passaram a ser `.ts`, `.js` e `.cs`, conforme a regra nova
do `CLAUDE.md`.

### Pendência registrada

A entrada histórica que aponta para linhas que já não existem para na última linha
do arquivo, **sem aviso**. O aviso de "esse trecho mudou desde então" é da E5-T1,
por decisão aprovada (D7); o salto não mente, mas também não explica.


## T-0009 — Salto sem centralizar a alteração

| Campo | Valor |
| --- | --- |
| Tarefa de origem | **E2-T4 — Salto ao local** (decisão D4) |
| Comando | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0009` |

### Objetivo

Provar o outro valor da configuração `watchCode.timeline.centerOnReveal`: com ela
desligada, o salto **não mexe na rolagem** quando as linhas alteradas já estão
visíveis. Sem este teste, só um dos dois modos ficaria comprovado.

### Pré-condições

- As mesmas do T-0008, com `.vscode/settings.json` no workspace preparado,
  escrito **antes** de o app abrir:

  ```json
  { "watchCode.timeline.centerOnReveal": false }
  ```

### Passos

1. Aperte **F5** duas vezes: o salto continua indo para `alvo.ts`, na linha 100.
2. Clique na linha do `alvo.ts` e arraste o cursor da barra de rolagem um pouco
   para baixo, de modo que a linha 100 continue visível.
3. Aperte **Enter**.

### Resultado esperado

- Passo 1: o arquivo abre com o cursor na linha 100, como no modo padrão.
- Passo 2: a barra anda depois do arrasto (senão a conferência do passo 3 não
  provaria nada).
- Passo 3: o cursor volta para a linha 100 e a rolagem **não se move**.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026:

```text
  ok    passo 1: o salto continua com a configuracao desligada — editor ativo="alvo.ts" posicao="Ln 100, Col 61 (60 selected)"
  ok    passo 2: a barra rolou a vista antes do Enter — cursor da barra 347 -> 367
  ok    passo 2: o salto nao rola a tela — cursor da barra 367 -> 367

veredito: PASSOU (2 testes manuais)
```

Os dois valores da configuração ficam assim comprovados na janela: com o padrão
(`true`), o passo 5 e o passo 7 do T-0008 mostram a rolagem voltando ao centro; com
`false`, o cursor da barra fica onde estava.

### Situação

**aprovado.**


## T-0010 — Sessão inteira percorrida

| Campo | Valor |
| --- | --- |
| Tarefa de origem | **E2-T5 — Fechamento da E2** |
| Comando | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0010` |

### Objetivo

Provar que uma **sessão inteira** de alterações do agente é navegável do começo ao
fim, e que o painel mostra exatamente o que o ledger gravou. O T-0008 provou cada
gesto do salto com dois arquivos e poucos eventos; o `run-e2e.ts` provou o ledger no
disco, sem interface. O que nenhum dos dois provava é a travessia: a lista inteira,
linha a linha, conferida contra a fonte de verdade.

Um teste automatizado não cobre isto porque a lista é **virtualizada** — só algumas
linhas existem no DOM por vez —, o app precisa estar montado, e o caminho medido é o
do usuário: a tecla, o arquivo que abre e a linha em que o cursor para.

### Pré-condições

- Build atualizado: `npm run transpile-client` (o arnês aborta se o `out/` estiver
  mais velho que `src/vs/workbench/contrib/watchCode/browser`).
- `git` disponível no PATH: o "antes" da primeira alteração de cada arquivo vem do
  `HEAD`.
- Nada mais: a pasta observada e o perfil isolado são criados pelo próprio arnês, em
  `%TEMP%/watchcode-manual/t-0010`.

### Passos

1. Prepare a pasta observada com cinco arquivos commitados: `src/alvo.ts` (200
   linhas), `src/apoio.js` (120), `src/servico.cs` (80), `src/modulo/indice.ts` (40)
   e `src/legado.js` (5). A subpasta `src/modulo` já existe no commit.
2. Abra a IDE nessa pasta, com perfil próprio, e confirme a observação ligada pela
   sonda: escreva `aquecimento.ts` e espere o evento dele no ledger.
3. Com o app aberto, escreva de fora — como faria um agente — seis alterações em
   sequência, com cerca de 400 ms entre elas: linha 100 do `alvo.ts`, linha 60 do
   `apoio.js`, linha 30 do `servico.cs`, linha 25 do `indice.ts`, o arquivo novo
   `src/modulo/regra.ts` com 12 linhas, e a remoção do `src/legado.js`.
4. Espere o ledger sossegar: sete eventos — a sonda e as seis alterações —, todos os
   seis na mesma sessão.
5. Selecione a primeira linha da timeline e percorra a lista apertando **F5** uma vez
   por evento. A cada passo, confira o nome do arquivo e a segunda faixa da linha
   (pasta, linhas, hora e origem) contra o evento correspondente do ledger, e confira
   o arquivo aberto e a posição do cursor.
6. Percorra de volta com **Shift+F5** e confira a ordem inversa.
7. Espere mais de 3 s e reescreva `src/alvo.ts` com 5 linhas de conteúdo.
8. Confira a lista de novo: oito linhas, a nova no fim, as sete anteriores
   inalteradas. Suba com **F5** até a entrada antiga do `alvo.ts`.

### Resultado esperado

- Passo 4: os seis eventos compartilham a sessão, e cada um tem a faixa esperada —
  `100`, `60`, `30`, `25`, `1-12` para o arquivo novo e nenhuma faixa para a remoção.
- Passo 5: cada passo seleciona a linha do evento, com a segunda faixa idêntica à do
  ledger; o editor abre o arquivo do evento e o cursor para na última linha da faixa
  (`Ln 100`, `Ln 60`, `Ln 30`, `Ln 25`, `Ln 12`, `Ln 1` para a sonda). Na remoção,
  nada abre e aparece o aviso "This change removed the file. Nothing to open.".
- Passo 6: a volta visita os mesmos arquivos na ordem inversa.
- Passo 8: a entrada nova entra no fim, o ledger rebaixa a antiga a `history`, e o
  salto até ela para na última linha do arquivo encurtado (`Ln 6`), **sem aviso** — a
  pendência registrada no T-0008, cujo aviso é escopo da E5-T1.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026. As 24
conferências do cenário, e as do arnês inteiro logo depois:

```text
T-0010 — Sessao inteira percorrida
      janela montada em 14s
      ledger: C:\Users\Gabriel S\AppData\Local\Temp\watchcode-manual\t-0010\user-data\User\workspaceStorage\cc6c077fb4771ae02eb9502db02675df\changeLedger
      observacao de pe: a sonda foi registrada em 2026-09-11T18:56:00.826Z
  ok    fase 1: o ledger tem a sonda e as seis alteracoes — eventos=7 primeiro="aquecimento.ts"
  ok    fase 1: a sonda usa extensao de codigo — sonda=aquecimento.ts
  ok    fase 1: as seis alteracoes estao na mesma sessao — sessoes=1
  ok    fase 1: cada alteracao tem a faixa de linhas esperada — faixas=["alvo.ts=100","apoio.js=60","servico.cs=30","indice.ts=25","regra.ts=1-12","legado.js="]
  ok    ida 1: a linha e a do evento do ledger — linha="aquecimento.ts | 1 · 15:56 · Disk" evento="aquecimento.ts | 1 · 15:56 · Disk"
  ok    ida 1: o cursor cai na faixa do evento — editor="aquecimento.ts" posicao="Ln 1, Col 20 (19 selected)"
  ok    ida 2: a linha e a do evento do ledger — linha="alvo.ts | src · 100 · 15:56 · Disk" evento="alvo.ts | src · 100 · 15:56 · Disk"
  ok    ida 2: o cursor cai na faixa do evento — editor="alvo.ts" posicao="Ln 100, Col 61 (60 selected)"
  ok    ida 3: a linha e a do evento do ledger — linha="apoio.js | src · 60 · 15:56 · Disk" evento="apoio.js | src · 60 · 15:56 · Disk"
  ok    ida 3: o cursor cai na faixa do evento — editor="apoio.js" posicao="Ln 60, Col 44 (43 selected)"
  ok    ida 4: a linha e a do evento do ledger — linha="servico.cs | src · 30 · 15:56 · Disk" evento="servico.cs | src · 30 · 15:56 · Disk"
  ok    ida 4: o cursor cai na faixa do evento — editor="servico.cs" posicao="Ln 30, Col 66 (65 selected)"
  ok    ida 5: a linha e a do evento do ledger — linha="indice.ts | src/modulo · 25 · 15:56 · Disk" evento="indice.ts | src/modulo · 25 · 15:56 · Disk"
  ok    ida 5: o cursor cai na faixa do evento — editor="indice.ts" posicao="Ln 25, Col 59 (58 selected)"
  ok    ida 6: a linha e a do evento do ledger — linha="regra.ts | src/modulo · 1-12 · 15:56 · Disk" evento="regra.ts | src/modulo · 1-12 · 15:56 · Disk"
  ok    ida 6: o cursor cai na faixa do evento — editor="regra.ts" posicao="Ln 12, Col 35 (401 selected)"
  ok    ida 7: a linha e a do evento do ledger — linha="legado.js | src · 15:56 · Disk" evento="legado.js | src · 15:56 · Disk"
  ok    ida 7: o arquivo removido avisa em vez de abrir — editor="regra.ts" avisos=["This change removed the file. Nothing to open."]
  ok    volta: o Shift+F5 percorre a mesma lista ao contrario — volta=["legado.js","regra.ts","indice.ts","servico.cs","apoio.js","alvo.ts","aquecimento.ts"]
  ok    fase 2: a entrada antiga do alvo vira historica — antiga=history nova=current
  ok    fase 2: a alteracao nova entra no fim da lista — lista=["aquecimento.ts","alvo.ts","apoio.js","servico.cs","indice.ts","regra.ts","legado.js","alvo.ts"]
  ok    fase 2: as linhas anteriores continuam iguais, na mesma ordem — antes=["aquecimento.ts | 1 · 15:56 · Disk","alvo.ts | src · 100 · 15:56 · Disk","apoio.js | src · 60 · 15:56 · Disk","servico.cs | src · 30 · 15:56 · Disk","indice.ts | src/modulo · 25 · 15:56 · Disk","regra.ts | src/modulo · 1-12 · 15:56 · Disk","legado.js | src · 15:56 · Disk"]
  ok    fase 2: a entrada antiga para na ultima linha do arquivo encurtado — posicao="Ln 6, Col 1" linhas do arquivo=6
  ok    fase 2: o salto para a entrada antiga nao avisa — avisos=[]

veredito: PASSOU (10 testes manuais)
```

O cenário rodou duas vezes e passou nas duas: sozinho (`T-0010`) e na execução do
arnês inteiro, que é a que está acima — os **dez** testes manuais passaram na mesma
execução. A travessia é a prova que faltava: a lista mostrou exatamente os eventos do
ledger, na mesma ordem, com a mesma pasta, faixa de linhas, hora e origem, e o editor
parou na linha de cada um.

Na primeira execução, sozinha, apareceu junto a notificação "Extension host did not
start in 10 seconds, that might be a problem." — aviso do perfil isolado recém-criado,
sem relação com a linha do tempo; na execução registrada acima ele não apareceu.

### Situação

**aprovado.**


## T-0011 — Pasta não é alteração

| Campo | Valor |
| --- | --- |
| Tarefa de origem | **E1-T7 — Pasta não é alteração** |
| Comando | `node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts T-0011` |

### Objetivo

Provar que uma pasta que nasce dentro do workspace **não é uma alteração**: ela não
entra no ledger, não aparece na linha do tempo e o produto não escreve erro no log.

Um teste de unidade prova a decisão do recorder sobre um sistema de arquivos em
memória. O que ele não prova é o que o watcher nativo entrega quando a pasta nasce de
verdade, nem o que fica escrito no log do aplicativo — e foi exatamente aí que o
defeito apareceu: no T-0010, que passou com 24 conferências, o perfil guardou a linha

```text
[error] [watchCode] failed to record src Unable to read file "...\workspace\src"
  (Error: ... that is actually a directory)
```

### Pré-condições

- Build atualizado: `npm run transpile-client` (o arnês aborta se o `out/` estiver
  mais velho que as pastas de `src/vs` que ele acompanha).
- Nada mais: a pasta observada e o perfil isolado são criados pelo próprio arnês, em
  `%TEMP%/watchcode-manual/t-0011`.
- Sem repositório git, de propósito: o arquivo novo nasce sem "antes", e o evento dele
  é parcial como o de qualquer arquivo criado fora de um repositório.

### Passos

1. Abra a IDE numa pasta observada vazia, com perfil próprio, e confirme a observação
   pela sonda: escreva `aquecimento.ts` e espere o evento dele no ledger.
2. Com o app aberto, crie de fora — como faria um agente — a pasta `src/pacote`, e
   nada dentro dela.
3. Espere 2 s e confira o ledger: só a sonda, e nenhum evento apontando para a pasta.
4. Escreva `src/pacote/regra.ts` com 12 linhas de código.
5. Espere o ledger sossegar e confira: dois eventos, o segundo é o do arquivo, com
   faixa `1-12`. Confira também a lista da timeline: `aquecimento.ts` e `regra.ts`,
   nenhuma linha da pasta.
6. Apague a pasta `src/pacote` inteira.
7. Espere 2 s, espere o ledger sossegar e conte quantos eventos apontam para a pasta
   e quantos para o arquivo.
8. Confira o log do perfil: nenhuma linha de erro ou aviso escrita pelo produto.

### Resultado esperado

- Passo 3: o ledger não cresceu com a pasta, e nenhum evento tem `src/pacote` como
  arquivo.
- Passo 5: um evento novo, e **só** ele — o do arquivo —, com a faixa do arquivo
  inteiro; a pasta não vira linha na lista.
- Passo 7: **medição**, não promessa. A remoção de pasta não foi corrigida nesta
  tarefa (decisão D2): o que se espera é o número, registrado no relatório.
- Passo 8: nenhuma linha `[error]` ou `[warning]` com o prefixo `[watchCode]` em
  `main.log` ou `window1/renderer.log`.

### Resultado obtido

Executado pelo arnês no aplicativo, em perfil isolado, em 11/09/2026. As sete
conferências do cenário, na execução do arnês inteiro:

```text
T-0011 — Pasta nao e alteracao
      janela montada em 16s
      ledger: C:\Users\Gabriel S\AppData\Local\Temp\watchcode-manual\t-0011\user-data\User\workspaceStorage\3acf366c761ceb314ad394c29e21bbe0\changeLedger
      observacao de pe: a sonda foi registrada em 2026-09-11T20:16:41.555Z
  ok    fase 1: a pasta sozinha nao vira evento — eventos da pasta=0
  ok    fase 1: o ledger nao cresceu com a pasta — eventos=1 sonda=1
  ok    fase 2: so o arquivo virou evento — eventos=2 ultimo="src/pacote/regra.ts"
  ok    fase 2: o arquivo novo tem a faixa do arquivo inteiro — faixa="1-12"
  ok    fase 2: a pasta nao aparece na linha do tempo — linhas=["aquecimento.ts","regra.ts"]
  ok    medicao (nao reprova): a pasta removida vira evento? — pasta=1 arquivo=1
  ok    log: o produto nao escreveu erro nem aviso — linhas=65 problemas=[]

veredito: PASSOU (11 testes manuais)
```

A pasta sozinha não mexeu no ledger, o arquivo dentro dela virou o único evento novo,
e a linha do tempo mostrou os dois arquivos — nenhuma linha da pasta. O log do perfil
saiu limpo: 65 linhas conferidas, nenhum erro nem aviso do produto. Antes da correção,
esse mesmo cenário deixava a linha `[error] [watchCode] failed to record src/pacote`.

O cenário rodou duas vezes: sozinho (`T-0011`, aprovado) e na execução do arnês
inteiro, que está acima — os **onze** testes manuais passaram na mesma execução, e a
varredura do log passou em todos eles, inclusive no T-0010, que é quem cria pasta nova
hoje.

**A medição do passo 7 achou um defeito que a tarefa não corrigiu.** Apagar a pasta
grava um evento para o **caminho da pasta** (`pasta=1`): a remoção não lê o disco,
então a decisão desta tarefa — "não é arquivo, não registra" — não a alcança. O evento
do arquivo removido (`arquivo=1`) é o legítimo. A pendência ficou registrada no
`overview.md`, junto da linha da E1-T7.

### Situação

**aprovado.**



