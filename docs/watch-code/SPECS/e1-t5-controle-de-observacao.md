# Especificação — E1-T5 · Controle de observação

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T5 — Controle de observação |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Entrada | @docs/watch-code/PLANS/e1-t5-controle-de-observacao.md |
| Saída | Este arquivo |
| Próxima etapa | Developer |

## 1. Referência

- Plano: `docs/watch-code/PLANS/e1-t5-controle-de-observacao.md`
- Guia: `docs/watch-code/Workflow/overview.md` §2.13 (observação ativável), §3.5 (fluxo de uso e ativação), §6 (backlog)
- Decisões aprovadas pelo usuário: **D1 = A** (desligar suspende toda a captura por disco) e **D2 = A** (a observação nasce ligada, vale para a janela, não persiste)

## 2. Comportamento esperado

### 2.1 Estado

A observação tem exatamente **dois** estados, e o estado mora no
`IWorkspaceWatcherService` — não na interface:

| Estado | `isActive` | Watchers | Eventos | Sessões |
| --- | --- | --- | --- | --- |
| Ligada | `true` | registrados em todas as pastas do workspace | gravados no ledger | abertas e agrupadas por pausa |
| Desligada | `false` | liberados | **nenhum** | fechadas no instante em que se desliga |

**Estado inicial: ligado**, como a E1-T4 já entrega. A
`WorkspaceWatcherContribution` continua chamando `start()` na restauração da
interface. O estado **não** sobrevive ao fechamento da janela: reabrir volta a
observar (D2 = A).

### 2.2 Comando

Um único comando de alternância, visível na Paleta de Comandos:

- **Id:** `watchCode.toggleObservation`
- **Categoria:** `Watch Code` — a paleta mostra "Watch Code: Observar/Parar de Observar"
- **Título:** `Turn Observation On/Off`
- **Efeito:** inverte o estado atual. Não recebe argumento, não devolve valor e
  não pergunta nada ao usuário.

O comando é o **único** caminho de escrita do estado pela interface: o rótulo é
uma frase, não um par de comandos "ligar"/"desligar", para que a paleta tenha um
item só (T4 do plano).

### 2.3 Indicador

Um item na barra de status, alinhado à direita, sempre visível enquanto a janela
estiver aberta:

| Estado | Texto | Tooltip e rótulo de leitura |
| --- | --- | --- |
| Ligada | `$(eye) Watch Code` | `Watch Code is observing the workspace. Click to turn observation off.` |
| Desligada | `$(eye-closed) Watch Code` | `Watch Code is not observing the workspace. Click to turn observation on.` |

Regras do indicador:

1. O clique executa `watchCode.toggleObservation` — o indicador **não** tem lógica
   própria de alternância.
2. O estado mostrado vem sempre de `onDidChangeActive` (e de `isActive` uma única
   vez, na construção). O indicador **não** guarda cópia do estado.
3. Nenhuma cor de alerta nos dois estados: `kind` fica ausente. "Desligada" não é
   erro — é escolha do desenvolvedor, e o ícone já carrega a diferença. Isso
   mantém a barra calma e deixa o vermelho para falha de verdade.

### 2.4 Ciclo de vida

1. A interface sobe; a contribuição do watcher chama `start()`; `isActive` vira
   `true` e `onDidChangeActive` emite `true`.
2. A contribuição do controle desenha o indicador a partir de `isActive` e passa a
   escutar `onDidChangeActive`.
3. O desenvolvedor desliga; o comando chama `toggle()`; o watcher libera os
   watchers, fecha as sessões abertas e emite `false`; o indicador se atualiza.
4. O desenvolvedor religa; a escrita seguinte à religação abre **sessão nova** — a
   anterior foi fechada no passo 3.

A ordem entre os passos 1 e 2 **não é determinística** (as duas contribuições
sobem na mesma fase). Por isso o indicador lê `isActive` na construção **e** se
inscreve no evento: cobre as duas ordens sem depender de qual contribuição subiu
primeiro.

## 3. Contratos

### 3.1 `IWorkspaceWatcherService` — dois membros acrescentados

