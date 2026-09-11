# Especificação — E2-T1 · Serviço de timeline

| Campo | Valor |
| --- | --- |
| Tarefa | E2-T1 — Serviço de timeline |
| Workflow | High |
| Etapa | SpecWriter (2 de 5) |
| Entrada | @docs/watch-code/PLANS/e2-t1-servico-de-timeline.md |
| Saída | Este arquivo |
| Próxima etapa | Developer |

## 1. Referência

- Plano: `docs/watch-code/PLANS/e2-t1-servico-de-timeline.md`
- Guia: `docs/watch-code/Workflow/overview.md` §2.3 (linha do tempo), §4.1 (regra única de `current`/`history`), §4.3 (sessão), §6 (backlog da E2), §8.6 e §8.11 (padrões assumidos)
- Decisões aprovadas pelo usuário: **D1 = A** (o status é derivado do ledger, sem ler o disco), **D2 = A** (o serviço mora em `platform/changeLedger/common/`), **D3 = A** (`onDidRecord` no ledger alimenta o `onDidChange` da timeline), **D4 = A** (a E2-T1 não monta sessões)

## 2. Comportamento esperado

### 2.1 Papel do serviço

O ledger é passivo: grava e lê. A timeline é o **modelo de leitura** sobre ele —
a única porta por onde a interface pergunta "o que mudou, em ordem, e o que ainda
vale". Ela não grava, não observa o disco e não conhece o watcher.

| Pergunta | Resposta da timeline |
| --- | --- |
| O que mudou no workspace, em ordem? | `getEvents()` |
| O que mudou neste arquivo? | `getEventsForFile(fileUri)` |
| O que é este evento? | `getEvent(eventId)` |
| Alguma entrada ainda vale? | o `status` derivado em toda resposta |
| Mudou agora? | `onDidChange` |

### 2.2 Carga única

A leitura do ledger acontece **uma vez**, na primeira consulta, e a lista fica em
memória. Consultas seguintes não tocam o disco. O ledger lê um arquivo JSON por
evento (`resolve` do diretório + `readById` de cada filho): fazer isso a cada
redesenho de lista seria o custo dominante da futura view.

Duas consultas simultâneas antes da primeira carga produzem **uma** leitura: a
promessa da carga é compartilhada.

Uma falha de leitura **rejeita** a consulta e libera a próxima para tentar de
novo — é o que permite à E2-T2 distinguir "não há histórico" (lista vazia) de
"não deu para ler" (erro).

### 2.3 Derivação de `current`/`history`

Regra, por arquivo, calculada **na consulta**, nunca gravada:

> Em ordem cronológica crescente, o **último** evento de cada arquivo é `current`;
> todos os anteriores são `history`.

Três consequências:

1. O `status` que está gravado no evento é um retrato do instante da gravação e
   **não** é autoridade: a timeline recalcula. Um ledger com dois `current` para
   o mesmo arquivo (gravação interrompida entre a gravação e o rebaixamento)
   responde com um só.
2. A derivação é feita **por arquivo**, então consultar um arquivo isolado dá o
   mesmo resultado que consultar o workspace inteiro e filtrar.
3. Um arquivo alterado com a janela fechada continua com a última entrada
   `current` — limitação aceita na E1-T5, tratada na **E5-T1**.

### 2.4 Ordem

Crescente (mais antigo primeiro), na mesma ordem do ledger: `timestamp` e, no
empate, o `id`. O critério é **o mesmo** do `compareEvents` do ledger — a
timeline o reusa, não reimplementa.

### 2.5 Filtro por arquivo

