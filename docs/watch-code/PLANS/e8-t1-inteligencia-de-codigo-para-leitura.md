# Plano — E8-T1 — Inteligência de código para leitura

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | PlanWriter (1 de 5) |
| Tarefa | E8-T1 — Inteligência de código para leitura |
| Slug | e8-t1-inteligencia-de-codigo-para-leitura |
| Entrada | Backlog do overview.md: "inteligência de código para leitura (F12 volta a funcionar)" |
| Saída | Este plano |

## 1. Objetivo

Devolver ao Watch Code a inteligência de código que serve para **ler** — F12 vai à definição, o hover mostra o tipo, "ver referências" lista os usos — mantendo desligadas, por padrão, todas as superfícies que **escrevem**: sem erro sublinhado, sem autocompletar, sem formatação, sem download automático de tipos.

Hoje o produto abre um arquivo .ts e não sabe nada sobre ele. Não é um bug de atalho: não existe servidor de linguagem no disco. O F12 continua registrado em `symbolNavigation.ts:162`, mas não há quem responda.

## 2. Escopo

### 2.1 Dentro

1. Restaurar a extensão `extensions/typescript-language-features` (removida pela E0 no commit `8f12a8e0fe9`).
2. Devolver a extensão às listas de build, hoje sem ela: instalação (`build/npm/dirs.ts`) e compilação (`build/gulpfile.extensions.ts`).
3. Instalar as dependências de runtime da extensão e compilar o `out/`.
4. Registrar os valores padrão do produto que desligam a escrita.
5. Validar na janela real com um teste manual novo (T-0007).

### 2.2 Fora

- **Outras linguagens.** JSON, CSS, HTML, YAML e afins continuam sem servidor. O produto é para ler código que um agente escreveu; TS/JS é o caso real hoje. Reavaliar quando doer.
- **Recursos de escrita do TypeScript.** Rename, refatorar, organizar imports, "corrigir tudo" e code actions não entram como funcionalidade — ao contrário: entram na lista de superfícies a esconder (ver decisão D4).
- **F8 e o painel Problems.** Continuam fora. Com a validação desligada por padrão não há erro para listar, e o painel já está escondido desde a E0 (`workbench.panel.markers` em `HIDDEN_VIEW_CONTAINER_IDS`).
- **Marketplace.** O `product.json` não tem `extensionsGallery`; instalar extensão pela interface não é caminho. A extensão volta como embutida, do disco.
- **Código novo no servidor de linguagem.** A extensão volta como está no upstream (menos a diferença de build descrita em T2). Nada de patch em código da Microsoft.

## 3. Contexto

### 3.1 O que a E0 tirou e o que ficou

| Item | Situação hoje | O que a E8-T1 faz |
| --- | --- | --- |
| Pasta da extensão | não existe | restaura de `8f12a8e0fe9^` (192 arquivos) |
| `build/npm/dirs.ts` | linha removida | devolve a linha |
| `build/gulpfile.extensions.ts` | 2 linhas removidas de `compilations` | devolve a(s) linha(s) |
| `build/lib/extensions.ts` | intacto (o E0 só tirou ipynb, mermaid, notebook-renderers e simple-browser) | nada |
| `build/filters.ts` | ainda cita a extensão | nada |
| `product.json` | `builtInExtensions` vazio | nada (é lista de download, não de embutida) |

### 3.2 Como a extensão é carregada e compilada

- Manifesto: `"main": "./out/extension"` e `"browser": "./dist/browser/extension"`. No desktop o que vale é o `out/`, **compilado por tsc**, não por esbuild.
- O `vscode:prepublish` da própria extensão chama `gulp --gulpfile ../../build/gulpfile.extensions.mjs compile-extension:typescript-language-features`. Esse nome de task **nasce da lista `compilations`** de `build/gulpfile.extensions.ts` (linhas 53 a 65). Sem a linha na lista, o nome da task não existe: é exatamente por isso que restaurar a pasta não basta.
- O `hooks` de build do repositório também é a lista `compilations`: é ela que alimenta `watch-extensions`.

### 3.3 O servidor de linguagem já está no disco

Não há nada a baixar para o TypeScript funcionar:

```text
typescript dir: True
tsserver: True
version: 6.0.3
```

Isto é `extensions/node_modules/typescript` — a resolução sobe do diretório da extensão e encontra lá. O único peso novo é o das dependências de runtime abaixo.

### 3.4 Dependências de runtime da extensão

