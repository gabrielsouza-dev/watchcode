# SPEC — Enxugamento do fork

| Campo | Valor |
| --- | --- |
| Referência | [`docs/watch-code/PLANS/enxugamento-do-fork.md`](../PLANS/enxugamento-do-fork.md) |
| Tarefa | Enxugamento do fork (E0) |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Entrada | O plano da tarefa |
| Saída | Esta especificação |
| Próxima etapa | Developer |

## 1. Comportamento esperado

Ao final, o fork apresenta três mudanças observáveis:

1. **Extensões embarcadas** ficam restritas às que servem ao produto: gramáticas (coloração de todas as linguagens), temas, `git`, `git-base` e `markdown-language-features`. `extensions/` cai de 344 MB para ~10 MB.
2. **A interface não exibe** as views nativas ligadas a escrever código, depurar, executar, testar, sincronizar conta e conversar com agente. Os módulos correspondentes **continuam no código-fonte** — apenas deixam de ser registrados na interface.
3. **O programa compila e roda** a partir do código-fonte.

O comportamento do produto Watch Code (observar alterações, canal `.md`) **não muda**.

## 2. Contratos

### 2.1 Listas declarativas de ocultação

Arquivo novo `src/vs/workbench/contrib/watchCode/common/hiddenViews.ts`:

```ts
/**
 * Ids dos view containers nativos que nao fazem parte do produto Watch Code.
 * Os modulos continuam registrados no codigo; apenas deixam de aparecer na interface.
 */
export const HIDDEN_VIEW_CONTAINER_IDS: readonly string[];

/**
 * Valores padrao de configuracao aplicados pelo produto.
 * Ficam como default, portanto o usuario ainda pode sobrescrever.
 */
export const PRODUCT_SETTING_DEFAULTS: Readonly<Record<string, unknown>>;
```

**Regras do contrato:**

| Regra | Descrição |
| --- | --- |
| Id desconhecido é inofensivo | Um id que não resolve é ignorado em silêncio. Nenhum erro, nenhum `throw`. Um id a mais não pode impedir a inicialização. |
| Idempotente | Aplicar a ocultação duas vezes tem o mesmo efeito de aplicar uma. |
| Declarativo | Não há lógica condicional sobre ids. É uma lista, lida em ordem. |
| Sem dependência de ordem | Se o container ainda não estiver registrado, aguarda. Se já estiver, remove imediatamente. |

### 2.2 Contribuição de ocultação

Arquivo novo `src/vs/workbench/contrib/watchCode/browser/hiddenViews.contribution.ts`:

```ts
class HiddenViewsContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.watchCode.hiddenViews';
    constructor(
        @IViewContainersRegistry viewContainersRegistry: IViewContainersRegistry,  // via Registry.as
        @IViewsRegistry viewsRegistry: IViewsRegistry,                             // via Registry.as
        @IConfigurationRegistry configurationRegistry: IConfigurationRegistry,
    );
}
```

Registro, seguindo o precedente de `chatDebug.contribution.ts:95`:

```ts
registerWorkbenchContribution2(
    HiddenViewsContribution.ID,
    HiddenViewsContribution,
    WorkbenchPhase.BlockRestore,
);
```

**Algoritmo:**

1. Registrar `PRODUCT_SETTING_DEFAULTS` via `IConfigurationRegistry.registerDefaultConfigurations([{ overrides: PRODUCT_SETTING_DEFAULTS }])`.
2. Para cada id em `HIDDEN_VIEW_CONTAINER_IDS`: se `viewContainersRegistry.get(id)` resolve, desregistrar com `viewContainersRegistry.deregisterViewContainer(container)`.
3. Aos ids que **não** resolveram, associar um listener em `viewContainersRegistry.onDidRegister`; ao aparecerem, desregistrar e descartar o listener daquele id.
4. Descartar todos os listeners no `dispose()` da contribuição.

