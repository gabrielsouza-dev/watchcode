# Especificação — E1-T6 · Fechamento da E1

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T6 — Fechamento da E1 |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Entrada | @docs/watch-code/PLANS/e1-t6-fechamento-da-e1.md |
| Saída | Este arquivo → Developer |
| Próxima etapa | Developer |

## 1. Referência

Plano: @docs/watch-code/PLANS/e1-t6-fechamento-da-e1.md — aprovado com **D1 = A**,
**D2 = A** e **D3 = A**.

Validação de origem, em @docs/watch-code/Workflow/overview.md §9: *ponta a ponta
universal — um script Node (sem agente nenhum) altera arquivos do workspace e a
linha do tempo precisa refletir cada alteração com antes/depois*.

## 2. Comportamento esperado

### 2.1 As quatro peças

| Peça | Arquivo | Responsabilidade |
| --- | --- | --- |
| Estímulo | `docs/watch-code/e2e/write-changes.ts` | Altera os arquivos do workspace seguindo a sequência do §2.2 e grava o manifesto de expectativa |
| Verificador | `docs/watch-code/e2e/verify-ledger.ts` | Lê o ledger do perfil e confere as invariantes do §3.4 contra o manifesto |
| Executor | `docs/watch-code/e2e/run-e2e.ts` | Prepara a pasta e o perfil, confere o frescor do `out/`, abre o app, estimula, espera, fecha e verifica |
| Guia | `docs/watch-code/e2e/README.md` | Como executar, o que é criado e o que fica para trás |

Nenhuma peça importa código do produto: o arnês observa o ledger pelo disco, do
lado de fora, como um agente qualquer faria. É isso que o mantém honesto — se o
ledger estiver errado, ele acusa.

### 2.2 A sequência do estímulo

Estado inicial, criado e commitado pelo executor **antes** de o app abrir. Como
o app ainda não estava observando, nada disso pode virar evento:

| Arquivo | Conteúdo |
| --- | --- |
| `src/app.ts` | `export const app = 1;\n` |
| `src/legacy.ts` | `export const legacy = true;\n` |
| `README.md` | `# pasta de teste do e2e\n` |

Antes da sequência medida vem o **aquecimento**, fora da contagem de casos: o
estímulo escreve `src/aquecimento.ts` e só segue depois de ver o evento dele no
ledger. É a prova de que a observação estava ligada, e não uma presunção — o
workbench leva alguns segundos para montar depois de a janela existir.

Sequência de escritas. `t0`, `t1` e `t2` são os instantes de referência; os
intervalos são medidos entre escritas consecutivas:

| id | instante | arquivo | tipo | conteúdo escrito | antes esperado | sessão |
| --- | --- | --- | --- | --- | --- | --- |
| w0 | antes de `t0` | `src/aquecimento.ts` | added | `// aquecimento\n` | nenhum | `s0` |
| w1 | t0 | `src/app.ts` | updated | `export const app = 2;\n` | git: `export const app = 1;\n` | s1 |
| w2 | t0 + 400 ms | `src/app.ts` | updated | `export const app = 3;\n` | git: `export const app = 1;\n` | s1 |
| w3 | t0 + 800 ms | `src/novo.ts` | added | `// criado agora\n` | nenhum | s1 |
| w4 | t0 + 1200 ms | `src/outro.ts` | added | `// outro\n` | nenhum | s1 |
| — | pausa de 2500 ms | | | | | |
| w5 | t1 | `src/novo.ts` | updated | `// criado agora, v2\n` | sombra: `// criado agora\n` | s2 |
| w6 | t1 + 400 ms | `src/legacy.ts` | deleted | — | git: `export const legacy = true;\n` | s2 |
| — | pausa de 2500 ms | | | | | |
| w7 | t2 | `node_modules/pacote/index.js` | ignored | `module.exports = {};\n` | n/a | nenhum evento |

O que cada linha prova:

- **w0** — ao menos um evento chegou: a observação está ligada. Sem ele, uma
escrita cedo demais produziria um ledger vazio em vez de um erro.
- **w1** — o antes vem do git `HEAD`.
- **w2** — o antes **continua** sendo o do `HEAD`: o git responde sempre que tem
  resposta, e a sombra só entra onde ele não tem. A alteração anterior não desloca
  o baseline de uma alteração seguinte do mesmo arquivo versionado.