Arquivo: `src/vs/platform/changeLedger/common/workspaceWatcherService.ts`

```ts
export interface IWorkspaceWatcherService {
	readonly _serviceBrand: undefined;

	/** Liga a observação das pastas do workspace. Idempotente. */
	start(): void;

	/** Desliga a observação e fecha as sessões abertas. Idempotente. */
	stop(): void;

	/** Inverte o estado da observação. */
	toggle(): void;

	/** Observação está ativa. */
	readonly isActive: boolean;

	/** Avisa quando o estado da observação muda. */
	readonly onDidChangeActive: Event<boolean>;
}
```

`start()` passa a emitir `true` **depois** de registrar os watchers; `stop()` passa
a emitir `false` **depois** de liberar os watchers e fechar as sessões. Em ambos, a
emissão fica depois da mudança de estado, para que quem escuta leia `isActive` já
consistente com o valor recebido.

### 3.2 Identificadores públicos da contribuição de interface

Arquivo: `src/vs/workbench/contrib/watchCode/browser/observationControl.contribution.ts`

```ts
/** Id do comando de alternância, exposto para o indicador e para testes. */
export const TOGGLE_OBSERVATION_COMMAND_ID = 'watchCode.toggleObservation';
```

O id do item na barra de status (`watchCode.observation`) fica **privado** ao
arquivo: ninguém de fora precisa dele.

## 4. Alterações necessárias

### 4.1 Alterar — `src/vs/platform/changeLedger/common/workspaceWatcherService.ts`

1. Importar `Emitter` e `Event` de `../../../base/common/event.js`.
2. Acrescentar `toggle()` e `onDidChangeActive` à interface, conforme §3.1.
3. Na classe:
   - campo `private readonly _onDidChangeActive = this._register(new Emitter<boolean>());`
   - membro `readonly onDidChangeActive = this._onDidChangeActive.event;`
   - `toggle(): void` que chama `stop()` quando `isActive` e `start()` quando não;
   - `start()` emite `this._onDidChangeActive.fire(true)` depois do laço que
     registra os watchers;
   - `stop()` emite `this._onDidChangeActive.fire(false)` depois de fechar as
     sessões.

**O que não muda:** o filtro de ruído, o agrupamento por pausa, a atribuição de
pasta e o `onFilesChange`. Nenhuma linha do caminho de captura é tocada.

### 4.2 Criar — `src/vs/workbench/contrib/watchCode/browser/observationControl.contribution.ts`

Uma contribuição só, com o comando e o indicador:

```ts
class ObservationControlContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.watchCode.observationControl';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IWorkspaceWatcherService private readonly workspaceWatcherService: IWorkspaceWatcherService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(
			TOGGLE_OBSERVATION_COMMAND_ID,
			() => this.workspaceWatcherService.toggle()
		));

		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: TOGGLE_OBSERVATION_COMMAND_ID,
				category: localize('watchCode', "Watch Code"),
				title: localize('watchCode.toggleObservation', "Turn Observation On/Off")
			}
		});

		this.render(this.workspaceWatcherService.isActive);
		this._register(this.workspaceWatcherService.onDidChangeActive(active => this.render(active)));
	}

	/** Desenha o indicador, criando o item na primeira vez. */
	private render(active: boolean): void {
		const entry = active ? ACTIVE_ENTRY : INACTIVE_ENTRY;

		if (this.entry.value) {
			this.entry.value.update(entry);
		} else {
			this.entry.value = this.statusbarService.addEntry(entry, 'watchCode.observation', StatusbarAlignment.RIGHT, 100);
		}
	}
}

registerWorkbenchContribution2(ObservationControlContribution.ID, ObservationControlContribution, WorkbenchPhase.AfterRestored);
```

Os dois `IStatusbarEntry` ficam como constantes do módulo, com `name`,
`text`, `ariaLabel`, `tooltip` e `command` conforme a tabela do §2.3. O
`command` de cada entrada é `TOGGLE_OBSERVATION_COMMAND_ID` — o mesmo caminho do
clique e do comando da paleta.

Toda string visível ao usuário nasce em **inglês**, com `nls.localize`, conforme a
convenção do repositório; a tradução para português vem do pacote de idioma.