Compara o caminho **relativo ao workspace**, exatamente como o evento o guarda
(`ChangeEvent.fileUri`, produzido por `relativePath` no watcher). A comparação
normaliza o separador (`\` → `/`) e o prefixo `./`; fora isso é exata — um
caminho com maiúsculas diferentes é outro arquivo.

### 2.6 Aviso de mudança

O ledger avisa toda gravação; a timeline repassa o aviso depois de atualizar a
lista em memória. Quem consultar logo depois do aviso já vê o evento novo, sem
que a leitura do disco se repita.

Casos de borda do aviso:

| Situação | Comportamento |
| --- | --- |
| Lista já carregada | O evento entra na lista em memória e o aviso sai na hora |
| Lista ainda não carregada | O evento é guardado; a carga o junta ao que veio do disco |
| Carga em andamento | O evento é guardado e a junção **não** o duplica se a leitura do disco já o trouxe |
| Gravação fora de ordem (timestamp menor que o último) | A lista é reordenada; a ordem crescente nunca é quebrada |

## 3. Contratos

### 3.1 Acréscimo no ledger

```ts
export interface IChangeLedgerService {
	readonly _serviceBrand: undefined;

	readonly snapshots: ISnapshotStore;

	/**
	 * Avisa que um evento foi gravado, com o evento e o id do rebaixado.
	 *
	 * O record() é o único caminho de escrita do ledger: quem observa este evento
	 * fica sabendo de toda gravação sem varrer o disco. O aviso sai depois de o
	 * novo current estar gravado e o anterior rebaixado.
	 */
	readonly onDidRecord: Event<IRecordEventResult>;

	// ... resto do contrato, inalterado
}
```

`IRecordEventResult` já existe e **não muda**:

```ts
export interface IRecordEventResult {
	readonly event: ChangeEvent;
	readonly supersededEventId?: string;
}
```

O único outro acréscimo é a exportação de `compareEvents`, hoje privado no
módulo do ledger, para que a timeline use a mesma ordem.

### 3.2 Serviço de timeline

```ts
export const ITimelineService = createDecorator<ITimelineService>('timelineService');

/** O que mudou na linha do tempo. */
export interface ITimelineChange {
	/** Evento gravado. */
	readonly added: ChangeEvent;
	/** Id do evento que deixou de ser o atual do arquivo, quando houve. */
	readonly demotedEventId?: string;
}

export interface ITimelineService {
	readonly _serviceBrand: undefined;

	/** Todos os eventos do workspace, em ordem cronológica crescente. */
	getEvents(): Promise<readonly ChangeEvent[]>;

	/** Eventos de um arquivo do workspace, em ordem cronológica crescente. */
	getEventsForFile(fileUri: string): Promise<readonly ChangeEvent[]>;

	/** Evento de um id, ou `undefined` quando não existe. */
	getEvent(eventId: string): Promise<ChangeEvent | undefined>;

	/** Avisa quando a linha do tempo muda. */
	readonly onDidChange: Event<ITimelineChange>;
}
```

**Nenhum tipo novo de modelo de view.** As consultas devolvem `ChangeEvent`, o
contrato que já existe: formatar arquivo, linhas e hora é da E2-T2.

## 4. Alterações necessárias

### 4.1 `src/vs/platform/changeLedger/common/changeLedgerService.ts` (alterar)

1. Importar `Emitter, Event` de `../../../base/common/event.js` e `Disposable`
   de `../../../base/common/lifecycle.js`.
2. `ChangeLedgerService` passa a `extends Disposable implements IChangeLedgerService`,
   com `super()` como primeira linha do construtor.
3. Campo novo, com o descarte registrado na própria criação:

```ts
	private readonly _onDidRecord = this._register(new Emitter<IRecordEventResult>());

	readonly onDidRecord = this._onDidRecord.event;
```

4. `onDidRecord: Event<IRecordEventResult>` declarado em `IChangeLedgerService`
   (com o comentário do §3.1).
5. No fim de `record()`, trocar o `return { event: stored, supersededEventId };`
   por:

```ts
		const result = { event: stored, supersededEventId };

		// O aviso sai depois de o novo current estar gravado e o anterior
		// rebaixado: quem reage a ele lê o ledger já no estado final.
		this._onDidRecord.fire(result);

		return result;
```

6. `compareEvents` passa a ser `export function compareEvents`, com o comentário
   ampliado para dizer que é a ordem canônica do módulo.

Nada mais muda: o formato dos eventos gravados, o índice, o store de snapshots e
a assinatura de `record()` ficam como estão.

### 4.2 `src/vs/platform/changeLedger/common/timelineService.ts` (criar)

Arquivo novo, com o cabeçalho de copyright, o marcador
`// allow-any-unicode-comment-file` e comentários em português. Conteúdo, na
íntegra:

```ts
export class TimelineService extends Disposable implements ITimelineService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<ITimelineChange>());
	readonly onDidChange = this._onDidChange.event;

	/** Eventos do ledger, em ordem cronológica crescente. */
	private entries: ChangeEvent[] | undefined;

	/** Carga em andamento: duas consultas simultâneas leem o disco uma vez só. */
	private loading: Promise<readonly ChangeEvent[]> | undefined;

	/** Gravações que chegaram antes de a lista ser carregada. */
	private readonly recordedEarly = new Map<string, ChangeEvent>();

	constructor(@IChangeLedgerService private readonly ledger: IChangeLedgerService) {
		super();

		this._register(ledger.onDidRecord(result => this.onRecorded(result)));
	}

	async getEvents(): Promise<readonly ChangeEvent[]> {
		return withDerivedStatus(await this.load());
	}

	async getEventsForFile(fileUri: string): Promise<readonly ChangeEvent[]> {
		const key = normalizeFileUri(fileUri);

		return withDerivedStatus((await this.load()).filter(event => normalizeFileUri(event.fileUri) === key));
	}

	async getEvent(eventId: string): Promise<ChangeEvent | undefined> {
		return withDerivedStatus(await this.load()).find(event => event.id === eventId);
	}

	/** Lê o ledger na primeira consulta e mantém a lista em memória. */
	private async load(): Promise<readonly ChangeEvent[]> {
		if (this.entries) {
			return this.entries;
		}

		const loading = this.loading ?? this.ledger.readAll().then(
			events => this.cache(events),
			error => {
				// Sem carga não há lista: a próxima consulta tenta de novo.
				this.loading = undefined;

				throw error;
			}
		);

		this.loading = loading;

		return loading;
	}

	/** Junta o que veio do disco com o que foi gravado durante a leitura. */
	private cache(events: readonly ChangeEvent[]): readonly ChangeEvent[] {
		const cached = [...events];

		for (const event of this.recordedEarly.values()) {
			// A leitura pode ter começado antes da gravação e terminado depois: sem
			// esta conferência o mesmo evento entraria duas vezes.
			if (!cached.some(entry => entry.id === event.id)) {
				cached.push(event);
			}
		}

		this.recordedEarly.clear();
		this.entries = cached.sort(compareEvents);
		this.loading = undefined;

		return this.entries;
	}

	/** Põe o evento gravado na lista em memória e avisa quem observa. */
	private onRecorded(result: IRecordEventResult): void {
		const { event } = result;

		if (!this.entries) {
			this.recordedEarly.set(event.id, event);
		} else {
			this.entries.push(event);

			// A ordem é a do ledger e a gravação quase sempre é a mais recente:
			// reordenar só quando não for evita reordenar a lista a cada evento.
			const previous = this.entries[this.entries.length - 2];

			if (previous && compareEvents(previous, event) > 0) {
				this.entries.sort(compareEvents);
			}
		}

		this._onDidChange.fire({ added: event, demotedEventId: result.supersededEventId });
	}
}
```

E as duas funções de módulo:

```ts
/**
 * Recalcula o status de cada evento a partir do conjunto.
 *
 * O status gravado é um retrato do instante da gravação; a timeline é a
 * autoridade de leitura e responde pela regra: por arquivo, o evento mais
 * recente é o atual e os anteriores são histórico. Percorrer em ordem crescente
 * e ficar com o último de cada arquivo dá isso sem comparar datas.
 */
function withDerivedStatus(events: readonly ChangeEvent[]): readonly ChangeEvent[] {
	const currentIds = new Map<string, string>();

	for (const event of events) {
		currentIds.set(event.fileUri, event.id);
	}

	let changed = false;

	// Sem nenhuma mudança de status a própria lista é devolvida: quem já a tem
	// não vê objeto novo a cada consulta.
	const derived = events.map(event => {
		const status: ChangeEventStatus = currentIds.get(event.fileUri) === event.id ? 'current' : 'history';

		if (status === event.status) {
			return event;
		}

		changed = true;

		return { ...event, status };
	});

	return changed ? derived : events;
}

/** Normaliza o caminho relativo: separador '/' e sem o prefixo './'. */
function normalizeFileUri(fileUri: string): string {
	return fileUri.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
```

### 4.3 `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts` (alterar)

Uma linha de registro, junto das outras duas do módulo, e os imports
correspondentes:

```ts
// A timeline é o modelo de leitura do ledger: consultas e aviso de mudança.
registerSingleton(ITimelineService, TimelineService, InstantiationType.Delayed);
```

Nada mais neste arquivo: a contribuição que liga a observação continua igual.

### 4.4 Ajuste obrigatório na infraestrutura de teste (3 arquivos, 1 linha cada)

O `ChangeLedgerService` passa a ser um `Disposable` (por causa do `Emitter`), e a
suíte rastreia todo `Disposable` criado: sem registrá-lo, o teardown acusa
vazamento. Os três arquivos que constroem o serviço passam a registrá-lo no
store da suíte:

| Arquivo | Linha de hoje | Fica |
| --- | --- | --- |
| `test/common/changeLedgerService.test.ts` | `return new ChangeLedgerService(fileService, environmentService(), workspaceContextService(workspaceId));` | `return disposables.add(new ChangeLedgerService(...));` |
| `test/common/changeRecorderService.test.ts` | `ledger = new ChangeLedgerService(fileService, environmentService, workspaceContextService);` | `ledger = disposables.add(new ChangeLedgerService(...));` |
| `test/common/workspaceWatcherService.test.ts` | `ledger = new ChangeLedgerService(fileService, environmentService, workspaceContextService);` | `ledger = disposables.add(new ChangeLedgerService(...));` |

É adaptação forçada pela mudança de produção, **não** teste novo de validação:
nenhuma asserção é criada, removida ou afrouxada.

## 5. Casos de borda e tratamento de erro

| Caso | Comportamento esperado |
| --- | --- |
| Nenhum evento gravado | `getEvents()` devolve `[]`; `getEventsForFile` devolve `[]`; nada lança |
| Arquivo sem histórico | `getEventsForFile` devolve `[]` |
| Id inexistente | `getEvent` devolve `undefined` |
| Caminho com separador `\` ou prefixo `./` | Mesmo resultado do caminho normalizado |
| Caminho com maiúsculas diferentes | Outro arquivo: lista vazia (a comparação é exata fora a normalização) |
| Falha de leitura na primeira consulta | A consulta rejeita; a próxima tentativa recarrega do zero |
| Gravação entre o início e o fim da carga | O evento aparece **uma** vez na lista |
| Gravação com timestamp anterior ao último da lista | A lista continua em ordem crescente |
| Segundo evento do mesmo arquivo | O primeiro passa a `history` na resposta seguinte, e o aviso traz `demotedEventId` |
| Dois `current` gravados para o mesmo arquivo | A derivação entrega um só `current` |
| Remoção (evento sem `afterHash`) | É tratada como qualquer evento: se for o último do arquivo, é o `current` |

## 6. Plano de testes

### 6.1 Unidade — `src/vs/platform/changeLedger/test/common/timelineService.test.ts` (novo)

Suíte no padrão do módulo: `FileService` real sobre `InMemoryFileSystemProvider`
com armazenamento isolado por teste, `ChangeLedgerService` real como fonte e
`ensureNoDisposablesAreLeakedInTestSuite` como rastreador. Usar o ledger real (e
não um dublê) é o que prova o caminho inteiro: gravar → avisar → consultar.

| # | Teste | O que prova |
| --- | --- | --- |
| T1 | Eventos gravados antes da consulta aparecem em ordem cronológica | Carga e ordem |
| T2 | O último evento de cada arquivo é `current` e os anteriores são `history` | Derivação |
| T3 | Arquivos diferentes têm, cada um, o seu `current` | Derivação por arquivo |
| T4 | Dois `current` gravados no mesmo arquivo respondem com um só | Derivação vence o status gravado |
| T5 | `getEventsForFile` devolve só o arquivo pedido, em ordem | Filtro |
| T6 | `getEventsForFile` de arquivo sem histórico devolve `[]` | Filtro vazio |
| T7 | `getEvent` devolve o evento e `undefined` para id inexistente | Busca |
| T8 | Gravar avisa uma vez, com `added` e `demotedEventId` no segundo evento do arquivo | Aviso |
| T9 | A consulta seguinte ao aviso já traz o evento novo | Lista em memória |
| T10 | Gravação durante a carga entra na lista uma vez só | Corrida da carga |
| T11 | A consulta não relê o disco depois da carga | Carga única |
| T12 | Falha na leitura rejeita e a consulta seguinte tenta de novo | Erro |
| T13 | Workspace sem evento nenhum devolve `[]` sem lançar | Estado vazio |

Notas de implementação para o Tester:

- **T4** precisa de um `current` gravado à mão: escrever o JSON de um evento
  direto em `eventResource(layout, id)`, com `createLedgerStorageLayout` montando
  o caminho — é o que simula o ledger que ficou com dois atuais.
- **T10** e **T12** precisam de controle sobre o tempo da leitura. Sugestão: um
  dublê que **delega** ao ledger real e segura o `readAll()` em uma promessa que
  o teste resolve quando quiser (`IChangeLedgerService` é implementado por
  delegação, sem `any`).
- **T11**: gravar um evento e conferir que a lista em memória já o mostra; a
  prova de que não houve releitura é o `readAll` do dublê contar as chamadas.

### 6.2 Testes existentes

Os 98 testes do módulo continuam passando, sem alteração de asserção — só o
registro do `Disposable` do §4.4.

### 6.3 Nível de integração e manual

- **Sem teste ponta a ponta nesta tarefa.** O arnês (`docs/watch-code/e2e`) prova
  o que chega ao disco pelo app; a timeline é consulta em memória sobre esse
  mesmo ledger, e o caminho "gravar → avisar → consultar" é coberto em unidade
  com o ledger real.
- **Sem teste manual nesta tarefa.** Não há superfície de interface: a view é a
  E2-T2, e é lá que o teste manual entra.

### 6.4 Comandos de validação

```
npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"
npm run compile-client
npx eslint src/vs/platform/changeLedger/common/timelineService.ts src/vs/platform/changeLedger/common/changeLedgerService.ts src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts
node --experimental-strip-types build/hygiene.ts
```

(o `hygiene` lê o **índice do git**: os arquivos precisam estar `git add`ed antes.)

## 7. Divergências do plano

Duas, ambas em decisões técnicas (**T4** e **T5** do plano), que o próprio plano
classifica como locais, reversíveis e sem necessidade de aprovação. Ficam
registradas porque o plano manda registrar.

| # | Plano | Especificação | Por quê |
| --- | --- | --- | --- |
| 1 | T5: `onDidChange` carrega "o evento acrescentado e o rebaixado" | carrega `added: ChangeEvent` e `demotedEventId?: string` | O evento rebaixado **não está disponível** quando o aviso sai com a lista ainda não carregada (só o id vem do ledger). O id é sempre conhecido e basta para quem já tem a lista — que é o caso do consumidor. |
| 2 | T4: comparação sem diferenciar maiúsculas de minúsculas no Windows | comparação exata, normalizando só separador e `./` | Casamento por maiúsculas exige saber a plataforma e, em disco sensível a maiúsculas, devolveria o histórico do arquivo errado. Quem chama usa o caminho que veio do próprio evento. |

Nada nas quatro decisões aprovadas (D1 a D4) muda.

## 8. Critérios de aceite verificáveis

| # | Critério | Como verificar |
| --- | --- | --- |
| 1 | Consulta completa em ordem crescente | T1 |
| 2 | `current` é o último de cada arquivo; o resto é `history` | T2, T3 |
| 3 | A derivação vence o status gravado | T4 |
| 4 | Filtro por arquivo, com vazio para arquivo sem histórico | T5, T6 |
| 5 | Busca por id, com `undefined` para id inexistente | T7 |
| 6 | Toda gravação avisa uma vez, com o rebaixado quando houver | T8 |
| 7 | A consulta seguinte ao aviso já vê o evento, sem reler o disco | T9, T11 |
| 8 | Gravação durante a carga não se perde nem duplica | T10 |
| 9 | Falha de leitura rejeita e a próxima consulta tenta de novo | T12 |
| 10 | Workspace sem histórico devolve lista vazia | T13 |
| 11 | A suíte do módulo passa (98 testes de hoje + os novos) | `npm run test-node -- --runGlob "**/changeLedger/test/common/*.test.js"` |
| 12 | Compila, sem aviso de lint e dentro da higiene | `compile-client`, `eslint`, `hygiene` |
| 13 | Nenhum arquivo fora do escopo é tocado | `git status --porcelain` limitado a `platform/changeLedger`, `workbench/services/changeLedger` e `docs/watch-code` |
| 14 | Os eventos já gravados continuam legíveis | nenhuma mudança em `ChangeEvent`, no índice ou no store |

## 9. Decisões pendentes

Nenhuma. As quatro decisões do plano foram aprovadas pelo usuário (D1 a D4 = A) e
as duas divergências do §7 são ajustes técnicos dentro de decisões já marcadas
como reversíveis no plano.