- **w3** — sem git e sem sombra, o evento nasce **parcial**, sem `beforeHash`.
  Ausência de antes aqui é acerto, não falha.
- **w4** — arquivo novo chega ao watcher como `added` **e** `updated` no mesmo
  lote; a coalescência do serviço tem de produzir **um** evento, não dois.
- **w5** — onde o git não responde, a sombra responde: o antes é o conteúdo da
  última escrita observada. É a cadeia funcionando.
- **w6** — remoção gera evento sem `afterHash`.
- **w7** — `node_modules` é ruído por contrato (`ignoredPaths.ts`) e não pode
  gerar evento nenhum.

Três sessões: o aquecimento em `s0`, quatro escritas em `s1` (todas dentro de
1500 ms) e `w5` e `w6` em `s2`, depois da pausa de 2500 ms. `w7` não gera evento
e não tem sessão.

O ledger **não guarda o tipo da alteração** (`ChangeEvent` não tem campo `kind`):
`added` e `updated` só se distinguem pela presença ou ausência do antes, e é isso
que o verificador confere. O campo `kind` do manifesto existe para o leitor e
para decidir se o write é removível.

### 2.3 O que o executor faz

1. **Fecha sobras**: mata processos cuja linha de comando cite o perfil do e2e,
   de uma execução anterior interrompida.
2. **Limpa** a pasta de trabalho (`%TEMP%/watchcode-e2e`), o perfil e o manifesto,
   para a execução não herdar o ledger da anterior.
3. **Prepara o workspace** do §2.2: cria os arquivos, `git init`, identidade local
   (`user.name` e `user.email` no próprio repositório, sem depender da global),
   `git add -A` e `git commit`.
4. **Confere o frescor** do `out/` (§5, B3). Se estiver velho, aborta imprimindo o
   comando a rodar.
5. **Abre o app**: `.build/electron/Code - OSS.exe`, com a pasta do workspace como
   argumento posicional, `--user-data-dir` e `--extensions-dir` próprios do e2e e
   `--disable-workspace-trust`; ambiente `NODE_ENV=development`, `VSCODE_DEV=1`,
   `VSCODE_CLI=1`, `VSCODE_SKIP_PRELAUNCH=1`.
6. **Espera o app**: primeiro o `workspace.json` sob
   `<perfil>/User/workspaceStorage/*` cujo campo `folder` aponte para a pasta
   observada, e depois a própria janela, consultada pelo depurador, até o
   workbench estar montado (`.monaco-workbench .statusbar`). Teto de 180 s, mais
   3 s de acomodação. O `workspace.json` nasce cerca de dez segundos antes da
   interface: medir só por ele liberava o estímulo cedo demais.
7. **Roda o estímulo** como processo filho, com a saída no mesmo fluxo e a
   pasta de eventos do ledger, para a espera do aquecimento.
8. **Espera o ledger estabilizar**: conta os arquivos de `events/` até passar 3 s
   sem nenhum novo, com teto de 60 s (B7).
9. **Fecha o app**: `taskkill` na árvore do processo que ele mesmo abriu e, como
   rede de segurança, nos processos cuja linha de comando cite o perfil.
10. **Registra o watcher em uso**: procura no log mais recente do perfil a menção
    à biblioteca escolhida (`parcel` ou `nodejs`) e imprime como evidência (B13).
11. **Roda o verificador** e termina com o código de saída dele.

O executor não julga nada: quem decide passou ou falhou é o verificador.

## 3. Contratos

### 3.1 O manifesto de expectativa

Escrito pelo estímulo, lido pelo verificador. É o único acoplamento entre os dois:

```ts
/** Uma escrita do estímulo, com o que ela deve produzir no ledger. */
interface IE2EWrite {
	/** Identificador curto, usado nas mensagens. */
	readonly id: string;
	/** Caminho relativo à pasta observada, com barra normal. */
	readonly fileUri: string;
	readonly kind: 'added' | 'updated' | 'deleted' | 'ignored';
	/** Instante da escrita, em epoch de milissegundos. */
	readonly at: number;
	/** Rótulo da sessão esperada; null quando a escrita não deve gerar evento. */
	readonly session: string | null;
	readonly beforeOrigin: 'git' | 'shadow' | 'none' | 'n/a';
	/** sha1 do conteúdo escrito; ausente em 'deleted' e em 'ignored'. */
	readonly contentSha1?: string;
	/** sha1 esperado do conteúdo anterior; ausente quando não há antes. */
	readonly beforeSha1?: string;
}

/** O que o estímulo fez e o que o ledger deve mostrar. */
interface IE2EManifest {
	readonly schema: 1;
	/** Pasta observada, em caminho nativo. */
	readonly workspace: string;
	/** Instante em que a sequência terminou. */
	readonly finishedAt: number;
	readonly writes: readonly IE2EWrite[];
}
```