**Justificativa do passo 3:** `workbench.common.main.ts` é importado antes de `workbench.desktop.main.ts` e `workbench.web.main.ts`, e contribuições registram views em fases variadas. Sem o listener, containers registrados depois da nossa contribuição escapariam. É exatamente o problema que `chatDebug.contribution.ts:39-52` resolve.

### 2.3 Ids ocultados

Lista inicial, a **confirmar por varredura** antes de finalizar (ver §5):

A varredura por `registerViewContainer` **corrigiu três ids** que eu havia tomado por container e que na verdade eram ids de *view* — desregistrar um id de view não tem efeito nenhum:

| Eu tinha escrito | É na verdade | Container correto |
| --- | --- | --- |
| `workbench.view.testing` | `ExplorerViewId` (view) | `workbench.view.extension.test` (`Testing.ViewletId`) |
| `workbench.view.voiceEventStream` | `VoiceEventStreamViewPane.ID` (view) | `workbench.view.voiceEventStreamContainer` |
| `workbench.view.voiceTranscripts` | `VoiceTranscriptsViewPane.ID` (view) | `workbench.view.voiceTranscriptsContainer` |

Também saíram `workbench.view.editSessions` e `workbench.view.sessions`: o primeiro deixou de existir com a remoção do `editSessions` no Lote 1b, e o segundo era prefixo de `agentic.workbench.view.sessionsContainer`.

Lista final, cada id confirmado na origem:

| Id | Constante de origem | O que remove da interface |
| --- | --- | --- |
| `workbench.panel.chat` | `ChatViewContainerId` (`chat.ts:587`) | Chat |
| `workbench.view.extension.copilot-chat` | `chatDebug.contribution.ts:17` | Chat da extensão copilot (inerte após o Lote 1a) |
| `workbench.view.voiceEventStreamContainer` | `voiceEventStream.contribution.ts:25` | Voz |
| `workbench.view.voiceTranscriptsContainer` | `voiceTranscripts.contribution.ts:29` | Voz |
| `agentic.workbench.view.sessionsContainer` | `sessions.contribution.ts:31` | Sessões |
| `workbench.view.debug` | `debug/common/debug.ts:34` | Executar e Depurar |
| `workbench.panel.repl` | `DEBUG_PANEL_ID` (`debug.ts:42`) | REPL |
| `workbench.view.extension.test` | `Testing.ViewletId` | Testes |
| `workbench.panel.testResults` | `Testing.ResultsPanelId` | Resultados de teste |
| `workbench.view.extensions` | `extensions/common/extensions.ts:27` | Vitrine de extensões |
| `workbench.view.remote` | `remoteExplorer.ts:41` | Remote Explorer |
| `workbench.view.sync` | `SYNC_VIEW_CONTAINER_ID` | Sincronizar Configurações |
| `~remote.forwardedPortsContainer` | `TUNNEL_VIEW_CONTAINER_ID` | Portas |
| `workbench.panel.markers` | `MARKERS_CONTAINER_ID` | Problemas |
| `workbench.panel.comments` | `COMMENTS_VIEW_ID`, usado como container em `mainThreadComments.ts` | Comentários |

**Preservados, com id confirmado:** `workbench.view.explorer` (`files/common/files.ts:29`), `workbench.view.scm` (`scm/common/scm.ts:21`), `workbench.panel.output` (`output/common/output.ts:38`) e `terminal` (`TERMINAL_VIEW_ID`).

Configuração padrão:

```ts
export const PRODUCT_SETTING_DEFAULTS = {
    'chat.disableAIFeatures': true,
} as const;
```

Cobre as superfícies do chat que **não** são view container: sugestão inline, chat no editor e afins.

## 3. Alterações necessárias

### 3.1 Lote 1a — extensões

**Apagar as pastas** em `extensions/`:

```
copilot  vscode-api-tests  vscode-colorize-tests  vscode-colorize-perf-tests
vscode-test-resolver  typescript-language-features  references-view
html-language-features  emmet  github  github-authentication  php-language-features
microsoft-authentication  mermaid-markdown-features  grunt  gulp  jake  npm
ipynb  notebook-renderers  json-language-features  css-language-features
configuration-editing  media-preview  merge-conflict  extension-editing
debug-auto-launch  debug-server-ready  simple-browser  tunnel-forwarding
```

**Não apagar nenhuma extensão que contribua `grammars`** — é o requisito de coloração. Ficam `git`, `git-base`, `markdown-language-features` e `terminal-suggest`.

O gate de varredura (§5) **reprovou dois candidatos** na primeira passada, e eles foram retirados da lista: `search-result` e `markdown-math` contribuem `grammars` e por isso permanecem. A lista final tem 30 extensões.

`terminal-suggest` fica porque o **terminal é superfície principal do produto** (guia §3.5): é ali que o desenvolvedor roda o agente externo. Nada ligado ao terminal entra em lista de remoção ou de ocultação.

**Limpar as listas fixas:**

| Arquivo | O que sai |
| --- | --- |
| `build/npm/dirs.ts` | Entradas das extensões apagadas, incluindo `extensions/*-language-features/server` |
| `build/gulpfile.extensions.ts:53-98` | Os `tsconfig.json` das extensões apagadas |
| `package.json` | `compile-copilot`, `watch-copilot`, `watch-copilotd`, `kill-watch-copilotd`, `copilot:setup`, `copilot:get_token`; e remover `compile-copilot`/`watch-copilot` das cadeias `compile`, `watch` e `watch-transpile` (linhas 25, 33, 34) |
| `product.json` | As 3 entradas de `ms-vscode.js-debug*` em `builtInExtensions`; `GitHub.copilot-chat` em `builtInExtensionsEnabledWithAutoUpdates` |
| `build/darwin/create-universal-app.ts` | O bloco de `@github/copilot` (linhas 52-105) |
| `build/filters.ts` | Padrões `!extensions/<apagada>/**` |

### 3.2 Lote 1b — módulos de core do Tier 1

**Apagar as pastas** em `src/vs/workbench/contrib/`:

```
welcomeGettingStarted  welcomeOnboarding  welcomeWalkthrough  welcomeAgentSessions
welcomeViews  welcomeBanner  issue  editSessions  userDataSync  processExplorer
policyExport  splash  keybindingsExport  meteredConnection  limitIndicator  emergencyAlert
```

**Resultado do gate (executado antes da remoção):** 16 aprovados, **4 reprovados** e deslocados para o Lote 2, por terem referência de código real fora da linha de registro:

| Módulo | Referência que reprovou |
| --- | --- |
| `imageCarousel` | `sessions/contrib/chat/browser/sessionArtifacts.ts` |
| `surveys` | `workbench/contrib/chat/common/feedbackSurvey/chatModelFeedbackSurveyConfig.ts` |
| `remoteTunnel` | `sessions/contrib/tunnelHost/test/electron-browser/tunnelHost.contribution.test.ts` |
| `share` | `workbench/api/browser/mainThreadShare.ts` |

Os 16 removidos liberaram 3,01 MB e a varredura posterior confirmou **zero referências órfãs**.

**Correção após a primeira compilação.** O gate tem um ponto cego que eu já havia registrado no §4 do plano: os imports do VS Code são relativos, então a varredura por `contrib/<id>/` **não enxerga imports entre contribs irmãos**. O compilador enxergou, e reprovou dois módulos:

| Módulo | Import que o gate não viu |
| --- | --- |
| `issue` | `extensions/browser/extensionsActions.ts:76` → `'../../issue/common/issue.js'` |
| `issue` | `extensions/common/reportExtensionIssueAction.ts:9` → `'../../issue/common/issue.js'` |
| `welcomeGettingStarted` | `remote/browser/remote.ts:54` → `'../../welcomeGettingStarted/browser/gettingStartedService.js'` |