### 4.3 Alterar — `src/vs/workbench/workbench.common.main.ts`

Acrescentar o import na região `// Watch Code`, logo abaixo do `hiddenViews`:

```ts
import './contrib/watchCode/browser/observationControl.contribution.js';
```

### 4.4 Alterar — `src/vs/platform/changeLedger/test/common/workspaceWatcherService.test.ts`

Testes novos no mesmo `suite`, no padrão já existente (nomes em português,
`assert.deepStrictEqual` com um objeto-resumo). Ver §6.1.

### 4.5 Alterar — `docs/watch-code/testes-manuais.md`

Acrescentar o teste **T-0004**, sem remover nem alterar os existentes. Ver §6.2.

### 4.6 Arquivos que **não** mudam

`changeEvent.ts`, `changeLedgerService.ts`, `changeRecorderService.ts`,
`sessionGrouper.ts`, `ignoredPaths.ts`, `baseline.ts`, `shadowStore.ts` e o
`ChangeLedgerService` do workbench. A tarefa **não** altera o formato do evento,
o ledger nem o baseline.

## 5. Casos de borda e tratamento de erro

| # | Caso | Comportamento esperado |
| --- | --- | --- |
| B1 | `start()` chamado com a observação já ligada | Não faz nada: não registra watcher de novo e **não emite** evento de estado. |
| B2 | `stop()` chamado com a observação já desligada | Não faz nada e **não emite**. |
| B3 | Workspace **sem pasta nenhuma** | `start()` e `toggle()` não ligam a observação; `isActive` continua `false` e nenhum evento é emitido. O indicador mostra o estado desligado — coerente com o serviço. |
| B4 | Desligar com sessões abertas | O `stop()` já fecha todas (`grouper.closeAll`); comportamento herdado, coberto por teste. |
| B5 | Religar depois de desligar | A escrita seguinte abre **sessão nova**: a anterior foi fechada em B4. |
| B6 | Desligar durante uma gravação em curso | A promessa de `recordChange` já em andamento termina normalmente; o `stop()` impede apenas detecções **novas**. Não há cancelamento nem evento pela metade. |
| B7 | Indicador criado antes de o watcher ligar | `render(false)` na construção e depois `render(true)` no evento — sem item duplicado, porque o acesso é guardado em `MutableDisposable`. |
| B8 | Comando (paleta) e clique executados em sequência | Cada um inverte o estado uma vez; o indicador acompanha os dois, porque ambos passam pelo mesmo `toggle()`. |
| B9 | Falha ao gravar um evento enquanto se desliga | Já tratada na E1-T4: vai para o log e a observação segue. A E1-T5 não acrescenta caminho de erro. |

Não há caminho novo de erro: `toggle()` só chama `start()` ou `stop()`, e nenhum
dos dois lança.

## 6. Plano de testes

### 6.1 Unidade — `workspaceWatcherService.test.ts`

| # | Teste | O que prova |
| --- | --- | --- |
| U1 | `start avisa que a observação ligou` | `onDidChangeActive` emite `true` no `start()`. |
| U2 | `stop avisa que a observação desligou` | Emite `false` no `stop()`. |
| U3 | `start repetido não avisa de novo` | `start(); start();` emite `true` **uma** vez (B1). |
| U4 | `stop repetido não avisa de novo` | `stop(); stop();` emite `false` **uma** vez (B2). |
| U5 | `toggle inverte o estado` | Liga quando desligado e desliga quando ligado, com o evento correspondente. |
| U6 | `toggle ligado volta a observar` | Desligar, religar por `toggle()` e escrever: o ledger recebe um evento (B5). |
| U7 | `sem pasta no workspace o toggle não liga` | `isActive` continua `false` e nenhum evento de estado sai (B3). |

Forma: acumular os valores emitidos em um array com `onDidChangeActive(value => emitidos.push(value))` e comparar com `assert.deepStrictEqual`. Os
testes que dependem de disco usam a pausa `SETTLED` que já existe no arquivo.

