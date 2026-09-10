# PLAN — Enxugamento do fork

| Campo | Valor |
| --- | --- |
| Tarefa | Enxugamento do fork (E0) |
| Workflow | High |
| Etapa | PlanWriter |
| Entrada | Aprovação do usuário para remover o inútil de baixo acoplamento e esconder o de alto acoplamento |
| Saída | Este plano |
| Próxima etapa | SpecWriter |

## Objetivo

Reduzir o fork Watch Code ao que o produto realmente usa — apagando o inútil de baixo acoplamento e ocultando o inútil de alto acoplamento — e finalizar com o programa **compilado e rodando**.

## Escopo

### Incluído

1. **Destravar a toolchain.** Sem `node_modules` não existe compile. Instalar o componente *Spectre-mitigated libs* nos Visual Studio presentes na máquina e concluir o `npm install`.
2. **Lote 1a — Extensões.** Remover as extensões embarcadas inúteis ao produto (~334 MB de 344 MB).
3. **Lote 1b — Módulos de core do Tier 1.** Remover ~19 contribs cuja única referência externa é a própria linha de registro (~3,3 MB).
4. **Lote 1c — Ferramenta de build não usada.** Remover o que só serve a macOS, Linux, CI e remote.
5. **Lote 2 — Ocultação declarativa.** Uma contribuição que desregistra containers e views nativos inúteis, mais `chat.disableAIFeatures`.
6. **Compilar e rodar**, validando ao final de cada lote.
7. **Registrar a tarefa e o resultado no guia** (`docs/watch-code/Workflow/overview.md` e `tasks.md`).

### Fora

- **Apagar `chat` e `src/vs/sessions`.** É o Lote 3, projeto de refatoração próprio, adiado por decisão do usuário. Eles são **ocultados**, não removidos.
- Qualquer alteração em `.gitignore`.
- Qualquer alteração no contrato `changeLedger` (E1-T1), que permanece como está.
- Alterar a estrutura de `docs/watch-code/` e `CLAUDE.md`.
- Corrigir ou melhorar o produto Watch Code em si.

## Contexto

**Repositório:** fork do `code-oss-dev` 1.138.0 em `D:\Youtube\Dev\vscode`, Windows, Node v24.14.0.

**Produto:** IDE que **observa** o que agentes externos alteram no workspace e devolve ao agente, por um arquivo `.md`, o que o desenvolvedor propôs. Ela **não roda agente** e **não escreve código**. Isso define o critério de utilidade: tudo que existe para o desenvolvedor *escrever*, *depurar* ou *conversar com um agente* é inútil.

**Exceção que define o critério:** o **terminal integrado permanece**. Ele é onde o desenvolvedor roda o agente externo (ex.: `claude`) e, em seguida, liga a observação (guia §3.5). O terminal é superfície do produto, não interface removível — assim como tudo que existe para *executar* o agente continua valendo quando é o próprio agente que se executa ali.

**Fontes de evidência levantadas nesta tarefa:**

| Fonte | O que revelou |
| --- | --- |
| Perfil de `extensions/*/package.json` | Quais extensões têm `main` (código) e quais só contribuem `grammars`/`languages` (cor) |
| Contagem de referências cruzadas em `src/` e `build/` | Acoplamento de cada contrib, excluído o fixture `extHostDocumentData.test.perf-data.ts` |
| `build/npm/dirs.ts` | Lista fixa de 54 diretórios onde o `npm install` roda |
| `build/gulpfile.extensions.ts:53-98` | Lista fixa de tsconfigs compilados |
| `src/vs/workbench/common/views.ts:180,420` | `deregisterViewContainer` e `deregisterViews`, públicos |
| `src/vs/sessions/contrib/chatDebug/browser/chatDebug.contribution.ts:66-69` | Precedente de desregistro de view nativa em runtime |
| `chat.shared.contribution.ts:2347` | `chat.disableAIFeatures` |
| `package.json` e `remote/package.json` | `@vscode/native-watchdog` vem da **raiz**, não do copilot |

**Limite conhecido do método de medição:** os imports do VS Code são relativos, então a contagem captura o acoplamento de fora de `contrib/` mas **não** os imports entre contribs irmãos. Os números são um **piso**, não o total. Por isso o Lote 1b se restringe aos módulos cuja única referência é a linha de registro — esses são seguros por construção.

## Dependências