Os dois foram **restaurados** por `git checkout` e passaram para o Lote 2, seguindo a regra aprovada: acoplamento real → esconder, não apagar. O `welcomeGettingStarted` não registra view container, então é ocultado pelo padrão `workbench.startupEditor: 'none'`.

A compilação seguinte reprovou mais dois — o cluster `welcome*` é internamente acoplado:

| Módulo | Import que o gate não viu |
| --- | --- |
| `welcomeAgentSessions` | `welcomeGettingStarted/browser/gettingStarted.contribution.ts:35` |
| `welcomeOnboarding` | `welcomeGettingStarted/browser/startupPage.ts:35,36` |

Também restaurados.

**Ferramenta corretiva.** Para parar de descobrir isso uma compilação de 2 minutos por vez, foi escrita uma varredura que **resolve cada import relativo** do `src/vs` contra o caminho do arquivo e verifica se o alvo cai numa pasta apagada. Foi ela que provou o estado final: com **12 módulos removidos, zero imports quebrados**.

**Lote 1b final: 12 módulos removidos, 4 restaurados e ocultados** (`issue`, `welcomeGettingStarted`, `welcomeAgentSessions`, `welcomeOnboarding`).

**Remover as linhas de import** destes módulos em:

- `src/vs/workbench/workbench.common.main.ts`
- `src/vs/workbench/workbench.desktop.main.ts`
- `src/vs/workbench/workbench.web.main.ts`
- `src/vs/sessions/sessions.common.main.ts`
- `src/vs/sessions/sessions.desktop.main.ts`
- `src/vs/sessions/sessions.web.main.ts`

Linhas já localizadas (exemplo de `workbench.common.main.ts`): 242, 302, 377, 389, 390, 393-397, 400, 425, 431, 465, 468.

**Gate obrigatório:** antes de apagar qualquer pasta, rodar uma varredura confirmando que a **única** referência externa é a linha de registro. Se aparecer referência de código, o módulo **não** é apagado neste lote — vai para o Lote 2 (ocultação).

### 3.3 Lote 1c — ferramenta de build

Candidatos, cada um sujeito ao mesmo gate de varredura:

`build/darwin`, `build/linux`, `build/azure-pipelines`, `.vscode/extensions`.

**Explicitamente fora deste lote:** `build/next` (usado por `watch-client-transpile`), `src/vs/server`, `build/agent-sdk`, `build/codex`, `build/dictation-runtime` e `remote/` — têm referência em script de build ativo e o ganho não paga o risco.

### 3.4 Lote 2 — contribuição de ocultação

| Arquivo | Ação |
| --- | --- |
| `src/vs/workbench/contrib/watchCode/common/hiddenViews.ts` | Criar |
| `src/vs/workbench/contrib/watchCode/browser/hiddenViews.contribution.ts` | Criar |
| `src/vs/workbench/contrib/watchCode/test/common/hiddenViews.test.ts` | Criar |
| `src/vs/workbench/workbench.common.main.ts` | Adicionar o import da contribuição |

## 4. Casos de borda e tratamento de erro

| Caso | Comportamento |
| --- | --- |
| Id de container na lista mas inexistente | Ignorado em silêncio. Nenhum log de erro, nenhum throw. |
| Container registrado depois da contribuição | Listener em `onDidRegister` remove assim que aparece, e se descarta. |
| Mesmo id aplicado duas vezes | Segunda passada encontra `get(id)` vazio e não faz nada. |
| Contribuição descartada durante inicialização | Listeners pendentes são descartados no `dispose()`. |
| Extensão de gramática removida por engano | **Prevenção, não tratamento:** o gate do §3.2 confere `contributes.grammars` antes de qualquer remoção. |
| Pasta removida ainda citada em lista fixa de build | `npm install` ou `compile-extensions` falham. **Prevenção:** as listas do §3.1 são limpas no mesmo passo, e o lote só fecha com `compile` verde. |
| `--installPath` do instalador do VS cortado no espaço | Instalador retorna exit 1 sem mensagem. **Prevenção:** passar o caminho entre aspas explícitas; confirmar a existência de `VC\\Tools\\MSVC\\<versão>\\lib\\spectre\\x64` em vez de confiar no exit code. |

