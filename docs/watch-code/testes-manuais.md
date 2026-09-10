# Testes manuais — Watch Code

Registro único dos testes manuais do projeto, conforme a regra em `CLAUDE.md`.
Testes são **acrescentados**, nunca substituídos.

---

## T-0001 — Baseline do "antes" com repositório git real

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | pendente |
| Data de execução | — |

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

_A preencher na execução._

### Observações

Se `beforeHash` vier **ausente**, o baseline caiu para o modo parcial: verifique se o commit do passo 1 foi feito de fato e se `git --version` responde no PATH do usuário que roda a IDE.

---

## T-0002 — Degradação para a sombra sem git

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T3 — Baseline do "antes" |
| Situação | pendente |
| Data de execução | — |

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

_A preencher na execução._

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha: é a regra do evento parcial do §4.1 do guia.

---

## T-0003 — Observação do disco pelo watcher nativo

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T4 — Watcher do workspace |
| Situação | pendente |
| Data de execução | — |

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

_A preencher na execução._

### Observações

O primeiro evento ser parcial é o comportamento **correto**, não uma falha — é a
mesma regra do T-0002. Repare que este teste também é o critério de fechamento da
E1: qualquer alteração feita fora da IDE vira um evento com arquivo, origem,
horário e snapshots corretos.

---

## T-0004 — Comando e indicador da observação

| Campo | Valor |
| --- | --- |
| Tarefa de origem | E1-T5 — Controle de observação |
| Situação | pendente |
| Data de execução | — |

### Objetivo

Comprovar que o comando `watchCode.toggleObservation` e o item da barra de status
funcionam na interface montada, e que **desligar realmente impede o registro de
eventos**.

Um teste automatizado não cobre isto porque a Paleta de Comandos e a barra de
status só existem com a interface montada e o Electron rodando. A suíte de unidade
testa o serviço (`toggle`, `onDidChangeActive`), mas não a contribuição de
interface que registra o comando e desenha o indicador.

### Pré-condições

- Build atualizado: `npm run compile-client` concluído sem erros.
- Uma pasta de teste. Ex.: `D:\tmp\wc-observacao`.
- A IDE aberta nessa pasta, pelo script `watchcode.bat`.

### Passos

1. Prepare a pasta de teste:

   ```powershell
   mkdir D:\tmp\wc-observacao
   "versao inicial" | Out-File -Encoding utf8 D:\tmp\wc-observacao\note.txt
   ```

2. Abra a pasta na IDE:

   ```powershell
   .\watchcode.bat D:\tmp\wc-observacao
   ```

3. Olhe a **barra de status**, na extremidade direita: deve haver um item com
   ícone de **olho aberto** e o texto `Watch Code`.

4. Passe o mouse sobre o item: o tooltip deve dizer `Watch Code is observing the
   workspace. Click to turn observation off.` (em inglês, porque o perfil isolado
   não tem pacote de idioma instalado).

5. Abra a Paleta de Comandos (`Ctrl+Shift+P`), digite `Watch Code` e confirme que
   aparece o item **Watch Code: Turn Observation On/Off**. Não execute ainda.

6. Execute esse comando. O ícone deve virar **olho fechado** e o tooltip deve
   passar para `Watch Code is not observing the workspace. Click to turn
   observation on.`

7. Anote quantos eventos existem hoje no workspace:

   ```powershell
   $raiz = "$env:LOCALAPPDATA\watchcode-udd\User\workspaceStorage"
   $eventos = Get-ChildItem -Recurse -Filter '*.json' $raiz |
     Where-Object { $_.FullName -like '*changeLedger\events\*' }
   "total de eventos: $($eventos.Count)"
   ```

8. Com a observação **desligada**, altere o arquivo fora da IDE:

   ```powershell
   "mudanca com observacao desligada" | Out-File -Encoding utf8 D:\tmp\wc-observacao\note.txt
   Start-Sleep -Seconds 3
   ```

9. Repita o comando do passo 7 e compare a contagem.

10. **Clique** no item da barra de status. O ícone deve voltar a ser olho aberto.

11. Altere o arquivo de novo:

    ```powershell
    "mudanca com observacao ligada" | Out-File -Encoding utf8 D:\tmp\wc-observacao\note.txt
    Start-Sleep -Seconds 3
    ```

12. Repita o comando do passo 7 e confirme o evento novo:

    ```powershell
    Select-String -Path ($eventos.FullName) -Pattern '"fileUri"' |
      ForEach-Object { $_.Line.Trim() }
    ```

### Resultado esperado

- Passo 3: o item `$(eye) Watch Code` está na barra de status, alinhado à direita,
  **sem** cor de alerta.
- Passo 5: o comando aparece na paleta, com a categoria `Watch Code`.
- Passo 6: o comando desliga a observação e o indicador acompanha **na hora**,
  sem recarregar a janela.
- Passo 9: a contagem é **igual** à do passo 7 — a escrita feita com a observação
  desligada **não** virou evento.
- Passo 10: o clique no indicador religa a observação, sem passar pela paleta.
- Passo 12: apareceu **exatamente um** evento novo, com `"fileUri"` apontando
  para `note.txt`.

### Resultado obtido

_A preencher na execução._

### Observações

Se o passo 9 mostrar um evento novo, a observação **não** foi realmente desligada —
verifique no passo 6 se o ícone chegou a mudar. Como o `start()` não faz varredura
de recuperação, um evento faltando no passo 12 significa que a religação não
aconteceu, e não que a escrita foi ignorada por acaso.

