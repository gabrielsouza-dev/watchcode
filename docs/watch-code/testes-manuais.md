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
