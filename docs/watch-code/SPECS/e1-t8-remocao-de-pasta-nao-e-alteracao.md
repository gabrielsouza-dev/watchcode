# Especificação — E1-T8 · Remoção de pasta não é alteração

| Campo | Valor |
| --- | --- |
| Tarefa | E1-T8 — Remoção de pasta não é alteração |
| Workflow | High (planos: PlanWriter → SpecWriter → Developer → Tester → Reporter) |
| Etapa | SpecWriter (2 de 5) |
| Entrada | `docs/watch-code/PLANS/e1-t8-remocao-de-pasta-nao-e-alteracao.md` |
| Saída | Este arquivo → Developer |

## 1. Referência

- **Plano:** [`docs/watch-code/PLANS/e1-t8-remocao-de-pasta-nao-e-alteracao.md`](../PLANS/e1-t8-remocao-de-pasta-nao-e-alteracao.md)
- **Backlog:** `docs/watch-code/Workflow/overview.md` §6, linha **E1-T8** (depende da E1-T7, concluída)
- **Origem:** a medição do D2 da E1-T7, no cenário T-0011 do arnês

### Decisões aprovadas pelo usuário (11/09/2026)

| Decisão | Escolha | O que significa |
| --- | --- | --- |
| **D1** | **C** | Memória do que a observação já provou ser pasta **e**, quando ela não sabe, o tipo do caminho no `HEAD` do git. Sem prova nenhuma, a remoção é gravada como sempre foi |
| **D2** | **A** | O `show` do serviço de git passa a pedir só `blob`: pasta nunca mais devolve a listagem da árvore como se fosse conteúdo |
| **D3** | **A** | A fase 3 do T-0011 vira **conferência que reprova**; uma fase nova prova o caminho do git e outra **mede** o resíduo que a tarefa não corrige |

### Evidência que originou a tarefa

Saída real do T-0011 na E1-T7 (registrada em `docs/watch-code/testes-manuais.md`):

```text
medicao (nao reprova): a pasta removida vira evento? — pasta=1 arquivo=1
```

A pasta deixou de virar **erro** na E1-T7, mas a remoção dela continua virando **evento**.

### Evidência da segunda face do defeito (D2)

Conferido neste repositório:

```text
$ git show HEAD:src/vs/platform/changeLedger
tree HEAD:src/vs/platform/changeLedger

common/
test/
$ echo $LASTEXITCODE
0
```

Para um caminho de **pasta rastreada**, `git show` responde com a listagem da árvore e
código 0 — e `GitHeadReader.readFromHead` devolve isso como se fosse conteúdo
(`gitHeadReader.ts:41-43`). Ou seja: além de virar evento, a remoção de uma pasta
rastreada poderia nascer com um "antes" falso.

### Evidência de que a troca do `show` é segura

`git show HEAD:<arquivo>` e `git cat-file blob HEAD:<arquivo>` produzem **os mesmos bytes**:

```text
$ git rev-parse HEAD:src/vs/platform/changeLedger/common/baseline.ts
bb9549742e01bfb85dc16674e1bc64cce5e8643f
$ git show HEAD:.../baseline.ts | git hash-object --stdin
bb9549742e01bfb85dc16674e1bc64cce5e8643f
$ git cat-file blob HEAD:.../baseline.ts | git hash-object --stdin
bb9549742e01bfb85dc16674e1bc64cce5e8643f
```

Nenhum `beforeHash` já gravado muda de valor por causa do D2.

## 2. Comportamento esperado