| Pacote | Existe no repositório? |
| --- | --- |
| `@vscode/extension-telemetry` | não |
| `@vscode/sync-api-client` | não |
| `@vscode/sync-api-common` | não |
| `@vscode/sync-api-service` | não |
| `@vscode/ts-package-manager` | não |
| `jsonc-parser` | não |
| `vscode-tas-client` | não |
| `semver` | sim (raiz) |
| `vscode-uri` | sim (raiz) |

Sete de nove não existem em lugar nenhum: o `out/extension.js` não sobe sem instalar.

### 3.5 Onde os padrões do produto já vivem

Já existe o mecanismo, criado pela E0 e em uso:

- `src/vs/workbench/contrib/watchCode/common/hiddenViews.ts` — const `PRODUCT_SETTING_DEFAULTS` (hoje com `chat.disableAIFeatures` e `workbench.startupEditor`).
- `src/vs/workbench/contrib/watchCode/browser/hiddenViews.contribution.ts:28` — registra via `registerDefaultConfigurations`.

É o mesmo mecanismo que as extensões usam pelo ponto de contribuição `configurationDefaults` (`configurationExtensionPoint.ts`), e tem precedente dentro do workbench (`remoteExplorer.ts:333`).

### 3.6 O atalho não está quebrado

`src/vs/editor/contrib/gotoSymbol/browser/symbolNavigation.ts:162` declara `primary: KeyCode.F12`. O que falta é o provedor. Nada a fazer de keybinding nesta tarefa.

## 4. Dependências

- **Nenhuma tarefa pendente.** A E8-T1 não depende de E2-T3 nem de E2-T4.
- **É pré-requisito de:** E8-T2 (revisão dos atalhos nativos, porque o F12 passa a ter efeito real), E2-T4 (salto ao local) e do uso diário da IDE.
- **Ferramentas:** gulp do repositório (`npm run gulp ...`) e npm com rede para instalar as 7 dependências.

## 5. Etapas

### T1 — Restaurar a pasta da extensão

Trazer de volta só essa pasta, do commit imediatamente anterior à E0:

```text
git checkout 8f12a8e0fe9^ -- extensions/typescript-language-features
```

Conferir que `package.json`, `package-lock.json`, `tsconfig.json` e `src/` chegaram. Não restaurar nenhuma das outras 29 extensões.

### T2 — Devolver a extensão às listas de build

1. `build/npm/dirs.ts` — acrescentar `'extensions/typescript-language-features'` à lista `dirs`, para o `npm install` do repositório voltar a cobrir a pasta.
2. `build/gulpfile.extensions.ts` — acrescentar a entrada de `compilations` que gera a task de compilação. A decisão D2 define se entra só `extensions/typescript-language-features/tsconfig.json` ou também `.../web/tsconfig.json`.

### T3 — Instalar as dependências de runtime

Instalar na pasta da extensão, respeitando o `package-lock.json` restaurado. Sem isso o `out/extension.js` falha ao carregar.

### T4 — Compilar

Rodar a task gulp da extensão para produzir `out/`. Confirmar que `out/extension.js` existe **e** que o `out/` não fica desatualizado em relação a `src/` (a E0 não deixa rastro de build antigo, então é compilação limpa).

### T5 — Desligar a escrita nos padrões do produto

Acrescentar as chaves ao `PRODUCT_SETTING_DEFAULTS` de `hiddenViews.ts`:

| Chave | Valor | Por quê |
| --- | --- | --- |
| `typescript.validate.enable` | `false` | nenhum erro sublinhado — a IDE não acusa o agente |
| `javascript.validate.enable` | `false` | idem para .js |
| `typescript.suggest.enabled` | `false` | sem autocompletar; a IDE não escreve por você |
| `javascript.suggest.enabled` | `false` | idem para .js |
| `typescript.format.enable` | `false` | sem formatação |
| `javascript.format.enable` | `false` | idem para .js |
| `typescript.disableAutomaticTypeAcquisition` | `true` | sem download automático de tipos |
| `typescript.tsserver.log` | `'off'` | o log do servidor é superfície de diagnóstico de escrita |

Ficam como **default**: quem quiser ligar, liga nas configurações. O produto só declara o que não quer por padrão.

### T6 — Validar na janela real

Teste manual novo **T-0007 — Leitura de código pelo F12** em `docs/watch-code/testes-manuais.md`, seguindo o formato do CLAUDE.md e entrando no executor (`docs/watch-code/e2e/run-manual-tests.ts`) no mesmo padrão do T-0006, com evidência programática:

- abrir um arquivo .ts do workspace observado;
- F12 sobre um símbolo importado e conferir que o editor ativo passa a ser o arquivo de origem, no cursor certo;
- conferir que **não** há decoração de erro no arquivo (contagem zero de `.squiggly-error` e de entradas em `IMarkerService`);
- conferir que o hover não oferece ação de escrita;
- confirmar que a sessão do tsserver subiu sem erro no log da janela.

### T7 — Registrar

Relatório da tarefa, atualização do item E8-T1 no `overview.md` e push. Um `feat:` (código) e um `docs:`, na convenção do projeto.

## 6. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| As 7 dependências exigem rede e algumas centenas de MB em `node_modules` | T3 falha e nada funciona | O `package-lock.json` fixa as versões; se a rede faltar, o bloqueio é declarado, não contornado |
| `watch-extensions` passa a compilar a extensão a cada execução | Ciclo de desenvolvimento mais lento | O build por demanda (T4) resolve a validação; avaliar em D2 se vale compilar também o bundle web |
| A extensão traz superfícies que a E0 havia escondido: context menu do editor, task definitions, breakpoints | Reaparece superfície de escrita/depuração no menu de contexto | As superfícies de depuração e tarefas já foram removidas pela E0; o que sobrar entra em D4 |
| A extensão registra comandos de escrita no Command Palette (`typescript.sortImports`, organize imports) | Um comando que muda o texto do agente | D4 |
| `hygiene` e `eslint` passam a varrer 192 arquivos restaurados do upstream | O hook de pre-commit pode reprovar | Rodar `hygiene` e `eslint` no fim, e ajustar só o que a checagem do projeto exigir |
| O `out/` compilado precisa existir para o app abrir a extensão | Se esquecido, F12 segue inerte | T4 é etapa própria e T6 confere na janela |
| F12 em arquivo sem projeto TS abre aviso de "inicializando" | Ruído visual na primeira vez | Conferir em T6; se incomodar, vira ajuste da extensão, não do produto |

## 7. Decisões pendentes

### D1 — Qual conjunto de linguagens

