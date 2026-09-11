# Especificação — E8-T1 — Inteligência de código para leitura

| Campo | Valor |
| --- | --- |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Tarefa | E8-T1 |
| Slug | e8-t1-inteligencia-de-codigo-para-leitura |
| Entrada | docs/watch-code/PLANS/e8-t1-inteligencia-de-codigo-para-leitura.md |
| Saída | Este documento |
| Próxima etapa | Developer |

## 1. Referência

Plano: `docs/watch-code/PLANS/e8-t1-inteligencia-de-codigo-para-leitura.md` — 7 etapas técnicas (T1 a T7), 6 decisões.

Decisões aprovadas pelo usuário (opção A em todas):

| Decisão | Aprovado |
| --- | --- |
| D1 | Só TS/JS nesta tarefa |
| D2 | Só a entrada de desktop na lista `compilations`; o bundle web não entra |
| D3 | Defaults do produto no `PRODUCT_SETTING_DEFAULTS` que já existe |
| D4 | Esconder os comandos de escrita do TS da paleta e desligar a lâmpada; rename e refatorar do editor **não** entram |
| D5 | Instalar as 9 dependências; código do upstream intacto |
| D6 | Confirmar na janela o efeito de `typescript.suggest.enabled: false` |

## 2. Comportamento esperado

### 2.1 O que passa a funcionar

Com um arquivo `.ts` aberto, o servidor de linguagem do TypeScript sobe e passa a responder ao que **lê**:

- **F12** sobre um símbolo abre o arquivo onde ele é definido, com o cursor no símbolo.
- **Hover** sobre um símbolo mostra assinatura e tipo.
- **Ver referências** (`Shift+F12`) e espiar definição (`Alt+F12`) funcionam pelo mesmo servidor.
- Ir para o símbolo (`Ctrl+Shift+O`) e ir para a linha (`Ctrl+G`) continuam funcionando como já funcionavam.

### 2.2 O que continua desligado

- Nenhum erro sublinhado, nenhum aviso, nenhuma entrada no painel de problemas.
- Nenhuma sugestão ao digitar.
- Nenhuma formatação por provedor de linguagem.
- Nenhum download automático de tipos.
- Nenhum comando de escrita da extensão do TypeScript na paleta (`Sort Imports`).
- Nenhuma lâmpada de ação rápida no editor.

### 2.3 O que não muda

- JSON, CSS, HTML, YAML e demais linguagens seguem sem inteligência.
- `F5` e `Shift+F5` continuam sendo a linha do tempo (E2-T3).
- `F1` (paleta) continua disponível.
- O painel de problemas continua escondido (E0).

### 2.4 Como o comportamento é obtido

Três mecanismos independentes, cada um no seu lugar:

1. **A extensão volta a existir e a ser compilada** — sem isso o provedor não existe.
2. **Os padrões do produto desligam a escrita** — a extensão sobe, o provedor de leitura existe, e as superfícies de escrita nascem desligadas por configuração.
3. **A paleta deixa de listar os comandos de escrita** — supressão de itens implícitos do menu `MenuId.CommandPalette`.

## 3. Contratos

### 3.1 Contrato de build

| Item | Valor |
| --- | --- |
| Pasta | `extensions/typescript-language-features` |
| Origem | `git checkout 8f12a8e0fe9^ -- extensions/typescript-language-features` |
| Entrada no desktop | `"main": "./out/extension"` |
| Entrada no web | `"browser": "./dist/browser/extension"` (não usada nesta tarefa) |
| Saída da compilação | `extensions/typescript-language-features/out` |
| Task gulp | `compile-extension:typescript-language-features` |
| Nome da task vem de | lista `compilations` de `build/gulpfile.extensions.ts` |

A task existe porque a entrada entra em `compilations`. O nome é derivado da linha: `extensions/typescript-language-features/tsconfig.json` vira `typescript-language-features`, e a task é `compile-extension:<nome>`.

### 3.2 Contrato dos padrões do produto

`PRODUCT_SETTING_DEFAULTS` (`src/vs/workbench/contrib/watchCode/common/hiddenViews.ts`) continua sendo `Readonly<Record<string, unknown>>` e continua consumido por `registerDefaultConfigurations` em `hiddenViews.contribution.ts`. Nenhuma API nova.

Chaves que entram (todas verificadas no manifesto da extensão restaurada, mais as duas acrescentadas por A7 e A8 do ciclo de correção):

| Chave | Default do upstream | Nosso default | Escopo |
| --- | --- | --- | --- |
| `typescript.validate.enable` | `true` | `false` | window |
| `javascript.validate.enable` | `true` | `false` | window |
| `typescript.suggest.enabled` | `true` | `false` | language-overridable |
| `javascript.suggest.enabled` | `true` | `false` | language-overridable |
| `typescript.format.enable` | `true` | `false` | window |
| `javascript.format.enable` | `true` | `false` | window |
| `typescript.disableAutomaticTypeAcquisition` | `false` | `true` | window |
| `editor.lightbulb.enabled` | `onCode` | `off` | (editor) |