| Entrada observada | Prova de que é pasta | Resultado |
| --- | --- | --- |
| Pasta **criada** (E1-T7) | a leitura recusa com `FILE_IS_DIRECTORY` | `undefined`; nada gravado; a prova fica guardada |
| Pasta **apagada**, criada durante a observação | memória | `undefined`; nada gravado |
| Pasta **apagada**, que tem ou teve arquivo lido dentro | memória (ancestral de arquivo lido) | `undefined`; nada gravado |
| Pasta **apagada**, que já existia e está no `HEAD` | git responde `tree` | `undefined`; nada gravado; a prova fica guardada |
| Arquivo **apagado**, rastreado ou já visto | git responde `blob` / a memória não o marca pasta | evento gravado, sem "depois", com o "antes" de sempre |
| Arquivo **apagado**, nunca visto e fora do git | nenhuma (git responde ausência) | evento gravado, como hoje |
| Arquivo apagado **junto com a pasta que o continha** | — | nenhum evento: o watcher do core colapsa os `DELETED` dos filhos quando a pasta some (`coalesceEvents`, `files/common/watcher.ts:438`) e o evento nunca chega ao produto. Limitação da plataforma, medida no T-0011 (fase 3 e fase 4) e registrada na E1-T9 |
| Arquivo **gravado**, cujo caminho já foi pasta | — (a leitura é prova de arquivo) | evento gravado; a marca de pasta do caminho é apagada |
| Pasta vazia que já existia, sem git e nunca lida | nenhuma | evento gravado — **resíduo conhecido**, medido no arnês e registrado no guia |

Em uma frase: **a remoção só deixa de virar evento quando existe prova de que o que sumiu
era pasta; sem prova, grava como sempre gravou.**

## 3. Contratos

### 3.1 `IChangeRecorderService` — o significado do `undefined` cresce

A assinatura **não muda** (`recordChange(change): Promise<ChangeEvent | undefined>`); o que
muda é o que o `undefined` documenta. O contrato passa a valer para os dois lados da
observação:

```ts
	/**
	 * Devolve `undefined` quando o caminho observado não é um arquivo: o watcher
	 * avisa quando uma pasta nasce dentro do workspace, e uma pasta não tem o que
	 * registrar. Nada é gravado, e quem chamou não tem evento nenhum em mãos.
	 *
	 * Vale também quando a pasta **some**: numa remoção não há o que ler, então o
	 * tipo do caminho vem do que a observação já provou ser pasta e, quando ela
	 * não sabe, do tipo do caminho no `HEAD` do repositório. Sem prova nenhuma a
	 * remoção é gravada como sempre foi — um arquivo não pode ser engolido por
	 * falta de informação.
	 */
	recordChange(change: IObservedChange): Promise<ChangeEvent | undefined>;
```

### 3.2 Novo leitor injetado no recorder

Mesmo desenho do leitor do "antes" (`WorkspaceHeadReader`): tipo exportado, valor padrão
sem git, injeção pelo adaptador do workbench.

```ts
/** O que um caminho era no `HEAD`, quando o disco já não pode responder. */
export type WorkspacePathKind = 'file' | 'directory' | 'unknown';

/**
 * Lê o tipo de um caminho no `HEAD` do repositório do workspace.
 *
 * Injetado pelo mesmo motivo do leitor do "antes": o serviço de git roda em outro
 * processo. Numa remoção o disco não tem mais o caminho para consultar, e é esta
 * a resposta que decide se o que sumiu era arquivo ou pasta.
 */
export type WorkspacePathKindReader = (fileUri: string) => Promise<WorkspacePathKind>;

/** Sem leitor de git: todo caminho removido é desconhecido e continua sendo gravado. */
const noPathKindReader: WorkspacePathKindReader = () => Promise.resolve('unknown');
```

Construtor do `ChangeRecorderService`:

```ts
	constructor(
		@IChangeLedgerService private readonly ledger: IChangeLedgerService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		readFromHead: WorkspaceHeadReader = noHeadReader,
		readPathKind: WorkspacePathKindReader = noPathKindReader
	) { ... }
```

### 3.3 `ILocalGitService` — um método novo e um endurecido

`src/vs/platform/git/common/localGitService.ts`:

```ts
/** Tipo do objeto de um caminho no `HEAD`, na linguagem do git. */
export type HeadObjectType = 'blob' | 'tree';

	/**
	 * Tipo do objeto em `HEAD:<filePath>`.
	 *
	 * `undefined` quando não há esse caminho no `HEAD` — repositório sem commits,
	 * arquivo novo, caminho inválido — ou quando o objeto não é arquivo nem pasta.
	 * Pergunta sem resposta não é erro para quem pergunta.
	 */
	catFileType(repoPath: string, filePath: string): Promise<HeadObjectType | undefined>;
```