Regras de preenchimento, que o verificador confere antes de olhar o ledger:

- `kind: 'ignored'` exige `session: null`, `beforeOrigin: 'n/a'` e nenhum hash.
- `kind: 'deleted'` não tem `contentSha1`.
- `beforeOrigin: 'none'` não tem `beforeSha1`; os outros dois têm.
- `beforeOrigin: 'git'` implica que o arquivo estava versionado no instante da
  escrita, e o hash é o do conteúdo no `HEAD`.

### 3.2 Interface de linha de comando

Os três scripts rodam com o Node do projeto, com remoção de tipos embutida:

```
node --experimental-strip-types <script>.ts <argumentos>
```

| Script | Argumentos | Saída | Código |
| --- | --- | --- | --- |
| `write-changes.ts` | `<pastaObservada> <caminhoDoManifesto> [pastaDeEventos]` | Uma linha por escrita, na ordem | 0 terminou; 1 falhou (o manifesto **não** é gravado) |
| `verify-ledger.ts` | `<caminhoDoManifesto> <pastaDePerfil>` | Uma linha por invariante: `ok   I3 ...` ou `FALHA I3 ...` com o detalhe | 0 todas passaram; 1 alguma falhou; 2 o ledger não foi encontrado |
| `run-e2e.ts` | `[--workspace <pasta>] [--user-data <pasta>] [--manifest <arquivo>]` | O log da execução inteira, com as saídas dos filhos e o veredito | 0 o verificador passou; 1 o executor abortou ou o verificador falhou |

Sem argumento, o executor usa `%TEMP%/watchcode-e2e/workspace`,
`%TEMP%/watchcode-e2e/user-data` e `%TEMP%/watchcode-e2e/manifest.json`.

### 3.3 O que o verificador lê

Com a pasta observada vinda do manifesto, o verificador procura em
`<pastaDePerfil>/User/workspaceStorage/*/workspace.json` a entrada cujo campo
`folder` aponte para ela, e daí deriva:

| Caminho | Conteúdo | Uso |
| --- | --- | --- |
| `<id>/changeLedger/events/*.json` | Um evento por arquivo | O material da verificação |
| `<id>/changeLedger/index/*.json` | Índice por arquivo: `fileUri`, `eventIds`, `currentEventId` | Invariante I7 |
| `<id>/changeLedger/snapshots/<sha1>` | Conteúdo endereçado por hash | Invariante I5 |

O identificador da pasta no perfil é derivado da URI do workspace pelo próprio
editor, e o verificador descobre a pasta pelo `folder` do `workspace.json` — ele
não recalcula nem `workspaceId` nem a chave do índice.

O hash de conteúdo é **SHA-1 em hexadecimal minúsculo do conteúdo bruto**
(`computeContentHash` → `hashAsync`), e o verificador o recalcula com
`createHash('sha1')`.

### 3.4 Invariantes

| # | Invariante |
| --- | --- |
| I1 | Os `fileUri` presentes nos eventos são exatamente os dos writes com `kind` diferente de `ignored`; nenhum outro caminho aparece, e `node_modules` não aparece em evento nenhum |
| I2 | Para cada arquivo, o número de eventos é igual ao número de writes daquele arquivo, e a ordem cronológica dos eventos casa com a ordem das escritas |
| I3 | O `afterHash` de cada evento é igual ao `contentSha1` da escrita correspondente; ausente quando a escrita é removível |
| I4 | O `beforeHash` de cada evento é igual ao `beforeSha1` da escrita; ausente quando a escrita não declara antes |
| I5 | Todo hash citado em evento existe em `snapshots/` e o sha1 do conteúdo guardado é igual ao próprio nome do arquivo |
| I6 | Só o último evento de cada arquivo está `current`; todos os anteriores estão `history` |
| I7 | O índice do arquivo lista todos os seus eventos, em ordem, e `currentEventId` é o do último |
| I8 | Todo evento tem `source: 'agent'` e `attribution: 'observed'` |
| I9 | A partição dos eventos por `sessionId` é idêntica à partição pelas sessões declaradas no manifesto: eventos do mesmo rótulo compartilham o id, e rótulos diferentes nunca compartilham |
| I10 | No disco ao final: para cada arquivo vivo, o sha1 do conteúdo atual é igual ao `afterHash` do último evento; o arquivo removido não existe mais |
| I11 | O `timestamp` de cada evento está entre `at - 2000` e `finishedAt + 2000` da escrita correspondente |
| I12 | O manifesto é internamente consistente (§3.1) e nenhum arquivo do estado inicial aparece em evento |