Valores válidos de `editor.lightbulb.enabled`: `off`, `onCode`, `on` (`editorOptions.ts:3093`).

### 3.3 Contrato da supressão de comandos na paleta

**Por que funciona** (verificado no código, não suposto):

- `actions.ts:538` — o menu `MenuId.CommandPalette` é especial: além dos itens declarados, ele recebe **todos** os comandos registrados em `MenuRegistry._commands` ("implicit items").
- `actions.ts:546-562` — antes de acrescentar os implícitos, ele monta um `Set` com os ids dos itens **explícitos**. Comando que já tem item explícito não recebe o implícito.
- `menusExtensionPoint.ts:954` — todo comando de `contributes.commands` de uma extensão entra em `MenuRegistry.addCommand`, ou seja, **é um item implícito**.
- `commandsQuickAccess.ts:229` — a paleta monta a lista por `getMenuActions(MenuId.CommandPalette, ...)`, que filtra por `when`.

Consequência: declarar um item explícito com `when: false` para um comando de extensão **tira o comando da paleta**, porque o implícito é suprimido e o explícito nunca casa.

**Contrato do código:**

```typescript
export const HIDDEN_COMMAND_IDS: readonly string[] = [ ... ];
```

E, na contribuição:

```typescript
private hidePaletteCommands(ids: readonly string[]): void {
	for (const id of ids) {
		const command = MenuRegistry.getCommand(id) ?? { id, title: id };
		this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command, when: ContextKeyExpr.false() }));
	}
}
```

Diferença deliberada em relação às listas de views: aqui o item é registrado **mesmo quando o comando ainda não existe**, com título de fallback. As views são tolerantes porque desregistrar um id inexistente não teria efeito; aqui a supressão precisa estar no lugar **antes** de a extensão registrar o comando, senão o implícito aparece.

**Limite conhecido deste mecanismo:** ele só alcança itens implícitos. Comando registrado com `f1: true` (`registerAction2`, `actions.ts:754-757`) ou com item explícito de paleta (`editorExtensions.ts:659`, `clipboard.ts:65`) continua na paleta mesmo com um item `when: false` nosso — o item dele é explícito e não é suprimido. Isso não afeta esta tarefa (os comandos do TypeScript são de extensão, e a extensão restaurada **não declara `menus`**), mas é a limitação que a E8-T2 vai encontrar.

## 4. Alterações necessárias

### A1 — `extensions/typescript-language-features/` (restaurado, sem edição)

```text
git checkout 8f12a8e0fe9^ -- extensions/typescript-language-features
```

192 arquivos. Nenhum arquivo restaurado é editado. Conferir na raiz da pasta: `package.json`, `package-lock.json`, `tsconfig.json`, `src`.

### A2 — `build/npm/dirs.ts`

Acrescentar `'extensions/typescript-language-features',` à lista `dirs`, depois de `'extensions/terminal-suggest',`, mantendo a ordem alfabética do bloco.

Motivo: é essa lista que o `npm install` do repositório percorre.

### A3 — `build/gulpfile.extensions.ts`

Acrescentar `'extensions/typescript-language-features/tsconfig.json',` à lista `compilations` (linhas 53 a 65), depois de `'extensions/terminal-suggest/tsconfig.json',`.

**Não** acrescentar `'extensions/typescript-language-features/web/tsconfig.json'` (D2 = A).

### A4 — `src/vs/workbench/contrib/watchCode/common/hiddenViews.ts`

1. Acrescentar ao `PRODUCT_SETTING_DEFAULTS` as 8 chaves da tabela 3.2, em bloco com comentário em português explicando o critério: a inteligência de código serve para ler, não para escrever.
2. Acrescentar `HIDDEN_COMMAND_IDS` com os comandos de escrita:

```typescript
export const HIDDEN_COMMAND_IDS: readonly string[] = [
	'typescript.sortImports',
	'javascript.sortImports',
	'typescript.selectTypeScriptVersion',
];
```

### A5 — `src/vs/workbench/contrib/watchCode/browser/hiddenViews.contribution.ts`

No construtor, logo depois do `registerDefaultConfigurations`, chamar `this.hidePaletteCommands(HIDDEN_COMMAND_IDS)`, e implementar o método privado do contrato 3.3.

Imports novos: `MenuId`, `MenuRegistry` de `platform/actions/common/actions.js` e `ContextKeyExpr` de `platform/contextkey/common/contextkey.js`.

### A6 — `src/vs/workbench/contrib/watchCode/test/common/hiddenViews.test.ts`