`show` **mantém a assinatura** (`Promise<string | undefined>`) e passa a pedir `blob` em vez
de `show`; para caminho de pasta ele passa a responder `undefined` (o git falha, e o
`catch` que já existe devolve a ausência).

### 3.4 O que **não** muda

| Contrato | Por quê |
| --- | --- |
| `recordChange` (assinatura) e `IObservedChange` | a mudança é de significado, não de forma |
| `show(repoPath, filePath)` (assinatura) | só o comando por dentro; conteúdo idêntico, conferido por hash |
| Demais métodos de `ILocalGitService` | nada a ver com o tipo do caminho |
| O watcher e `SessionGrouper` | o `undefined` já é "nada a registrar" desde a E1-T7 |
| O ledger, os snapshots e a sombra | a tarefa evita que o evento nasça; não mexe no que já está gravado |

## 4. Alterações necessárias

### 4.1 `src/vs/platform/changeLedger/common/changeRecorderService.ts`

**Import novo:** `import { dirname, isEqualOrParent } from '../../../base/common/resources.js';`

**Tipos novos e valor padrão:** exatamente os da §3.2, dentro do mesmo arquivo, logo depois
do `WorkspaceHeadReader` e do `noHeadReader`.

**Campo novo**, ao lado de `lastEvents` e `recording`:

```ts
	/**
	 * Caminhos provados pasta nesta observação.
	 *
	 * A remoção não pode ler o disco: quando a pasta some, é daqui que sai a prova
	 * que a leitura daria. A marca nasce da leitura recusada (a pasta que chega) e
	 * dos ancestrais de todo arquivo lido, e morre quando um arquivo é lido no
	 * mesmo caminho — o que também a impede de crescer sem limite num caminho só.
	 */
	private readonly folders = new Set<string>();
```

**`record()`** — três acréscimos, nesta ordem:

```ts
	private async record(resource: URI, change: IObservedChange): Promise<ChangeEvent | undefined> {
		const key = resource.toString();
		// Numa remoção não há o que ler: o evento registra que o arquivo saiu.
		const content = change.kind === 'deleted' ? undefined : await this.readFile(resource);

		// Sem conteúdo e sem remoção, o caminho não é um arquivo: pasta não é
		// alteração e não tem o que gravar. A saída é antes de tocar no ledger.
		if (change.kind !== 'deleted' && !content) {
			// A leitura recusada é a prova de que o caminho é pasta, e é a única
			// prova que a remoção não tem como obter: fica guardada.
			this.folders.add(key);

			return undefined;
		}

		// Numa remoção o tipo do caminho não está no disco nem no evento: sem prova
		// de que era arquivo, o que sumiu pode muito bem ser uma pasta.
		if (change.kind === 'deleted' && await this.isFolder(resource, change.fileUri)) {
			return undefined;
		}

		if (content) {
			// Ler o arquivo é prova de que ele é arquivo — e de que tudo acima dele é
			// pasta. A marca de pasta do caminho cai: ele deixou de ser pasta.
			this.folders.delete(key);
			this.rememberFoldersAbove(resource, change.folderUri);
		}

		const afterHash = content ? await this.ledger.recordSnapshot(content) : undefined;
		// ... o resto do método continua exatamente como está hoje
	}
```

**Dois métodos novos**, junto de `readFile` e `resolveResource`:

```ts
	/**
	 * O caminho removido era pasta?
	 *
	 * Duas provas, nesta ordem: o que a observação já viu — a leitura que se recusou
	 * e os ancestrais de todo arquivo lido — e, quando ela não sabe, o próprio git,
	 * que ainda tem o caminho no `HEAD`. Sem prova nenhuma a resposta é "não", e a
	 * remoção é gravada como sempre foi.
	 */
	private async isFolder(resource: URI, fileUri: string): Promise<boolean> {
		const key = resource.toString();

		if (this.folders.has(key)) {
			return true;
		}

		if (await this.readPathKind(fileUri) !== 'directory') {
			return false;
		}

		// A resposta do git vale para as próximas entregas da mesma remoção.
		this.folders.add(key);

		return true;
	}

	/**
	 * Marca como pasta tudo o que está acima de um arquivo lido.
	 *
	 * Um arquivo dentro de uma pasta prova que ela é pasta, e é essa prova que a
	 * remoção da pasta vai precisar depois. A caminhada para na pasta do workspace:
	 * acima dela o produto não observa nada.
	 */
	private rememberFoldersAbove(resource: URI, folderUri: URI | undefined): void {
		const folder = folderUri ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;

		if (!folder) {
			return;
		}

		for (let parent = dirname(resource); isEqualOrParent(parent, folder); parent = dirname(parent)) {
			this.folders.add(parent.toString());
		}
	}
```

O JSDoc da interface (`IChangeRecorderService.recordChange`) recebe o parágrafo da §3.1.

### 4.2 `src/vs/platform/git/common/localGitService.ts`

Acrescentar o tipo `HeadObjectType` e o método `catFileType` na interface, conforme a §3.3,
com o JSDoc de lá.

### 4.3 `src/vs/platform/git/node/localGitService.ts`

`show` troca o comando e ganha o comentário do porquê; `catFileType` entra logo depois:

```ts
	async show(repoPath: string, filePath: string): Promise<string | undefined> {
		try {
			// `cat-file blob`, e não `show`: para um caminho de pasta o `show` responde
			// com a listagem da árvore e código 0, e uma pasta não tem conteúdo de
			// arquivo nenhum. Para arquivo os dois devolvem os mesmos bytes.
			return await this._exec(generateUuid(), ['cat-file', 'blob', `HEAD:${filePath}`], repoPath);
		} catch {
			// Sem versão anterior — arquivo novo, repositório sem commits ou caminho
			// inválido — a ausência de baseline não é um erro para quem pergunta.
			return undefined;
		}
	}

	async catFileType(repoPath: string, filePath: string): Promise<HeadObjectType | undefined> {
		try {
			const type = (await this._exec(generateUuid(), ['cat-file', '-t', `HEAD:${filePath}`], repoPath)).trim();

			return type === 'blob' || type === 'tree' ? type : undefined;
		} catch {
			// Caminho que não está no `HEAD` não tem tipo: a resposta é a ausência.
			return undefined;
		}
	}
```

O import do tipo vem do arquivo comum (`HeadObjectType`).

### 4.4 `src/vs/workbench/services/changeLedger/electron-browser/gitHeadReader.ts`

Um membro novo, no mesmo desenho do `read`, e o método privado que traduz a linguagem do
git para a do produto:

```ts
	/** Leitor do tipo do caminho pronto para ser injetado no recorder. */
	readonly readKind: WorkspacePathKindReader = async fileUri => this.readKindFromHead(fileUri);

	/** O tipo do caminho no `HEAD`: é o que responde quando a pasta já não está no disco. */
	private async readKindFromHead(fileUri: string): Promise<WorkspacePathKind> {
		const rootPath = await this.resolveRootPath();

		if (!rootPath) {
			return 'unknown';
		}

		const type = await this.localGitService.catFileType(rootPath, fileUri.replace(/\\/g, '/'));

		if (type === 'tree') {
			return 'directory';
		}

		return type === 'blob' ? 'file' : 'unknown';
	}
```

O import de `WorkspacePathKind`/`WorkspacePathKindReader` entra na linha que já importa
`WorkspaceHeadReader`.

### 4.5 `src/vs/workbench/services/changeLedger/electron-browser/changeLedgerService.ts`

O adaptador passa os dois leitores; para isso o `GitHeadReader` é construído uma vez, numa
constante local antes do `super`:

```ts
		const reader = new GitHeadReader(localGitService, workspaceContextService, logService);

		super(ledger, fileService, workspaceContextService, environmentService, reader.read, reader.readKind);
```

O comentário da classe ganha uma frase dizendo que o leitor do tipo sai do mesmo objeto,
pelo mesmo motivo (a resolução dos serviços não pode morar no `SyncDescriptor`).