- **A (recomendada).** Só TS/JS, com a `typescript-language-features`. Uma extensão, um servidor, `12 MB de pasta.
- B. Também JSON, CSS e HTML — três extensões, cada uma com cliente e servidor próprios, mais peso e mais superfície para esconder, para uma IDE cujo alvo é ler código de agente.

> **Aprovada: A** — só TS/JS nesta tarefa.

### D2 — Escopo do build

- **A (recomendada).** Recolocar na lista `compilations` só `extensions/typescript-language-features/tsconfig.json`. O produto é desktop; o bundle web (`dist/browser`, `web/tsconfig.json`) não é usado por ninguém e é o que arrasta as dependências `@vscode/sync-api-*`.
- B. Fidelidade ao upstream: as duas entradas, como estava antes da E0.

> Consequência da opção A: divergimos do upstream em uma linha, e a extensão passa a ser a única do fork com essa diferença. Precisa do seu aval.

> **Aprovada: A** — só a entrada de desktop em `compilations`; o bundle web não entra.

### D3 — Onde ficam os padrões do produto

- **A (recomendada).** No `PRODUCT_SETTING_DEFAULTS` existente (`hiddenViews/common/hiddenViews.ts`), que já é o lugar dos defaults do produto desde a E0.
- B. `contributes.configurationDefaults` no `package.json` da extensão — funciona, mas mete regra do nosso produto dentro de arquivo do upstream, que é justamente o arquivo que restauramos do zero.

> **Aprovada: A** — os defaults entram no `PRODUCT_SETTING_DEFAULTS` que já existe.

### D4 — O que fazer com as superfícies de escrita que o TypeScript traz por tabela

Desligar a validação, o autocompletar e a formatação não apaga tudo: a extensão continua contribuindo comandos que escrevem, e o editor continua oferecendo code actions, rename e refatoração quando o provedor existe.

- **A (recomendada).** Fechar o cerco com o mesmo critério da E2-T3 — fica o que lê, sai o que escreve: esconder do Command Palette os comandos de escrita do TS (`typescript.sortImports`, `typescript.organizeImports`, `typescript.selectTypeScriptVersion`) e desligar a lâmpada de ação rápida (`editor.lightbulb.enabled`) por padrão.
- B. Deixar como está. A validação desligada já tira o ruído principal, e os comandos de escrita ficam disponíveis para quem os procurar.
- C. Fechar ainda mais: esconder também rename e refatorar do editor.

> Esta decisão mexe em **quais comandos existem**, então não é minha para tomar.

> **Aprovada: A** — esconder os comandos de escrita do TS e desligar a lâmpada; rename e refatorar do editor continuam como o B descreve, ou seja, a poda extra da opção C não entra.

### D5 — Instalar as 9 dependências ou podar

- **A (recomendada).** Instalar as 9 e deixar o código do upstream intacto.
- B. Podar `@vscode/sync-api-*` (só servem ao web) e `@vscode/ts-package-manager` (só serve ao ATA, que vamos desligar) — mais leve, mas exige editar o `package.json` e possivelmente o código do upstream, e cria dívida a cada atualização.

> **Aprovada: A** — instalar as 9 e manter o código do upstream intacto.

### D6 — Confirmar o efeito de `typescript.suggest.enabled: false`

Desliga o autocompletar; hover, F12 e referências continuam vindo do mesmo servidor e não passam por essa chave. Confirmo isso na janela em T6 e registro no teste — se algum recurso de leitura morrer junto, eu volto com a evidência antes de ajustar.

> **Aprovada: A** — verificar na janela pelo T-0007.

## 8. Critérios de aceite

1. A pasta `extensions/typescript-language-features` existe, restaurada de `8f12a8e0fe9^`.
2. `build/npm/dirs.ts` volta a listar a extensão.
3. A lista `compilations` de `build/gulpfile.extensions.ts` volta a gerar a task de compilação da extensão, conforme D2.
4. As dependências de runtime da extensão resolvem a partir da pasta dela.
5. `out/extension.js` existe e é mais novo que `src/`.
6. `PRODUCT_SETTING_DEFAULTS` contém as chaves da tabela de T5.
7. Na janela real, F12 sobre um símbolo leva ao arquivo de origem no cursor certo — conferido programaticamente.
8. Na janela real, o arquivo aberto tem **zero** decorações de erro e **zero** marcadores em `IMarkerService`.
9. O hover sobre um símbolo mostra a assinatura.
10. Nenhuma superfície nova de escrita aparece (conforme D4).
11. `npm run typecheck-client` verde.
12. `eslint` verde nos arquivos tocados.
13. `hygiene` verde.
14. T-0007 registrado em `testes-manuais.md` com resultado obtido e situação preenchidos de fato.
15. Se a instalação das dependências ou a compilação falhar, o teste fica `reprovado` e o plano não é declarado cumprido.

## 9. Rastreabilidade

| Requisito | Origem | Etapa que atende |
| --- | --- | --- |
| F12 volta a funcionar | overview.md, E8-T1 | T1, T2, T3, T4, T6 |
| A IDE não acusa erro | proposta do produto (não altera texto, não depura) | T5, T6 |
| A IDE não escreve por você | proposta do produto | T5, D4 |
| Nada de download automático | proposta do produto | T5 |
| Evidência na janela | CLAUDE.md, seção de testes manuais | T6, T7 |

## 10. Decisões aprovadas durante a execução

Três decisões novas apareceram quando o T-0007 reprovou. Nenhuma delas cabia no plano, porque dependiam de descobrir como o servidor de linguagem se comporta com a validação desligada. Todas foram submetidas e aprovadas antes de virarem código.

| # | Decisão | Por que apareceu | Custo aceito |
| --- | --- | --- | --- |
| D7 | `typescript.tsserver.useSyntaxServer: 'never'` nos padrões do produto | Com a validação desligada o cliente nunca recebe evento de diagnóstico, nunca sai do estado "carregando projeto" e manda F12 e hover para o servidor sintático, que não responde | Um servidor em vez de dois; perde a aceleração do servidor sintático enquanto o projeto carrega |
| D8 | Remover as cinco entradas de escrita de `contributes.menus.commandPalette` no `package.json` da extensão | A supressão pelo menu só alcança item implícito, e a extensão declara essas entradas explicitamente | O fork passa a divergir do upstream em um arquivo vendorizado, em cinco linhas documentadas |
| D9 | `editor.wordBasedSuggestions: 'off'` nos padrões do produto | Sobrava sugestão ao digitar, e ela não vinha do TypeScript: o log do servidor não tinha nenhum `completionInfo` | Fecha de vez a sugestão; é o provedor de palavras do documento que sai |

Além delas, o `hygiene` exigiu uma limpeza fora do escopo previsto: `eslint.config.js` ainda referenciava três extensões apagadas pela E0, e o bloco nunca tinha sido exercitado porque nenhum arquivo casava com ele.