As invariantes são checadas **todas**, sem parar na primeira: o valor do relatório
está em ver o quadro inteiro. O código de saída é 1 se qualquer uma falhar.

## 4. Alterações necessárias

| Arquivo | Ação | O que contém |
| --- | --- | --- |
| `docs/watch-code/e2e/write-changes.ts` | novo | O estímulo e a escrita do manifesto |
| `docs/watch-code/e2e/verify-ledger.ts` | novo | O verificador e as doze invariantes |
| `docs/watch-code/e2e/run-e2e.ts` | novo | O executor |
| `docs/watch-code/e2e/README.md` | novo | Como executar e o que fica para trás |
| `docs/watch-code/Workflow/overview.md` | alterado | E1-T6 em `feito`, etapa E1 fechada e o comando do e2e no §9 |
| `docs/watch-code/testes-manuais.md` | provavelmente inalterado | Só muda se a execução criar teste manual novo; o esperado é que não crie |
| `src/vs/platform/changeLedger/common/changeRecorderService.ts` | **alterado em D3** | Guarda o "antes" no store de snapshots (§4.1, defeito 2) |
| `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts` | **alterado em D3** | Adaptador que liga o leitor do git ao recorder (§4.1, defeito 1) |
| `src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts` | **alterado em D3** | Um teste para o store do "antes" |

Todos os três `.ts` são **ferramentas de desenvolvimento**, não código do
produto: ficam fora de `src/`, fora do `tsconfig` de compilação e fora da camada
de produto. Por isso não entram na conferência de camadas. Em compensação, são
arquivos versionados e obedecem ao repositório: cabeçalho de copyright, tabela de
indentação, comentários em português com o marcador de acentuação e estilo do
eslint e do prettier. Os tipos deles não são conferidos por compilador nenhum —
servem de contrato legível, e a única rede é o próprio verificador.

### 4.1 Defeitos encontrados e correções (D3 = A)

A caixa do caminho, que era o risco número um do plano, **não** se confirmou: a
URI da pasta e os caminhos do watcher saem os dois do disco, e o `fsPath` do
produto já normaliza a letra do drive. O que apareceu foi outra coisa.

**Defeito 1 — o git `HEAD` nunca era consultado.**

- *Causa:* o registro do recorder passava o leitor do git como argumento estático
do `SyncDescriptor`, na forma `accessor => accessor.get(...)`. O serviço de
injeção **não executa fábrica nenhuma** nos argumentos estáticos: eles chegam
crus ao construtor. A lambda era então chamada com um caminho no lugar do
`accessor`, lançava `TypeError`, e o `try/catch` do `BaselineProvider` engolia a
falha — que existe justamente para o git não derrubar a captura.
- *Efeito:* todo "antes" caía para a sombra, em silêncio, inclusive em arquivo
versionado. O produto parecia funcionar e nunca mostrava o diff desde o commit.
- *Correção:* um adaptador no arquivo de registro resolve os serviços e passa o
leitor pronto ao recorder. Nenhum contrato muda: o recorder da plataforma
continua recebendo a leitura do "antes" como função.
- *Cobertura:* ponta a ponta (w1, w2 e w6 exigem o "antes" do git).

**Defeito 2 — o "antes" vindo do git não entrava no store de snapshots.**