### 4.6 `src/vs/platform/changeLedger/test/common/changeRecorderService.test.ts`

**`createRecorder`** passa a receber o segundo leitor e a repassar sempre os dois (valor
padrão do construtor cobre o `undefined`):

```ts
	function createRecorder(readFromHead?: WorkspaceHeadReader, readPathKind?: WorkspacePathKindReader): IChangeRecorderService {
		...
		return new ChangeRecorderService(ledger, fileService, workspaceContextService, environmentService, readFromHead, readPathKind);
	}
```

**Seis testes novos**, dentro do mesmo `suite`, perto dos testes de pasta e de remoção que já
existem (linhas 176-210 e 284-337):

1. `'a pasta removida não vira evento'` — cria a pasta, registra a criação (devolve
   `undefined`), apaga com `fileService.del(resource(pasta), { recursive: true })`, registra a
   remoção: `{ criacao: undefined, remocao: undefined, eventos: 0 }`.
2. `'a pasta com arquivo dentro não precisa do git para ser reconhecida'` — um leitor de tipo
   que conta as chamadas e responde `'unknown'`; escreve `pasta/regra.ts`, registra, apaga a
   pasta e registra a remoção: `{ remocao: undefined, consultas: 0 }`.
3. `'o git reconhece a pasta que já existia'` — leitor que responde `'directory'` e guarda os
   caminhos consultados; remoção de `'pasta-antiga'`: `{ remocao: undefined, consultados:
   ['pasta-antiga'] }`.
4. `'o git dizendo arquivo mantém a remoção'` — leitor que responde `'file'`; a remoção vira
   evento com `afterHash === undefined`.
5. `'sem prova nenhuma a remoção continua sendo gravada'` — leitor que responde `'unknown'`;
   a remoção de um caminho nunca visto vira evento (mesma expectativa do teste
   `'a remoção de um arquivo que nunca existiu não rejeita'`, agora com o leitor explícito).
6. `'o arquivo que nasce no lugar da pasta removida vira evento'` — pasta criada e registrada,
   pasta removida, arquivo escrito no mesmo caminho: o evento existe, com o `afterHash` do
   conteúdo novo, e o ledger tem **um** evento daquele caminho.

O total do módulo `changeLedger` vai de **128** para **135** (mais o teste do watcher em 4.7).

### 4.7 `src/vs/platform/changeLedger/test/common/workspaceWatcherService.test.ts`

Um teste novo, no mesmo desenho do `'a pasta nova não vira evento nem erro no log'`:

7. `'a pasta removida não vira evento nem erro no log'` — cria `src/modulo`, espera o evento da
   pasta não existir, escreve `src/modulo/regra.ts` (1 evento), apaga `src/modulo` inteira e
   espera: a pasta **não** ganha evento, o arquivo ganha o evento de remoção e
   `logs.errors` continua vazio.

### 4.8 `src/vs/platform/git/test/node/localGitService.test.ts`

Dois testes novos, no padrão do arquivo (que injeta um `execFile` falso com expectativas de
argumentos — nenhum repositório real):

1. `'show pede o conteúdo de um blob, e não a listagem de uma árvore'` — expectativa
   `{ args: ['cat-file', 'blob', 'HEAD:src/a.ts'], stdout: 'conteudo' }` e resultado
   `'conteudo'`; e um segundo caso com erro do git devolvendo `undefined`.
2. `'catFileType responde o tipo do caminho no HEAD'` — três expectativas
   (`-t HEAD:src/a.ts` → `'blob'`, `-t HEAD:src` → `'tree'`, `-t HEAD:sumiu.ts` → erro do git):
   `'blob'`, `'tree'`, `undefined`.

### 4.9 `docs/watch-code/e2e/run-manual-tests.ts` — o cenário T-0011

**Constantes novas**, junto de `FOLDER_ONLY`/`FOLDER_FILE`:

```ts
/** Pasta que já existia quando a observação começou, rastreada pelo git. */
const FOLDER_TRACKED = 'src/legado';
const FOLDER_TRACKED_FILE = 'src/legado/antigo.ts';

/** Pasta que já existia, vazia e fora do git: o resíduo que esta tarefa não corrige. */
const FOLDER_EMPTY = 'src/vazio';
```