Acrescentar testes no mesmo padrão dos existentes (o arquivo já cobre as listas declarativas):

- os comandos escondidos não se repetem e não são vazios;
- os comandos de escrita estão na lista;
- os comandos de leitura que o produto usa (`typescript.goToSourceDefinition`, `typescript.findAllFileReferences`, `typescript.restartTsServer`) **não** estão na lista;
- os padrões de escrita estão desligados (`validate.enable` falso, `suggest.enabled` falso, `format.enable` falso, `disableAutomaticTypeAcquisition` verdadeiro, `editor.lightbulb.enabled` `off`).

### A7 — `docs/watch-code/e2e/run-manual-tests.ts`

Cenário novo `T-0007`, no mesmo padrão do `T-0006`.

### A8 — `docs/watch-code/testes-manuais.md`

Registro do `T-0007` conforme o CLAUDE.md: objetivo, pré-condições, passos, resultado esperado, resultado obtido e situação.

### A9 — `docs/watch-code/Workflow/overview.md`

Marcar a E8-T1 como feito, com a evidência.

### A10 — `extensions/typescript-language-features/package.json`

Remover as **cinco** entradas de `contributes.menus.commandPalette` dos comandos de escrita: `typescript.sortImports`, `javascript.sortImports`, `typescript.removeUnusedImports`, `javascript.removeUnusedImports` e `typescript.selectTypeScriptVersion`.

Os comandos continuam declarados em `contributes.commands` — deixam de aparecer na paleta, não deixam de existir. Sem esta remoção o `when` falso de A5 não tem efeito: o item da paleta da extensão é explícito, e a supressão só alcança o item implícito. As duas metades juntas é que tiram o comando da paleta.

Esta é a única edição em arquivo vindo do upstream, e é intencional. As entradas ficam documentadas em A10 para que a próxima restauração da extensão possa reaplicá-las.

### A11 — `eslint.config.js`

Remover do bloco de regras extras de extensões as referências a `media-preview`, `simple-browser` e `mermaid-markdown-features` — três extensões apagadas pela E0. As referências sobreviveram porque o bloco nunca tinha sido exercitado: o único arquivo que casava com ele era da extensão restaurada agora.

Sem a limpeza, o `hygiene` reprova com 165 erros de parsing, do tipo `Cannot read file 'extensions/media-preview/tsconfig.json'`: o typescript-eslint não resolve arquivo nenhum quando um dos projetos listados não existe.

## 5. Casos de borda e tratamento de erro

| Caso | Comportamento esperado |
| --- | --- |
| `node_modules` da extensão ausente | A janela abre normalmente; a extensão falha ao ativar e o F12 não responde. Não é erro fatal e não pode travar a abertura. |
| `out/` ausente ou desatualizado | Igual ao anterior. O teste T-0007 reprova, e a correção é T4 do plano. |
| Comando da lista inexistente | O item é registrado com o id como título. Nada aparece na paleta (o `when` é falso) e nada quebra. |
| `.ts` sem projeto (arquivo solto) | O TypeScript usa o projeto inferido, como no VS Code. F12 funciona entre arquivos abertos na mesma pasta. |
| F12 sobre símbolo sem definição | Comportamento nativo: nenhuma navegação. Sem erro na tela. |
| Usuário aponta `typescript.tsdk` para outra versão | Fora de escopo. O produto usa a versão embarcada em `extensions/node_modules/typescript`. |
| Usuário sobrescreve um default do produto | Volta a ter validação/sugestão para ele. É default, não política: não bloqueamos. |
| `hygiene` e `eslint` nos arquivos restaurados | São 192 arquivos do upstream entrando no índice. Se a checagem reprovar, o ajuste é do que ela apontar, sem editar o código do upstream. |

## 6. Plano de testes

### 6.1 Automatizado

- `src/vs/workbench/contrib/watchCode/test/common/hiddenViews.test.ts` — contratos declarativos de A4/A6 (rápido, sem janela).
- `npm run test-node -- --runGlob "**/watchCode/test/**/*.test.js"` — a suíte do módulo continua verde.
- `npm run typecheck-client`, `npx eslint` nos arquivos tocados, `node --experimental-strip-types build/hygiene.ts` e `npm run valid-layers-check`.

Não há unidade possível para "o F12 navegou": isso depende do servidor de linguagem subir dentro da janela.

### 6.2 Manual — T-0007

O que precisa de janela real e prova programática:

1. Abrir um `.ts` do workspace observado que importe um símbolo de outro arquivo.
2. Conferir que a extensão do TypeScript está ativa, pelo anúncio dela na barra de status.
3. Posicionar o cursor sobre o símbolo importado e pressionar `F12`.
4. Conferir que o editor ativo passou a ser o arquivo de origem, e que o cursor está na linha e na coluna da definição.
5. Conferir que o arquivo aberto tem **zero** decorações de erro (`.squiggly-error`, `.squiggly-warning`) e que a barra de status não acusa problema, mesmo com o erro de tipo plantado de propósito no arquivo de teste.
6. Abrir o hover e conferir que ele traz a assinatura.
7. Abrir a paleta e procurar `sort imports`: não pode aparecer.
8. Conferir que nenhuma sugestão abre ao digitar.