- *Causa:* o recorder guardava só o conteúdo atual; o baseline era usado para o
hash, e o `content` devolvido pelo resolvedor era descartado.
- *Efeito:* o evento apontava para um hash que não existia em `snapshots/`. O
critério 5 do plano exige o contrário, e sem esse conteúdo o diff da E3 não tem
de onde ler o outro lado da alteração — logo, o caso mais importante, o do
arquivo versionado, ficaria sem comparativo.
- *Correção:* guardar o conteúdo do baseline, que é idempotente por ser
endereçado por hash.
- *Cobertura:* invariante I5 e um teste de unidade novo.

**Defeito 3 — pasta tratada como arquivo (PENDENTE DE DECISÃO).**

- *Causa:* o watcher do serviço de arquivos não distingue arquivo de pasta, e o
contrato do recorder manda rejeitar quando o conteúdo esperado não pode ser lido.
- *Efeito:* ao nascer `src/novo.ts`, a pasta `src` também chega como alteração, a
leitura falha e o log registra `[watchCode] failed to record src`. O ledger fica
**correto** — nenhum evento entra —, mas o produto grava erro onde não houve erro.
- *Correção proposta:* `recordChange` devolver `Promise<ChangeEvent | undefined>`,
onde `undefined` significa "a alteração não era de arquivo". É mudança de
contrato e depende do usuário; enquanto isso, o comportamento atual é o do §4.1.
- *Cobertura:* não verificável hoje sem decidir o contrato.

## 5. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | O caminho do e2e contém espaço (o perfil do usuário tem `Gabriel S`, e o executável se chama `Code - OSS.exe`) | A pasta vai como argumento posicional, nunca por `--folder-uri`, e o executável é aberto por caminho, com os argumentos em lista |
| B2 | O caminho é o mesmo, escrito com caixa diferente do que o disco reporta | A pasta é normalizada com `realpathSync` antes de ser passada ao app, para a URI da pasta e os caminhos do watcher virem da mesma origem |
| B3 | `out/` mais velho que `src/` | Aborta com `npm run compile-client` na mensagem. O par conferido é, para `platform/changeLedger/common`, `workbench/services/changeLedger/electron-browser` e `workbench/contrib/watchCode/browser`, o `.js` compilado mais novo contra o `.ts` mais novo |
| B4 | `git` fora do PATH | Aborta antes de abrir o app: w1, w2 e w6 dependem do `HEAD` para o antes |
| B5 | Sobra de execução anterior segurando o perfil | Mata pelo perfil antes de limpar; se o perfil continuar travado, aborta dizendo qual processo segura |
| B6 | O app não registra a pasta em 180 s | Aborta imprimindo o fim do log mais recente do perfil |
| B7 | O ledger não estabiliza em 60 s | Segue para a verificação com o que houver; o executador registra no log quantos eventos viu e o verificador acusa o que faltar |
| B8 | Duas escritas no mesmo arquivo chegando coalescidas | O estímulo separa por 400 ms. Se ainda assim coalescer, I2 acusa a contagem — é achado, não ruído |
| B9 | A extensão de git do editor toca `.git/` durante a execução | `.git` é ignorado por segmento; se aparecer evento de lá, I1 acusa |
| B10 | O próprio ledger escrevendo dentro do workspace observado | Impossível por construção: o ledger mora no perfil. Se aparecer evento de dentro dele, I1 acusa |
| B11 | Remoção chegando no mesmo lote da escrita anterior | `KIND_PRIORITY` faz o removido vencer; o estímulo ainda separa por 400 ms |
| B12 | Uma escrita falha no meio da sequência | O estímulo aborta sem gravar o manifesto e o executor não roda o verificador — expectativa parcial não verifica nada |
| B13 | A biblioteca nativa de watcher indisponível | O editor cai para o watcher de Node. A prova continua valendo; o executor imprime a biblioteca em uso como evidência |
| B14 | A pasta observada dentro de um caminho com acento ou caractere fora de ASCII | Fora do controle do arnês: o caminho vem do `%TEMP%` do perfil. Se acontecer, o erro aparece na comparação do `workspace.json` e o executor aborta nomeando a pasta esperada |

## 6. Plano de testes

### 6.1 O ponta a ponta é o teste

```
node --experimental-strip-types docs/watch-code/e2e/run-e2e.ts
```

Passa quando o verificador termina em 0 com as doze invariantes em `ok`. A saída
da execução é a evidência, e vai para o relatório da tarefa.

### 6.2 Testes do módulo

```
npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"
```

Os 92 testes atuais precisam continuar passando. Se D3 disparar, cada correção
acrescenta teste próprio e o total sobe.