**`prepare`** no cenário (roda antes de o app abrir, como manda `IManualTest`):

```ts
	prepare: workspace => {
		// A pasta rastreada chega commitada: quando ela for apagada, é o git que vai
		// responder o tipo dela, porque a observação nunca chegou a lê-la.
		commitWorkspace(workspace, [[FOLDER_TRACKED_FILE, longContent('ts', false, 1, FOLDER_FILE_TOTAL)]]);

		// Uma pasta vazia não existe para o git: é ela o resíduo medido na fase 5.
		mkdirSync(join(workspace, FOLDER_EMPTY), { recursive: true });
	},
```

**Fase 3** deixa de ser medição e passa a reprovar (D3):

- `'fase 3: a pasta removida nao vira evento'` — `0` eventos com `fileUri === FOLDER_ONLY`;
- `'medicao (nao reprova): fase 3, o arquivo de dentro vira evento de remocao?'` — imprime
  `eventsOf(FOLDER_FILE)`. Ver a **divergência 4** na §8: o watcher do core não entrega o
  `DELETED` dos filhos de uma pasta apagada, então a promessa de que o arquivo ganharia um
  evento de remoção **não** se sustenta.

**Fase 4** (prova do git): apaga `src/legado` inteira e confere

- `'fase 4: a pasta rastreada pelo git nao vira evento'` — `0` eventos com
  `fileUri === FOLDER_TRACKED`. É esta conferência que prova a metade do git do D1: a
  observação nunca leu `src/legado`, então só a resposta `tree` do `HEAD` explica o `0`
  (a pasta vazia da fase 5, sem prova nenhuma, vira evento);
- `'medicao (nao reprova): fase 4, o arquivo de dentro vira evento de remocao?'` — imprime
  `eventsOf(FOLDER_TRACKED_FILE)`, pela mesma razão da fase 3.

**Fase 5** (medição do resíduo, nunca reprova): apaga `src/vazio` e imprime quantos eventos
ela virou — `'medicao (nao reprova): a pasta vazia que ja existia vira evento?'`, detalhe
`'pasta vazia=' + n`. O comentário da fase registra por que a correção não vem nesta tarefa
(a prova dependeria de varrer o workspace ao ligar a observação, decisão recusada na E1-T5).

A fase 2 continua como está, inclusive `'fase 2: a pasta nao aparece na linha do tempo'`.

### 4.10 Documentação

| Arquivo | O que muda |
| --- | --- |
| `docs/watch-code/testes-manuais.md` | O T-0011 ganha **uma execução nova** com a saída real das cinco fases e a situação; a execução da E1-T7 fica onde está (o arquivo é acumulativo) |
| `docs/watch-code/Workflow/overview.md` | Linha da E1-T8 → `feito`, com o total do módulo (`changeLedger` 128 → 135) e o resíduo medido na fase 5 registrado como limitação conhecida; o parágrafo **"Aberto na E1"** é reescrito |
| `docs/watch-code/e2e/README.md` | Linha do T-0011 na tabela de cenários: as cinco fases e o que cada uma prova |
| `docs/watch-code/Workflow/tasks.md` | Nada muda: a tarefa já está listada como E1-T8 |

O resíduo **não** vira tarefa nova: não há correção conhecida que não contrarie a decisão da
E1-T5, e o que existe é a ausência de prova sobre um caminho que já não está no disco. Ele
fica registrado com o número medido.

## 5. Casos de borda e tratamento de erro

