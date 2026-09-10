# Watch Code — Tarefas

O desenvolvedor **não escreve código** nesta IDE: ele lê, navega e registra propostas que o agente aplica. A linha do tempo mostra alterações do agente, capturadas do disco.

## Modo de utilização do workflow

- **Workflow High** — toda implementação.
- **Workflow Medium** — correção de bugs.
- **Workflow Low** — pequenas alterações.

O critério é o tipo de trabalho; a complexidade confirma. Impacto arquitetural, contratos ou múltiplos componentes levam a tarefa para o **High**, mesmo que seja pequena ou uma correção. Em caso de dúvida, use o workflow mais rigoroso (High).

Cada tarefa da lista abaixo é executada como **um ciclo completo** do workflow: especificação em `docs/watch-code/SPECS/<id>.md`, implementação, validação e relatório.

O status de cada tarefa é acompanhado no backlog de `docs/watch-code/Workflow/overview.md`.

## Lista de tarefas — ordem de desenvolvimento

### E0 · Enxugamento do fork (antes da E1)

- **E0-T1** Destravar a toolchain — componente Spectre do MSVC e `npm install`
- **E0-T2** Extensões embarcadas — 30 inúteis fora; listas de build limpas
- **E0-T3** Módulos de core inúteis — 12 contribs removidos, 4 ocultados por acoplamento irmão
- **E0-T4** Ocultação declarativa — `deregisterViewContainer` para o que é caro de apagar
- **E0-T5** Fechamento — compila, roda e a interface fica limpa

Regra da E0: **baixo acoplamento apaga, alto acoplamento esconde.**

### E1 · Núcleo: contratos, ledger e captura por disco

- **E1-T1** Contratos do evento — interfaces, schema, validação
- **E1-T2** Ledger e snapshots — store por hash, persistência por workspace
- **E1-T3** Baseline do "antes" — git `HEAD` e store de sombra; evento parcial
- **E1-T4** Watcher do workspace — escrita externa, agrupamento por pausa
- **E1-T5** Controle de observação — ativar/desativar pela interface, com indicador de estado
- **E1-T6** Fechamento — com a observação ligada, um script altera arquivos e o ledger fica correto

### E2 · Timeline e navegação

- **E2-T1** Serviço de timeline — consultas cronológicas, `current`/`history`
- **E2-T2** View da timeline — lista na Activity Bar
- **E2-T3** Anterior/Próximo — comandos e keybindings
- **E2-T4** Salto ao local — abrir e revelar as linhas
- **E2-T5** Fechamento — percorrer uma sessão inteira

### E3 · Diff, cores e modos

- **E3-T1** Cálculo de diff — hunks e ranges a partir dos snapshots
- **E3-T2** Documentos virtuais — `aih-before:` e `aih-after:`
- **E3-T3** Decorações — verde adicionado, vermelho removido
- **E3-T4** Modos de visualização — só alterações / só anterior / ambos
- **E3-T5** Fechamento — antes/depois claro nos três modos

### E4 · Ponte `.md` com o agente

- **E4-T1** Registrar proposta — comando "Sugerir alteração" com arquivo, linhas e contexto
- **E4-T2** Proposta em TODO — variante do mesmo registro, com `kind: 'todo'`
- **E4-T3** Writer do `.md` — índice, append-only, status
- **E4-T4** Instrução plantada — bloco marcado em `CLAUDE.md`/`AGENTS.md`
- **E4-T5** Skill leitora — agente marca `ack`/`done`
- **E4-T6** Fechamento — dev registra uma proposta e o agente responde

### E5 · Robustez

- **E5-T1** Atualidade e histórico — `current`→`history` com aviso
- **E5-T2** Proposta desatualizada — aviso quando o trecho já mudou
- **E5-T3** Retenção e agrupamento — armazenamento e ruído de escrita em massa

### E6 · Integração opcional por agente

- **E6-T1** Injeção de hook pela IDE — merge idempotente na config local do agente
- **E6-T2** CLI de anúncio — `aih-hook` anuncia sessão e turno em `.aih/events.jsonl`
- **E6-T3** Fechamento — turno do agente agrupado como uma sessão

### E7 · Identidade visual

- **E7-T1** Ícone e identidade visual — produto, Activity Bar e editor