### 6.3 Validação do repositório

```
npx tsc --noEmit -p src/tsconfig.json
npm run valid-layers-check
node --experimental-strip-types build/hygiene.ts
```

A higiene só enxerga o que está no índice do git, então os arquivos novos
precisam estar adicionados antes de rodar. Os três `.ts` do arnês passam por
eslint, prettier, copyright e indentação.

### 6.4 Teste manual

Nenhum teste manual novo. O T-0003 e o T-0004 seguem `pendente` como herança da
E1-T4 e da E1-T5 e são informados no relatório. O arnês é automático e não
substitui a conferência visual do comando e do indicador.

## 7. Critérios de aceite

1. O estímulo altera arquivos do workspace e não importa nada do produto.
2. O verificador lê o ledger do perfil pelo disco e não importa nada do produto.
3. O executor abre, estimula, fecha e verifica sem intervenção manual.
4. Uma execução real conclui com as doze invariantes em `ok`.
5. w0 prova que a observação estava ligada antes de a sequência medida começar.
6. w1 e w2 provam o antes vindo do `HEAD`, inclusive na segunda alteração.
6. w3 prova o evento parcial: arquivo novo sem `beforeHash`.
7. w5 prova o antes vindo da sombra e a cadeia entre eventos do mesmo arquivo.
8. w6 prova a remoção: evento sem `afterHash`.
9. w7 prova que caminho ignorado não vira evento.
10. w4 prova que arquivo novo gera um evento só, e não dois.
11. A partição por sessão dos eventos é igual à declarada no manifesto.
12. O estado final do disco casa com o último evento de cada arquivo.
13. Os 93 testes do módulo passam, e `tsc`, `valid-layers-check`, `eslint` e
    `hygiene` passam.
14. O backlog marca a E1-T6 como `feito` e a etapa E1 como fechada.
15. Nenhum arquivo é alterado fora da lista do §4, salvo correção de D3, que
    entra registrada com causa e teste.

## 8. Decisões

**Aprovadas pelo usuário** (registradas no plano, §7):

- **D1 = A** — o arnês fica permanente em `docs/watch-code/e2e/`.
- **D2 = A** — a execução é conduzida por um executor automatizado, em perfil
  isolado próprio.
- **D3 = A** — defeito encontrado no núcleo é corrigido dentro da E1-T6.

**Divergências do plano, registradas:**

1. **Linguagem do arnês.** O plano (§2.1 e §5.1) previa `.mjs` para os scripts e
   PowerShell para o executor. O arnês fica todo em TypeScript executado por
   `node --experimental-strip-types`. Dois motivos: `build/hygiene.ts` recusa
   arquivo `.js`, `.cjs` ou `.mjs` novo fora da lista permitida — a mensagem do
   próprio repositório diz para usar `.ts` —, e montar linha de comando de
   Electron em PowerShell com espaço no caminho é frágil. Um executor em Node
   abre o processo por caminho, com argumentos em lista, e fecha a árvore pelo
   identificador que ele mesmo recebeu ao abrir. `docs/watch-code/skills/launch/scripts/`
   já tem `.ts` rodado por Node, então o padrão existe no projeto. Decisão local,
   reversível e alinhada ao que já se faz aqui: tomada sem consulta, conforme o
   `CLAUDE.md`.
2. **O antes de um arquivo versionado é sempre o do `HEAD`.** Não é divergência de
   execução, é registro explícito de um comportamento que o plano não nomeava: a
   partir da E1-T6 o estímulo **afirma** isso em w2. A sombra só responde onde o
   git não responde, como o guia pede em §8.4. Consequência aceita: a segunda
   alteração de um arquivo versionado mostra o diff acumulado desde o commit, não
   o diff incremental. Se o produto um dia quiser o incremental, é decisão de
   produto e entra pela E5, não por aqui.

3. **A prontidão não é presumida.** O plano dizia apenas que o executor espera o
   app abrir. A execução mostrou que `workspace.json` nasce cerca de dez segundos
   antes de o workbench montar, então a especificação passou a exigir dois sinais:
   a janela montada, consultada pelo depurador, e o evento de aquecimento. É
   reforço de garantia, não mudança de escopo.
4. **O `app-output.log`.** Passou a ser capturado pelo executor para dar contexto
   quando a execução aborta. É instrumento de diagnóstico, não contrato.