| # | Caso | Comportamento |
| --- | --- | --- |
| B1 | A mesma remoção chega em duas entregas | A marca de pasta **não** é apagada ao ser usada: a segunda entrega também devolve `undefined`, e nada entra no ledger |
| B2 | A pasta é removida e um arquivo nasce no mesmo caminho | A leitura do arquivo é prova de arquivo e apaga a marca; a remoção seguinte desse arquivo é gravada |
| B3 | Arquivo removido, nunca visto, fora do git | O git responde ausência (`unknown`) e o evento é gravado — comportamento de hoje, coberto pelo teste da linha 327 |
| B4 | Workspace sem repositório, ou repositório sem commits | `resolveRootPath` devolve `undefined` → `unknown` → nada muda em relação a hoje |
| B5 | O caminho é um submódulo (objeto `commit` no `HEAD`) | `catFileType` só reconhece `blob` e `tree` → `undefined` → `unknown` → a remoção é gravada. Limitação conhecida, registrada |
| B6 | O git falha (binário ausente, processo morto) | `catFileType` engole o erro e responde `undefined`; a observação **nunca** depende do git |
| B7 | Workspace com mais de uma pasta | O caminho relativo passado ao git é o da pasta do evento, e o git resolve contra a raiz do repositório da primeira pasta — o mesmo pressuposto do `GitHeadReader` desde a E1-T3. Quando não casar, o git responde ausência e a remoção é gravada |
| B8 | O caminho observado está fora das pastas do workspace (URI avulso) | `rememberFoldersAbove` não marca nada: `isEqualOrParent` é falso já na primeira condição do laço |
| B9 | A pasta é apagada enquanto a observação está desligada e um arquivo nasce ali depois | A marca antiga sobrevive e a remoção desse arquivo pode ser ignorada. É o mesmo caso que o produto já perde ao não registrar nada com a observação desligada (E1-T5); a marca só nasce de prova e se corrige sozinha quando o caminho é lido |
| B10 | O git registra um erro no próprio log quando o caminho não está no `HEAD` | Comportamento que já existe no `show` de hoje (a consulta sem resposta falha antes de ser engolida). A varredura transversal do arnês exige o prefixo `[watchCode]` e não é afetada |

## 6. Plano de testes

### 6.1 Unidade — módulo `changeLedger`

Os sete testes dos itens 4.6 e 4.7. Guardas que **não podem** ficar vermelhas:

- `'a pasta não é arquivo e não vira evento'` e `'a pasta não atrapalha o arquivo que nasce no
  mesmo caminho'` (E1-T7);
- `'a remoção repetida não vira um segundo evento'`;
- `'a remoção é gravada sem "depois", usando a última sombra como "antes"'`;
- `'a remoção de um arquivo que nunca existiu não rejeita'` (linha 327 — é ela que garante
  que o produto não perde a remoção sem prova);
- `'duas entregas simultâneas da mesma escrita não viram dois eventos'` e
  `'o mesmo caminho em pastas diferentes não é confundido'`.

### 6.2 Unidade — módulo `git`

Os dois testes do item 4.8. Antes de mexer no `show`, rodar a suíte do módulo e confirmar que
ela já estava verde; se não estiver, registrar a divergência antes de continuar.

### 6.3 Arnês — aplicativo de verdade

A execução inteira (`node --experimental-strip-types docs/watch-code/e2e/run-manual-tests.ts`),
com atenção a:

- T-0011 com as cinco fases verdes: as conferências da fase 3 e da fase 4 (a pasta não vira
  evento em nenhuma das duas) e as três medições que informam (`arquivo` nas fases 3 e 4,
  `pasta vazia` na fase 5);
- a varredura transversal de log de todos os cenários (E1-T7) verde — a remoção de pasta não
  pode escrever erro nem aviso.

### 6.4 Verificações estáticas

`npm run transpile-client`, `npm run typecheck-client`, `npx eslint` nos arquivos tocados,
`npm run valid-layers-check` e `node --experimental-strip-types build/hygiene.ts`.

### 6.5 O que **não** é testado aqui

- O comportamento do produto com um repositório git real que tenha submódulo (B5).
- A varredura de pastas na abertura do workspace: não existe, por decisão da E1-T5.
- A limpeza do ledger já gravado com eventos de pasta: o ledger é append-only.

## 7. Critérios de aceite verificáveis