Os testes de disco já existentes (`depois de stop a escrita não vira evento`,
`stop e start voltam a observar`) continuam valendo e cobrem o efeito de D1 = A.

### 6.2 Manual — T-0004, comando e indicador

Um teste automatizado **não** cobre esta parte: a Paleta de Comandos e a barra de
status só existem com a interface montada e o Electron rodando. O teste é
registrado em `docs/watch-code/testes-manuais.md`, com objetivo, pré-condições,
passos, resultado esperado e situação `pendente`. Roteiro:

1. Abrir uma pasta de teste pelo `watchcode.bat`.
2. Confirmar o item `$(eye) Watch Code` na barra de status.
3. Rodar `watchCode.toggleObservation` pela paleta; conferir o ícone, o tooltip e
   o texto.
4. Com a observação desligada, alterar um arquivo **fora** da IDE e conferir que
   **nenhum** evento novo aparece no armazenamento do workspace.
5. Clicar no item da barra de status para religar; repetir a alteração e conferir
   que agora o evento aparece.

### 6.3 Validação do repositório

1. `npx tsc --noEmit -p src/tsconfig.json` — sem erros.
2. `npm run valid-layers-check` — verde.
3. `node --experimental-strip-types build/hygiene.ts` — verde, com os arquivos já
   no índice do git.
4. `npm run transpile-client` e depois
   `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` — a
   suíte inteira do módulo passando, com os sete testes novos.

## 7. Critérios de aceite

1. `watchCode.toggleObservation` aparece na Paleta de Comandos como "Watch Code:
   Turn Observation On/Off" e alterna o estado ao ser executado.
2. Desligada, uma escrita externa **não** gera evento nenhum no ledger.
3. Religada, a escrita seguinte gera evento, com `sessionId` diferente do da
   sessão anterior.
4. O item da barra de status mostra `$(eye) Watch Code` ligada e
   `$(eye-closed) Watch Code` desligada, com tooltip e rótulo de leitura
   correspondentes.
5. Clicar no item executa a alternância.
6. `start()` e `stop()` repetidos **não** emitem evento de estado redundante.
7. Desligar fecha as sessões abertas.
8. Workspace sem pasta: alternar não quebra e o indicador continua coerente.
9. Os sete testes de unidade do §6.1 passam, junto dos dez que já existiam.
10. Os quatro comandos do §6.3 passam.
11. Nenhum arquivo fora da lista do §4 é alterado.
12. O T-0004 está registrado como `pendente` em `docs/watch-code/testes-manuais.md`.

## 8. Decisões

**Decididas pelo usuário** (registradas no plano, §7):

- **D1 = A** — desligar suspende toda a captura por disco. A leitura B (suspender
  só hook e agrupamento) não foi adotada: sem hook até a E6, o único efeito de B
  seria desligar o agrupamento, e o contrato exige `sessionId` em todo evento.
- **D2 = A** — a observação nasce **ligada** e o estado vale para a janela, sem
  persistência. Consequência aceita: não há varredura de recuperação, então o que
  for escrito com a observação desligada simplesmente não entra no ledger.

**Divergência do plano, registrada:** o plano (§5, etapa 1) previa
`setActive(active)`; a especificação fixa `toggle()`. O comando não tem estado-alvo
— ele inverte o estado atual —, e manter a inversão dentro do serviço que é dono do
estado evita que a interface decida comportamento. `setActive` continua possível
como evolução, se algum dia houver um chamador com estado-alvo (por exemplo, o
liga/desliga da E6).

**Sem decisões pendentes.**

## 9. Fora de escopo

| Fora | Por quê | Onde entra |
| --- | --- | --- |
| Injeção de hook no agente | Depende de saber qual agente é | E6-T1 |
| Configuração de usuário para o estado | O estado é da janela, não do perfil | — |
| Varredura de recuperação ao ligar | Não está no backlog; mudaria o custo do `start()` | — |
| Tecla de atalho para o comando | Não foi pedida; a paleta e o clique bastam | — |
| Filtro de ignorados configurável | Fora do escopo da E1 | E5-T3 |
| Identidade visual do indicador | Ícone e cores do produto | E7-T1 |