**Decisão pendente:** o defeito 3 do §4.1 (pasta tratada como arquivo) depende de
aprovação para mudar o contrato de `recordChange`. Não bloqueia a E1-T6: o ledger
está correto, e o que resta é ruído no log.

## 9. Fora de escopo

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Teste de unidade com disco e watcher nativo no `npm run test-node` | Watcher nativo em teste de unidade é instável e não prova o app montado | E5 |
| Levar o relatório do e2e para o CI | O projeto não tem pipeline para o fork ainda | — |
| Verificação visual do comando e do indicador | É o T-0004, da E1-T5 | T-0004 |
| Medir desempenho do watcher em repositório grande | É ruído de escrita em massa | E5-T3 |
| Timeline na interface | A E1 prova o ledger; quem mostra é a E2 | E2-T2 |
| Hook do agente | Canal independente da captura por disco | E6 |


## 10. Validação executada

Registro do §7, requisito por requisito. Tudo abaixo foi executado nesta tarefa, com
o código no estado atual.

| Requisito | Verificação | Resultado |
| --- | --- | --- |
| 1, 2 — estímulo e verificador sem importar o produto | Leitura dos três scripts: só `node:*` | Atendido |
| 3 — executor conduz tudo | `node --experimental-strip-types docs/watch-code/e2e/run-e2e.ts` | Atendido: abre, estimula, espera, fecha e verifica, sem toque manual |
| 4 — as doze invariantes em `ok` | mesma execução | Atendido: `veredito: PASSOU (7 eventos, 5 arquivos)`, exit 0 |
| 5 — a observação estava ligada | w0 no manifesto e I1 | Atendido: `8 escritas, 3 sessoes` |
| 6 — antes do `HEAD`, inclusive na segunda alteração | I3 sobre w1 e w2 | Atendido: `antes=git(1525e1c2)` nas duas |
| 7 — evento parcial | I3 sobre w3 | Atendido: `antes=none(nenhum)` |
| 8 — antes da sombra e cadeia | I3 sobre w5 | Atendido: `antes=shadow(0a3fc273)` = `depois` de w3 |
| 9 — remoção sem depois | I3 e I10 sobre w6 | Atendido: `antes=git(fedfe273) depois=nenhum` |
| 10 — ruído não vira evento | I1 sobre w7 | Atendido: `5 arquivos esperados, nenhum a mais` |
| 11 — arquivo novo gera um evento | I2 sobre w4 | Atendido: `7 eventos casados com as escritas, em ordem` |
| 12 — partição de sessões | I9 | Atendido: `3 sessoes, partição igual à declarada` |
| 13 — estado final do disco | I10 | Atendido |
| 14 — 93 testes do módulo | `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` | Atendido: `93 passing`, exit 0 (era 92; um teste novo) |
| 14 — `tsc` | `npx tsc --noEmit -p src/tsconfig.json` | Atendido: exit 0 |
| 14 — camadas | `npm run valid-layers-check` | Atendido: exit 0 |
| 14 — eslint nos arquivos tocados | `npx eslint` nos cinco arquivos | Atendido: exit 0 |
| 14 — higiene | `node --experimental-strip-types build/hygiene.ts` | Atendido: 3 arquivos, exit 0 |
| 15 — backlog atualizado | `overview.md` | Atendido nesta tarefa |
| 16 — nada fora do §4 | `git status` | Atendido: um arquivo de produto, um de teste e o arnês |

**Limitações da validação, declaradas:**

1. A execução é de uma máquina só, em Windows, com perfil isolado e pasta de teste.
   Não mede desempenho nem cobre repositório grande (E5-T3).
2. O log do app **não** registra qual biblioteca de watcher foi usada; o executor
   imprime isso como evidência e, quando não encontra, diz que não encontrou. O
   watcher nativo fica provado pelo efeito — 7 eventos capturados — e não pelo nome.
3. A captura não foi exercitada com a observação **desligada**: isso é da E1-T5, e
   o T-0004 segue pendente.
4. O defeito 3 do §4.1 continua aberto por decisão pendente: o log do app, em toda
   execução, registra três `failed to record src` que não são erro.
5. T-0003 e T-0004, da E1-T4 e da E1-T5, seguem `pendente` e são informados no
   relatório.