1. A remoção de uma pasta criada durante a observação resolve `undefined` e não grava nada.
2. A remoção de uma pasta que já existia e está no `HEAD` resolve `undefined` (prova do git).
3. A remoção de uma pasta com arquivo lido dentro resolve `undefined` **sem** consultar o git.
4. A remoção de um arquivo continua virando evento, com o "antes" de sempre.
5. A remoção de um arquivo nunca visto e fora do git continua virando evento.
6. Um arquivo que nasce no caminho de uma pasta removida vira evento, e a remoção dele depois
   também.
7. Nenhuma pasta gera snapshot, nem marca em `lastEvents`.
8. O watcher não escreve erro nem aviso ao ver uma pasta removida.
9. A suíte do `changeLedger` passa com **135** testes; a do `git` passa com os dois novos.
10. O T-0011 roda com as cinco fases: 3 e 4 verdes, 5 informando o número.
11. A varredura transversal do arnês continua verde em todos os cenários.
12. `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` sem erro.
13. `testes-manuais.md` com a execução nova do T-0011 registrada de verdade.
14. `overview.md` com a E1-T8 em `feito`, o total atualizado e o resíduo registrado.
15. Nenhum arquivo fora do escopo foi tocado.

## 8. Decisões pendentes e divergências

**Nenhuma decisão pendente.** As três decisões que precisavam do usuário (D1, D2 e D3) foram
aprovadas em 11/09/2026 e estão na §1.

### Divergências em relação ao plano

| # | No plano | O que a especificação faz | Por quê |
| --- | --- | --- | --- |
| 1 | "A memória é limpa quando a observação para" (tabela de riscos) | A memória **não** é limpa | O recorder não conhece o estado da observação; ligá-lo ao watcher inverteria a dependência (o watcher depende do recorder). A marca só nasce de prova e se corrige quando o caminho é lido; o crescimento fica para a E5-T3 (retenção), como o de `lastEvents` |
| 2 | "A fase 4 mede o resíduo: a pasta que já existia quando a observação começou" (D3) | A fase 4 **prova** o caso da pasta rastreada pelo git (conferência que reprova) e a **fase 5** mede o resíduo, que passou a ser a pasta vazia e fora do git | Com o D1 = C, a pasta que já existia **e está no git** deixou de ser resíduo: virou caso coberto, e é o que prova a metade do git |
| 3 | "O resíduo, se houver, vira registro" (critério 11 do plano) | O resíduo é registrado como **limitação conhecida** no guia, sem tarefa nova | Não há correção conhecida que não contrarie a decisão da E1-T5 (`start()` não varre o workspace); uma tarefa sem solução só criaria dívida de papel |
| 4 | §2 e §4.9: "arquivo apagado, rastreado ou já visto → evento gravado" — e as fases 3 e 4 do T-0011 confeririam o evento de remoção do arquivo de dentro da pasta | A execução real **reprovou** essas duas conferências e elas viraram medição; a promessa foi corrigida na §2 e o achado virou a **E1-T9** | O watcher do core **colapsa por desenho** os `DELETED` dos filhos quando a pasta que os continha é apagada (`EventCoalescer.coalesce()`, `src/vs/platform/files/common/watcher.ts:438-469`: *"This algorithm will remove all DELETE events up to the root folder that got deleted… we are not producing DELETE events for each file inside a folder that gets deleted"*). O evento nunca chega ao produto, então o recorder não tem o que gravar — não é defeito desta tarefa nem do caminho novo. Medido no T-0011: a pasta apagada com arquivo dentro produz **0** eventos de pasta e **0** eventos de arquivo |

### Achado do Tester: a remoção de uma pasta não deixa rastro nenhum

Antes da E1-T8 a pasta removida gerava um evento vazio (sem "antes" e sem "depois"), que era
lixo — mas era um rastro de que algo tinha sido apagado ali. Depois da correção, uma pasta
apagada **com arquivos dentro** não gera evento nenhum: o watcher não entrega os filhos e a
pasta é reconhecida e ignorada. O produto sabe quais arquivos observou sob aquela pasta (o
próprio ledger guarda esses eventos), então há caminho para recuperar o rastro — é o que a
**E1-T9** vai decidir e implementar. Não foi corrigido aqui: muda o que a remoção de pasta
grava, e é decisão de contrato.