- **Componente Spectre do MSVC** — bloqueia `npm install`, e portanto `compile`, `typecheck` e os testes. É a primeira etapa e não tem substituto rápido.
- **`build/npm/dirs.ts`** — precisa perder as entradas das extensões removidas, senão o `npm install` falha.
- **`build/gulpfile.extensions.ts`** — precisa perder os tsconfigs das extensões removidas, senão o `compile-extensions` falha.
- **`package.json`** — hoje `compile = compile-client + compile-copilot`; sem copilot o script muda.
- **`product.json`** — `builtInExtensions` e `builtInExtensionsEnabledWithAutoUpdates` citam copilot e js-debug.
- **`build/darwin/create-universal-app.ts`, `build/filters.ts`, `.vscode/launch.json`** — citam extensões removidas; a limpeza é higiene, não requisito de funcionamento.
- **`IViewContainersRegistry` / `IViewsRegistry`** — base do Lote 2.

## Etapas

1. **Destravar a toolchain.** Instalar o componente Spectre nas instâncias do Visual Studio; concluir `npm install`; confirmar `out/` gerado.
2. **Lote 1a — Extensões.** Apagar as pastas aprovadas; limpar `build/npm/dirs.ts`, `build/gulpfile.extensions.ts`, `package.json`, `product.json` e `build/darwin/create-universal-app.ts`; validar.
3. **Lote 1b — Módulos de core do Tier 1.** Remover os contribs e suas linhas de registro em `workbench.common.main.ts` e variantes; validar.
4. **Lote 1c — Ferramenta de build.** Remover o que só serve a macOS, Linux, CI e remote; validar.
5. **Lote 2 — Ocultação declarativa.** Criar a contribuição que desregistra containers e views inúteis; aplicar `chat.disableAIFeatures`; validar.
6. **Compilar e rodar.** `compile-client`, `typecheck-client`, `valid-layers-check`, testes e lançamento da aplicação.
7. **Relatar e atualizar o guia.**

Cada lote é validado **antes** do próximo começar.

## Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Remover extensão ainda referenciada por lista fixa de build | `npm install` ou `compile-extensions` falham | Limpar as quatro listas fixas no mesmo passo; validar por lote |
| Acoplamento entre contribs irmãos não visível na medição | Erro de compilação no Lote 1b | Só remover módulos cuja única referência é a linha de registro; `typecheck` após cada remoção |
| Spectre exige elevação e pode falhar em silêncio | Nenhum progresso possível | Rodar com `RunAs` e **verificar a pasta `lib\spectre\x64`** em vez de confiar no exit code |
| `build/darwin` ser necessário para algo no Windows | Build quebra | Validar com `compile` antes de prosseguir; reverter é `git checkout` |
| Perda de cor em alguma linguagem | Requisito "reconhecer todas as linguagens" violado | **Nenhuma extensão de gramática é removida** — só as que têm `main` e não contribuem `grammars` |
| Ocultar view usada por outra parte do workbench | Tela quebrada em runtime | Ocultar só containers comprovadamente inúteis; validar abrindo a aplicação |

**Impacto positivo relevante:** `build/npm/dirs.ts` cai de 54 para ~15 diretórios, encurtando muito o `npm install`.

## Decisões pendentes

Nenhuma bloqueante. As decisões de negócio já foram aprovadas pelo usuário:

- **D1** — Gramáticas de linguagem **não** são removidas; o requisito é reconhecer todas as linguagens.
- **D2** — `git` e `git-base` ficam; `github` sai.
- **D3** — `ipynb` e `notebook-renderers` saem.
- **D4** — `markdown-language-features` fica, pelo preview do `.md`.
- **D5** — Módulo de alto acoplamento e inútil é **ocultado**, nunca apagado.
- **D6** — `timeline`, `localHistory` e `accessibilitySignals` ficam: são úteis ou são acessibilidade.
- **D7** — ESLint do repositório fica: é ferramenta de desenvolvimento, não vai para o produto.

## Critérios de aceite

1. `npm install` conclui com exit 0.
2. `extensions/` ocupa ~10 MB, contra 344 MB antes.
3. `build/npm/dirs.ts` lista ~15 diretórios, contra 54.
4. Toda extensão de gramática permanece: nenhuma linguagem perdeu coloração.
5. `npm run compile-client` conclui sem erro.
6. `npm run typecheck-client` conclui sem erro.
7. `npm run valid-layers-check` conclui sem erro.
8. `npm run test-node -- --run out/vs/platform/changeLedger/test/common/changeEventParsing.test.js` passa com 15/15.
9. A aplicação **abre e roda**, sem as views inúteis na interface.
10. As views úteis (Explorer, Busca, SCM, Timeline, Saída, Terminal) continuam funcionando.
11. O controle de versão mostra a remoção como alterações reversíveis, sem arquivo fora do escopo tocado.