### 6.3 Fora do escopo de teste

Formatação, rename e code actions do editor: cobertos pela decisão D4 (não entram) e pelo T-0007 apenas como "não apareceu superfície nova".

## 7. Critérios de aceite verificáveis

1. `extensions/typescript-language-features/package.json` existe, vem do commit `8f12a8e0fe9^` e traz a única diferença de A10.
2. `build/npm/dirs.ts` contém `'extensions/typescript-language-features'`.
3. `build/gulpfile.extensions.ts` contém `'extensions/typescript-language-features/tsconfig.json'` e **não** contém a entrada `web`.
4. `extensions/typescript-language-features/node_modules` resolve as dependências de runtime do manifesto.
5. `extensions/typescript-language-features/out/extension.js` existe.
6. `PRODUCT_SETTING_DEFAULTS` contém as 11 chaves da tabela 3.2 mais `typescript.tsserver.useSyntaxServer` e `editor.wordBasedSuggestions`, com os valores aprovados.
7. `HIDDEN_COMMAND_IDS` contém os 5 comandos de escrita e nenhum comando de leitura.
8. Os testes automatizados do módulo passam, incluindo os novos de `hiddenViews`.
9. `typecheck-client`, `eslint`, `hygiene` e `valid-layers-check` passam.
10. T-0007 executa e todas as 10 conferências do arnês passam.
11. A única diferença sob `extensions/typescript-language-features/` em relação a `8f12a8e0fe9^` é a remoção das cinco entradas de paleta de A10 — conferível por `git diff 8f12a8e0fe9^ -- extensions/typescript-language-features` depois de `git add`, que deve mostrar só esse trecho.
12. O relatório informa o resultado do T-0007 e, se houver teste manual pendente, diz qual.
13. `eslint.config.js` não referencia extensão apagada pela E0 no bloco de regras extras, e o `hygiene` passa com a extensão restaurada no índice.

## 8. Divergências do plano

Registradas, não silenciadas. Nenhuma muda decisão aprovada.

1. **`typescript.tsserver.log` sai da lista de padrões.** No manifesto da extensão o default já é `off`; declarar de novo não muda nada e só engorda a lista. O plano listava a chave.
2. **`typescript.organizeImports` não existe.** O comando de organizar imports é do editor: `editor.action.organizeImports` (`codeAction.ts:38`), acionado por code action. A intenção aprovada fica coberta por dois lados: a lâmpada desligada e a validação desligada. Fica como ponto de conferência no passo 7 do T-0007.
3. **`typescript.sortImports` e `javascript.sortImports` são comandos separados** no manifesto. O plano citava só a forma do TypeScript; a lista esconde os dois, porque o produto trata `.js` e `.ts` igual.
4. **`typescript.tsserver.useSyntaxServer: 'never'` entra nos padrões do produto.** Sem ele o F12 não funciona: com a validação desligada o cliente nunca recebe evento de diagnóstico, nunca sai do estado "carregando projeto" e manda definição e hover para o servidor sintático, que não responde. Descoberto na primeira execução do T-0007 e aprovado pelo usuário.
5. **O `package.json` da extensão deixa de ser intocado (A10).** A supressão pelo menu não alcança item explícito, e a extensão declara as entradas de escrita na paleta. Aprovado pelo usuário, com o custo de uma divergência documentada em relação ao upstream.
6. **`editor.wordBasedSuggestions: 'off'` entra nos padrões (A6).** A sugestão que sobrava ao digitar não vinha do TypeScript — o log do servidor não tinha nenhum `completionInfo` — e sim do provedor de palavras do documento. Aprovado pelo usuário.
7. **`eslint.config.js` sai do escopo intocado (A11).** Referências a três extensões apagadas pela E0 derrubavam o `hygiene` com 165 erros; a limpeza é exigida para o hook de pre-commit voltar a passar.

## 9. Rastreabilidade

| Requisito do plano | Onde esta especificação atende |
| --- | --- |
| T1 restaurar a pasta | A1 |
| T2 listas de build | A2, A3 |
| T3 dependências | A1 (o `package-lock.json` restaurado é a fonte) |
| T4 compilar | A3 (nome da task) |
| T5 padrões do produto | A4 |
| D4 comandos de escrita | A4, A5, 3.3 |
| T6 validar na janela | A7, A8, 6.2 |
| T7 registrar | A8, A9 |
| Evidência automatizada | A6, 6.1 |