## 5. Plano de testes

| Nível | O que valida | Como |
| --- | --- | --- |
| Varredura (pré-remoção) | Toda pasta a apagar tem a linha de registro como única referência externa | Script de contagem de referências em `src/` e `build/`, excluído o fixture `extHostDocumentData.test.perf-data.ts` |
| Varredura (gramáticas) | Nenhuma extensão com `contributes.grammars` está na lista de remoção | Leitura de `package.json` de cada extensão |
| Unidade | Listas sem id duplicado, sem id vazio, e `chat.disableAIFeatures` presente nos defaults | `hiddenViews.test.ts`, rodado por `npm run test-node` |
| Unidade (regressão) | O contrato do `changeLedger` segue intacto | `out/vs/platform/changeLedger/test/common/changeEventParsing.test.js`, 15/15 |
| Compilação | Nenhuma referência órfã após cada lote | `npm run compile-client` e `npm run typecheck-client` |
| Camadas | A nova contribuição respeita as fronteiras de camada | `npm run valid-layers-check` |
| Estilo | Padrão do repositório | `npm run eslint` |
| Manual | A aplicação abre; views inúteis ausentes; Explorer, Busca, SCM, Timeline, Saída e Terminal funcionando; coloração preservada em TS, JSON, CSS, HTML, Python e Shell | Lançar a aplicação a partir do código-fonte |

**Ordem:** o Tester valida ao fim de **cada** lote, não só no fim.

## 6. Critérios de aceite verificáveis

1. A pasta `VC\\Tools\\MSVC\\<versão>\\lib\\spectre\\x64` existe em pelo menos uma instância do Visual Studio.
2. `npm install` termina com exit 0 e `node_modules` existe.
3. `extensions/` ocupa ~10 MB.
4. `build/npm/dirs.ts` lista ~15 entradas.
5. Nenhuma extensão removida contribuía `grammars`.
6. `npm run compile-client` termina com exit 0.
7. `npm run typecheck-client` termina com exit 0.
8. `npm run valid-layers-check` termina com exit 0.
9. `npm run test-node -- --run out/vs/platform/changeLedger/test/common/changeEventParsing.test.js` reporta 15 passando, 0 falhando.
10. `npm run test-node -- --run out/vs/workbench/contrib/watchCode/test/common/hiddenViews.test.js` passa.
11. A aplicação **abre e roda** a partir do código-fonte.
12. As views do §2.3 não aparecem; Explorer, Busca, SCM, Timeline, Saída e Terminal aparecem e funcionam.
13. A coloração de sintaxe funciona em TypeScript, JSON, CSS, HTML, Python e Shell.
14. `git status` mostra apenas arquivos dentro do escopo desta tarefa.

## 7. Decisões pendentes

**Nenhuma bloqueante.** As decisões de negócio foram aprovadas pelo usuário antes desta especificação (D1 a D7 do plano).

Duas observações registradas, sem necessidade de nova aprovação:

- **`product.json:defaultChatAgent`** permanece intocado. Removê-lo alteraria o contrato de configuração do chat, o que excede o escopo de um enxugamento. A ocultação já cobre o efeito visual.
- **`remote/`** fica fora do Lote 1c, embora também declare `@vscode/native-watchdog`. A origem principal é o `package.json` da raiz, então removê-lo não destrava o `npm install` e não compensa o risco.

## 8. Registro de revisões

| Revisão | Mudança |
| --- | --- |
| 1 | Especificação inicial, derivada do plano aprovado. |
| 2 | Terminal integrado confirmado como superfície do produto (guia §3.5): `terminal-suggest` sai da lista de remoção, e nada ligado ao terminal entra em remoção ou ocultação. |
