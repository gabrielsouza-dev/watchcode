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
- **T-0001**, **T-0002** e **T-0003** foram reprovados pelo defeito aberto no fim
  deste arquivo.

---

## T-0001 — Baseline do "antes" com repositório git real

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | reprovado |
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
- o snapshot do "antes" guarda `linha original` e o do "depois", `linha alterada`.

O que não bateu foi a contagem: o ledger gravou **dois** eventos para essa única
escrita (`…880387` e `…880433`, 46 ms de diferença), e o esperado é um. Ver o
**defeito aberto** no fim deste arquivo.

### Observações

Se `beforeHash` vier **ausente**, o baseline caiu para o modo parcial: verifique se o commit do passo 1 foi feito de fato e se `git --version` responde no PATH do usuário que roda a IDE.

---

## T-0002 — Degradação para a sombra sem git

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | reprovado |
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

O que não bateu foram as contagens e a ordem. Cada escrita virou **dois** eventos,
então o ledger ficou com quatro em vez de dois — e a posição que o teste esperava
ser a segunda escrita é a cópia da primeira, com `antes=ausente`. Ver o **defeito
aberto** no fim deste arquivo.

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha: é a regra do evento parcial do §4.1 do guia.

---

## T-0003 — Observação do disco pelo watcher nativo

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T4 — Watcher do workspace |
| Situação | reprovado |
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
- Os dois eventos têm `"source": "agent"`, `"attribution": "observed"` e
  `"status": "current"`.
- O `afterHash` do segundo evento corresponde ao snapshot com `versao tres`.
- Alterar o arquivo do PowerShell **não** dispara nenhuma ação da IDE: o evento
  nasce da observação do disco, não de um comando da interface.

### Resultado obtido

Executado duas vezes em 10/09/2026 pelo arnês (Playwright), com o mesmo cenário:
pasta sem git, `note.txt` na raiz, duas escritas separadas por três segundos e o
indicador da observação conferido antes de medir.

O watcher nativo detectou as duas escritas, e a origem está certa em todos os
eventos (`agent`/`observed`).

O que não bateu foi a partição: cada escrita virou **dois** eventos, com a mesma
`sessionId` dentro do par, então a contagem ficou em quatro em vez de dois, um dos
duplicados saiu `status=history` e o par da primeira escrita foi lido como se fosse
as duas escritas. Ver o **defeito aberto** abaixo.

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha — é a
mesma regra do T-0002. Repare que este teste também é o critério de fechamento da
E1: qualquer alteração feita fora da IDE vira um evento com arquivo, origem,
horário e snapshots corretos.

---

## Defeito aberto — uma escrita vira dois eventos

Descoberto pelos testes T-0001 a T-0003 em 10/09/2026. **Não corrigido**: depende
de decisão sobre a regra de descarte.

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

### Correção — pendente de decisão

1. **No serviço de observação**: guardar o estado já entregue por arquivo
   (caminho, `mtime` e tamanho) e ignorar a repetição do mesmo estado dentro de uma
   janela curta. Não lê nada a mais; depende de o sistema de arquivos carimbar dois
   instantes diferentes para duas escritas de verdade.
2. **No recorder**: guardar o último hash de conteúdo gravado por arquivo e não
   registrar quando o arquivo no disco tem exatamente esse conteúdo — a alteração
   não existiu. Exato por conteúdo e cobre qualquer entrega repetida.

