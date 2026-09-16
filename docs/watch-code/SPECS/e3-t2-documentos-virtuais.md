# Especificação — E3-T2 · Documentos virtuais

**Plano:** `docs/watch-code/PLANS/e3-t2-documentos-virtuais.md`
**Workflow:** High · etapa SpecWriter (2 de 5)
**Próxima etapa:** Developer

## 1. Decisões

### 1.1 Herdadas do plano

| # | Decisão | Onde no plano |
| --- | --- | --- |
| D1 | O documento é endereçado pelo **hash do conteúdo**, não pelo id do evento | §7 |
| D2 | O caminho do URI é o do **arquivo real**, com o esquema trocado e a consulta acrescentada | §7 |
| D3 | **Dois** esquemas (`aih-before`, `aih-after`) servidos pelo **mesmo** provedor | §7 |
| D4 | Somente leitura nas duas camadas: capacidade `Readonly` e nenhuma capacidade de escrita | §7 |
| D5 | Leitura por **fluxo** (`readFileStream`), não bufferizada | §7 |
| D6 | Hash que não existe é `FileNotFound`, nunca conteúdo vazio | §7 |
| D7 | Provedor na plataforma, registro numa contribuição do workbench em `BlockStartup` | §7 |
| D8 | **Nenhuma superfície** nesta tarefa | §7 |
| D9 | `stat` devolve tamanho real e não inventa instante de modificação | §7 |
| D10 | Sem cache em memória: cada abertura lê o snapshot do disco | §7 |

### 1.2 Decisões locais desta etapa

| # | Decisão | Por quê |
| --- | --- | --- |
| L1 | Dois módulos novos em `platform/changeLedger/common/`: `changeDocument.ts` (puro) e `changeDocumentProvider.ts` (o provedor) | O contrato de URI é testável sem sistema de arquivos, e o provedor precisa do ledger — separá-los mantém o módulo puro puro, como em `changeDiff.ts` e `changeReveal.ts` |
| L2 | A consulta é **exatamente** `hash=<40 hex minúsculo>`; qualquer outra forma é documento inexistente | Contrato que o produto inventa agora: estrito é mais fácil de manter do que tolerante. Um hash de 39 caracteres ou em maiúsculas é erro de quem montou o URI, e não devolver conteúdo nenhum é a resposta honesta |
| L3 | O URI do documento é montado só com **caminho + consulta**: sem autoridade e sem fragmento do recurso de origem | O produto observa disco local e o ledger é do workspace; carregar a autoridade de um arquivo remoto faria o documento parecer de outro host. O fragmento (`#L42`) é posição no arquivo real, não no snapshot |
| L4 | `stat` devolve `type: File`, o `size` real do snapshot e `permissions: FilePermission.Readonly`; `ctime` e `mtime` são 0 | O tamanho é o do conteúdo guardado; a permissão é a mesma leitura que a capacidade já diz; instante de modificação não existe para conteúdo endereçado por hash |
| L5 | A mensagem de somente leitura é do produto, por `readOnlyMessage`, localizada | O serviço de arquivos mostra a mensagem ao recusar a edição; a dele fala de "arquivo somente leitura" e não diz **por quê**. "É um snapshot do que o agente escreveu" é a explicação certa |
| L6 | **Um** provedor registrado nos dois esquemas, na contribuição `workbench.contrib.watchCode.changeDocuments`, com o id exportado | Os dois esquemas servem os mesmos bytes; duas instâncias seriam duas verdades. O id exportado é o que o teste e o log usam para reconhecer a contribuição |
| L7 | O `FileNotFound` sai também do `stat`, e não só da leitura | O editor pergunta o `stat` primeiro (`fileService.ts:737-754`): falhar só na leitura faria o documento parecer existir e estar vazio |
| L8 | `mkdir`, `delete`, `rename` e `writeFile` lançam `NoPermissions`; `readdir` devolve vazio; `watch` devolve `Disposable.None`; os dois avisos são `Event.None` | Mesmo desenho do provedor somente leitura que já existe no core: nada aqui muda, então nada avisa mudança |

## 2. Comportamento esperado

| # | Situação | O que acontece |
| --- | --- | --- |
| 1 | `aih-before:/<arquivo>?hash=<hash do antes>` | O editor abre com o conteúdo **exato** do snapshot daquele hash |
| 2 | `aih-after:/<arquivo>?hash=<hash do depois>` | Idem, pelo hash do depois |
| 3 | Mesmo hash sob os dois esquemas | **Mesmo conteúdo**: o esquema diz o papel do lado, não o conteúdo. O "antes" de um evento pode ser o "depois" de outro |
| 4 | Hash bem formado que não está no store | Não abre: `FileNotFound` |
| 5 | Hash malformado (curto, maiúsculo, com caractere fora de `0-9a-f`) | Não abre: é o caso 4 |
| 6 | Consulta sem `hash`, com outro parâmetro ou com lixo junto | Não abre: é o caso 4 |
| 7 | O conteúdo do snapshot é servido inteiro, sem normalização | CRLF continua CRLF e a quebra final continua lá: o documento mostra o que o agente escreveu |
| 8 | O arquivo do workspace **não existe** mais no disco | O documento continua abrindo: ele é do snapshot, não do disco |
| 9 | O evento é parcial (arquivo novo, sem `beforeHash`) | `changeDocumentOf(evento, 'before', arquivo)` devolve `undefined` — não há documento de um lado que não existiu |
| 10 | O evento é uma remoção (sem `afterHash`) | Idem para o lado `after` |
| 11 | O documento é aberto num editor | Abre **somente leitura**, com a mensagem do produto |
| 12 | Alguém tenta gravar | O serviço de arquivos recusa: o provedor não tem capacidade de escrita. O provedor, se chamado direto, lança `NoPermissions` |
| 13 | Perguntam o conteúdo de um diretório do esquema | Lista vazia: o esquema só tem arquivos |
| 14 | Observam mudanças no esquema | Nenhum aviso é emitido: o conteúdo de um hash nunca muda |
| 15 | O mesmo documento é aberto duas vezes | Mesma aba: a identidade é esquema + caminho + hash |

## 3. Fatos conferidos

| Fato | Onde |
| --- | --- |
| Sem capacidade de escrita o serviço de arquivos nem chega ao provedor: `withWriteProvider` exige `FileReadWrite` ou `FileOpenReadWriteClose` | `platform/files/common/fileService.ts:159-177`, chamado por `writeFile` em `:381-383` |
| A leitura aceita `FileReadStream`, e o caminho preferido é o fluxo | `platform/files/common/fileService.ts:622-638` e `:678-685` |
| Antes de ler, o serviço resolve o `stat` e valida limites por ele | `platform/files/common/fileService.ts:737-754` |
| O `Readonly` do provedor é o que faz a interface tratar o recurso como somente leitura, com mensagem própria | `workbench/services/filesConfiguration/common/filesConfigurationService.ts:205-213` |
| O core já tem um provedor somente leitura desse tipo: escrita lançando `NoPermissions`, `readdir` vazio, `watch` sem nada, `stat` de arquivo | `workbench/contrib/chat/common/widget/chatResponseResourceFileSystemProvider.ts:69-214` |
| O desenho de URI com o caminho do arquivo real e a consulta carregando o que identifica o conteúdo é o do histórico local e o do git | `workbench/contrib/localHistory/browser/localHistoryFileSystemProvider.ts:39-62` |
| **Medido nesta etapa**, sobre o `URI` compilado: `URI.from({ scheme, path: URI.file(...).path, query: 'hash=' + h }).toString()` devolve `aih-before:/d%3A/Youtube/Dev/vscode/tmp/distante.ts?hash%3D…`, e a volta por `URI.parse` devolve `query = 'hash=…'` — o mesmo texto, sem perda | sonda própria sobre `out/vs/base/common/uri.js` |
| **Medido nesta etapa**: `URI.revive(JSON.parse(JSON.stringify(uri)))` preserva a consulta, que é o caminho da janela até o editor | sonda própria sobre `out/vs/base/common/uri.js` |
| O `--file-uri` da linha de comando aceita esquema próprio e o arquivo entra na **janela da pasta** | `platform/windows/electron-main/windowsMainService.ts:379-382`, `:965-977` e `:698`; `platform/environment/node/argv.ts:164` |
| No renderizador o documento é aberto pelo mesmo caminho de qualquer arquivo | `workbench/electron-browser/window.ts:215` e `:1030-1054` |
| As fases de contribuição: `BlockStartup` é a primeira, e `AfterRestored` só roda quando a janela fica ociosa | `workbench/common/contributions.ts:31-62` |
| Contribuição de workbench só existe se o módulo for importado em `workbench.common.main.ts` | `workbench/workbench.common.main.ts:478-483` (achado da E2-T7) |
| O evento carrega os dois hashes, e ambos são opcionais | `platform/changeLedger/common/changeEvent.ts:57-60` |
| O `readSnapshot` já valida o formato do hash antes de tocar o disco | `platform/changeLedger/common/snapshotStore.ts:48-61` e `snapshotHash.ts:14-28` |

## 4. Contratos

### 4.1 `changeLedger/common/changeDocument.ts` (novo)

```typescript
/** Lado da alteracao que um documento virtual mostra. */
export type ChangeDocumentSide = 'before' | 'after';

/** Esquema do documento com o conteudo de antes da alteracao. */
export const BEFORE_DOCUMENT_SCHEME = 'aih-before';

/** Esquema do documento com o conteudo de depois da alteracao. */
export const AFTER_DOCUMENT_SCHEME = 'aih-after';

/** Os dois esquemas, como o produto os registra. */
export const CHANGE_DOCUMENT_SCHEMES: readonly string[];

/** Nome do parametro da consulta que carrega o hash. */
export const CHANGE_DOCUMENT_HASH_PARAM = 'hash';

/** O que um recurso de documento pede: o lado e o hash do conteudo. */
export interface IChangeDocumentRequest {
	readonly side: ChangeDocumentSide;
	readonly contentHash: string;
}

/** Documento de um lado da alteracao, para o arquivo informado. */
export function changeDocumentResource(side: ChangeDocumentSide, file: URI, contentHash: string): URI;

/** O que o recurso pede, ou `undefined` quando nao e documento do produto. */
export function parseChangeDocument(resource: URI): IChangeDocumentRequest | undefined;

/** Documento de um evento, ou `undefined` quando aquele lado nao existe. */
export function changeDocumentOf(event: ChangeEvent, side: ChangeDocumentSide, file: URI): URI | undefined;
```

**Regras do contrato:**

1. O recurso é montado com o **caminho** do arquivo e a consulta `hash=<hash>`; autoridade e
   fragmento do recurso de origem não entram (L3).
2. `parseChangeDocument` devolve o pedido quando o esquema é um dos dois **e** a consulta é
   exatamente `hash=<40 hex minúsculo>`; fora disso, `undefined` (L2).
3. `changeDocumentOf` lê o hash do lado pedido (`beforeHash`/`afterHash`) e devolve `undefined`
   quando ele não existe — evento parcial ou remoção.
4. As três funções são puras e não lançam.

### 4.2 `changeLedger/common/changeDocumentProvider.ts` (novo)

```typescript
/**
 * Serve os snapshots do ledger como documentos somente leitura.
 *
 * O conteudo vem do hash que a consulta carrega; o caminho do recurso e
 * identidade, nunca conteudo.
 */
export class ChangeDocumentProvider extends Disposable implements IFileSystemProviderWithFileReadStreamCapability {

	readonly capabilities: FileSystemProviderCapabilities;   // Readonly | PathCaseSensitive | FileReadStream
	readonly readOnlyMessage: IMarkdownString;
	readonly onDidChangeCapabilities: Event<void>;                  // Event.None
	readonly onDidChangeFile: Event<readonly IFileChange[]>;        // Event.None

	constructor(@IChangeLedgerService ledger: IChangeLedgerService);

	stat(resource: URI): Promise<IStat>;
	readdir(resource: URI): Promise<[string, FileType][]>;
	readFileStream(resource: URI): ReadableStreamEvents<Uint8Array>;
	mkdir(resource: URI): Promise<void>;
	delete(resource: URI, opts: IFileDeleteOptions): Promise<void>;
	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void>;
	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void>;
	watch(resource: URI, opts: IWatchOptions): IDisposable;
}
```

**Regras do contrato:**

1. `capabilities` é `Readonly | PathCaseSensitive | FileReadStream` — e **nada** de
   `FileReadWrite`/`FileOpenReadWriteClose` (D4, D5).
2. Todo método resolve o pedido por `parseChangeDocument`; sem pedido, ou com hash fora do store,
   lança `createFileSystemProviderError(..., FileSystemProviderErrorCode.FileNotFound)` (D6, L7).
3. `readFileStream` devolve os bytes **crus** do snapshot, em um único pedaço, com o erro
   propagado ao fluxo quando o hash não existe.
4. `stat` devolve `{ type: FileType.File, ctime: 0, mtime: 0, size, permissions: FilePermission.Readonly }` (L4).
5. `readdir` devolve lista vazia; `watch` devolve `Disposable.None` (L8).
6. Escrita, pasta, remoção e renomeação lançam `NoPermissions` (L8) — mas o caminho normal nem
   chega aqui: o serviço de arquivos recusa antes, pela ausência de capacidade de escrita.

### 4.3 `workbench/contrib/watchCode/browser/changeDocuments.contribution.ts` (novo)

```typescript
/** Id da contribuicao que registra os documentos, exposto para o registro e para os testes. */
export const CHANGE_DOCUMENTS_ID = 'workbench.contrib.watchCode.changeDocuments';
```

Registra **uma** instância de `ChangeDocumentProvider` nos dois esquemas, com
`registerWorkbenchContribution2` na fase `WorkbenchPhase.BlockStartup` (D7, L6), e o módulo entra
na lista de imports de `workbench/workbench.common.main.ts`.

## 5. Alterações necessárias

| Arquivo | Ação |
| --- | --- |
| `src/vs/platform/changeLedger/common/changeDocument.ts` | **criar** — o contrato de URI do §4.1 |
| `src/vs/platform/changeLedger/common/changeDocumentProvider.ts` | **criar** — o provedor do §4.2 |
| `src/vs/workbench/contrib/watchCode/browser/changeDocuments.contribution.ts` | **criar** — o registro do §4.3 |
| `src/vs/workbench/workbench.common.main.ts` | acrescentar o import da contribuição, na lista do produto (`:478-483`) |
| `src/vs/platform/changeLedger/test/common/changeDocument.test.ts` | **criar** — os casos do §7.1 |
| `src/vs/platform/changeLedger/test/common/changeDocumentProvider.test.ts` | **criar** — os casos do §7.2 |
| `docs/watch-code/e2e/harness.ts` | `launchApp` passa a aceitar argumentos a mais, para a reabertura do T-0016 (§7.3) |
| `docs/watch-code/e2e/run-manual-tests.ts` | cenário `T-0016` e os ajudantes da reabertura (§7.3) |
| `docs/watch-code/e2e/README.md` | linha do T-0016 na tabela |
| `docs/watch-code/testes-manuais.md` | entrada do T-0016, com o resultado da execução |
| `docs/watch-code/Workflow/overview.md` | status da E3-T2 com os números medidos |

**Nenhum outro arquivo é tocado.** O ledger, o gravador, a timeline, o salto, as views e as
decorações ficam como estão: esta tarefa acrescenta uma leitura, não muda nenhuma existente.

## 6. Casos de borda e tratamento de erro

| # | Caso | Tratamento |
| --- | --- | --- |
| B1 | Consulta vazia (`aih-before:/x/y.ts`) | `parseChangeDocument` devolve `undefined`; o provedor lança `FileNotFound` |
| B2 | Hash com 39 caracteres, com maiúsculas ou com caractere fora de `0-9a-f` | Idem B1 |
| B3 | Consulta com dois parâmetros (`hash=…&outro=1`) | Idem B1: a consulta tem de ser exatamente o par esperado |
| B4 | Esquema do produto com hash válido, mas conteúdo fora do store | `FileNotFound` — `readSnapshot` devolve `undefined` |
| B5 | Snapshot **vazio** guardado sob um hash válido | Abre normalmente, com arquivo de tamanho 0: vazio guardado é conteúdo, e não ausência |
| B6 | Evento sem `beforeHash` (parcial) | `changeDocumentOf` devolve `undefined`; nenhum documento é montado |
| B7 | Evento de remoção (sem `afterHash`) | Idem B6, para o lado `after` |
| B8 | Caminho do recurso com espaço ou acento | O `URI` codifica; nada no provedor depende do caminho, então não há o que quebrar |
| B9 | Arquivo do workspace apagado depois do evento | O documento continua abrindo: o conteúdo vem do store |
| B10 | O mesmo hash pedido nos dois esquemas | Os dois abrem, com o mesmo conteúdo — e são documentos distintos para o editor, que é o que o diff precisa |
| B11 | Falha de leitura do disco no meio do fluxo | O erro é propagado ao fluxo e vira erro de leitura do arquivo, como em qualquer provedor |

## 7. Plano de testes

### 7.1 Unidade — `changeLedger/test/common/changeDocument.test.ts` (novo)

Módulo puro, sem serviço e sem disco. Uma asserção por caso:

| # | Caso |
| --- | --- |
| 1 | O recurso do "antes" tem o esquema `aih-before`, o caminho do arquivo e a consulta do hash |
| 2 | O recurso do "depois" troca só o esquema |
| 3 | O caminho do recurso de origem é preservado, e autoridade e fragmento não entram |
| 4 | `parseChangeDocument` lê de volta o que `changeDocumentResource` montou (ida e volta) |
| 5 | Consulta vazia não é documento do produto |
| 6 | Hash fora do formato não é documento do produto |
| 7 | Consulta com parâmetro a mais não é documento do produto |
| 8 | Esquema alheio não é documento do produto |
| 9 | Evento completo devolve o documento dos dois lados, cada um com o hash dele |
| 10 | Evento sem "antes" não devolve documento do lado `before` |
| 11 | Evento sem "depois" não devolve documento do lado `after` |
| 12 | Os dois esquemas do produto são os dois lados da alteração |
| 13 | O documento de um evento é o mesmo recurso que o construtor monta com aquele hash |

### 7.2 Unidade — `changeLedger/test/common/changeDocumentProvider.test.ts` (novo)

O provedor é exercitado **pelo serviço de arquivos** (`FileService` com o provedor em memória já
usado pelos testes do ledger, `changeLedgerService.test.ts:53-62`), porque é esse o caminho do
editor: capacidade, `stat`, fluxo e recusa de escrita.

| # | Caso |
| --- | --- |
| 1 | Ler o documento do "antes" devolve os bytes exatos do snapshot |
| 2 | Ler o documento do "depois" devolve os bytes exatos do snapshot |
| 3 | O mesmo hash nos dois esquemas devolve o mesmo conteúdo |
| 4 | Conteúdo com CRLF e quebra final volta **cru**, sem normalização |
| 5 | Snapshot vazio abre com conteúdo vazio |
| 6 | `stat` do documento é arquivo, com o tamanho real do snapshot |
| 7 | Hash válido fora do store falha como arquivo inexistente |
| 8 | Hash malformado falha como arquivo inexistente |
| 9 | Recurso sem consulta falha como arquivo inexistente |
| 10 | O provedor declara `Readonly` e **não** declara capacidade de escrita |
| 11 | Gravar no documento é recusado pelo serviço de arquivos |
| 12 | A mensagem de somente leitura é do produto e o `stat` traz a permissão de somente leitura |
| 13 | `readdir` do esquema é vazio e `watch` não observa nada |

### 7.3 Manual — `T-0016` no arnês, no app de verdade

O app precisa estar aberto para **observar** a escrita que produz os snapshots, e precisa ser
**reaberto** para abrir os documentos: no arranque as URIs são abertas como qualquer arquivo
(`windowsMainService.ts:965-977`). Por isso o cenário tem duas aberturas, e o `launchApp` do
arnês ganha um parâmetro de argumentos extras — o único ajuste na infraestrutura.

| Fase | O que faz | O que confere |
| --- | --- | --- |
| 0 | Sonda de prontidão | A observação está ligada antes de medir |
| 1 | `distante.ts` com dez linhas vai para o repositório (commit) e é **escrito de fora** com duas alterações distantes | O evento do arquivo tem `beforeHash` e `afterHash`, e os dois conteúdos estão no store |
| 2 | O app é fechado e reaberto no **mesmo perfil**, com `--file-uri` para o antes, o depois e um hash que não existe | — |
| 3 | A aba do antes | O editor desenha **exatamente** as dez linhas do snapshot do "antes", lidas do disco pelo arnês |
| 4 | A aba do depois | Idem para o "depois", com as duas linhas alteradas |
| 5 | Digitar nos dois editores | O texto não muda e a aba não fica suja — é somente leitura de verdade |
| 6 | A terceira aba (hash inexistente) | Não abre conteúdo (medição: o que o produto faz com um hash que não existe) |

O texto de referência continua sendo o do arquivo: o antes tem as dez linhas originais e o depois
tem as duas alteradas.

### 7.4 Regressão

`transpile-client`, `typecheck-client`, `eslint` nos arquivos tocados, `valid-layers-check`,
`test-node` dos dois módulos (`changeLedger` e `watchCode`) e o arnês inteiro — os quinze cenários
existentes são a prova de que nada do que já funcionava mudou.

## 8. Critérios de aceite verificáveis

1. `changeDocument.ts` e `changeDocumentProvider.ts` existem, e os 13 casos de unidade do contrato
   estão verdes no arquivo novo.
2. Os 13 casos de unidade do provedor estão verdes, com a leitura passando pelo serviço de arquivos.
3. Os dois esquemas são registrados pela contribuição, na fase `BlockStartup`, e o módulo está
   importado em `workbench.common.main.ts`.
4. O conteúdo servido é byte a byte o do snapshot, inclusive CRLF e quebra final.
5. Hash ausente, malformado ou fora do store falha como arquivo inexistente — em unidade.
6. A escrita é recusada, provado em unidade.
7. O contrato do ledger não mudou: nenhum campo novo em `ChangeEvent`.
8. `transpile-client`, `typecheck-client`, `eslint`, `valid-layers-check` e `hygiene` com saída 0.
9. `test-node` verde: `changeLedger` com a contagem medida e registrada, `watchCode` em 66.
10. T-0016 no `run-manual-tests.ts`, no `README.md` do arnês e em `testes-manuais.md` com resultado
    obtido e situação; arnês inteiro verde; `overview.md` com o status da E3-T2 e os números medidos.

## 9. Limites e preços

1. **Nada abre estes documentos no produto ainda.** O diff é da E3-T3 e os modos, da E3-T4; até lá
   a prova no app é a abertura por URI na linha de comando. É preço declarado, não esquecimento.
2. **A aba não diz de que lado é.** O documento tem o nome do arquivo real, igual ao arquivo real;
   o rótulo do lado entra na E3-T3, pelo `label` do input do editor.
3. **O caminho não é verificado.** `aih-before:/qualquer/coisa.ts?hash=H` serve o conteúdo de `H`:
   a identidade é esquema + caminho + hash, e o provedor só olha o hash. O caminho existe para dar
   idioma, nome e endereço legível.
4. **Cada abertura lê o snapshot do disco**, e o `stat` também lê para saber o tamanho — duas
   leituras de um arquivo pequeno por documento aberto. Um cache seria memória presa sem limite
   configurado, e limite é assunto da E5-T3.
5. **O documento serve o snapshot, não o estado do arquivo.** Depois de o arquivo mudar de novo, o
   "depois" continua sendo o do evento — é o que a linha do tempo promete.

## 10. Divergências do plano e decisões pendentes

| # | Ponto | Situação |
| --- | --- | --- |
| 1 | — | Nenhuma divergência do plano: as dez decisões dele foram seguidas, com os números e nomes fixados aqui |
| 2 | O §4.2 declara os métodos que só recusam com os parâmetros da interface | Na implementação eles saem **sem parâmetro**, como no provedor somente leitura do core: a assinatura continua compatível com a interface, e o `tsc` acusa import de tipo não usado quando o parâmetro não existe. Nada do contrato muda — o que esses métodos fazem é lançar, e não ler o argumento |

## 11. Revisão da tarefa, com o usuário (13/09/2026)

Revisão feita depois de a E3-T2 fechar. Ela **não** muda nada do que foi entregue: fixa o que fica
decidido para quem vem e registra o que ficou **sem** decisão, para não ser redescoberto no meio da
implementação. O destino de cada ponto está anotado nas tarefas do guia.

### 11.1 Decidido

| # | Ponto | Decisão |
| --- | --- | --- |
| R1 | Endereço do documento | Continua pelo **hash do conteúdo** (D1 mantida). "O antes daquela alteração" seria o id do evento, e custaria uma leitura de evento por documento aberto, duas abas para o mesmo conteúdo vindo de eventos diferentes e documento que morre quando o evento for podado |
| R2 | Workspace multi-raiz | **Fora de escopo**: o produto assume a primeira pasta, como já faz no salto (`timelineView.ts:468-472`) e no gravador (`changeRecorderService.ts:389`). Fazer o evento guardar a pasta é mudança de contrato e vira tarefa própria se o caso aparecer |
| R3 | Binário e arquivo grande | **Nenhuma promessa nova**: quem recusa binário é o serviço de texto do VS Code (`textFileService.ts:242-243`, `FILE_IS_BINARY`). Falta **medir** no arnês, e a medição é da E3-T3 — antes de a decoração pintar linha |
| R4 | Retenção | A promessa fica escrita agora e o mecanismo fica para a **E5-T3**: aba aberta não é invalidada, e reabrir avisa que o snapshot não existe mais |
| R5 | Abrir o diff | Clique e **F5** continuam sendo o **salto** (provado nos T-0008, T-0010 e T-0014); o diff abre por **ação explícita** — Paleta, menu da linha e uma tecla —, na E3-T3 |
| R6 | Rótulo do lado | `alvo.ts (Before)` e `alvo.ts (After)`, pelo `label` do input do editor, na E3-T3. Enquanto não existir, as abas do antes e do depois têm o mesmo nome do arquivo real |
| R7 | Atalhos à vista | Vira a tarefa **E8-T4**: um lembrete estático dos atalhos do produto (F5, Shift+F5, F7) num canto da janela, com o clique levando à linha do tempo |

### 11.2 Medido, sem decisão

Consequências que não são defeito e cujo consumo é de outra tarefa:

| # | Ponto | Consequência |
| --- | --- | --- |
| N1 | O `etag` de um documento é `mtime:size`, e o `mtime` daqui é 0 (`fileService.ts:264`) | Dois snapshots do mesmo tamanho compartilham o etag. É inofensivo enquanto o conteúdo de um hash for imutável, mas engana quem comparar etags de documentos diferentes |
| N2 | Codificação | O documento é servido em bytes crus e a decodificação é a genérica do editor (BOM e `files.autoGuessEncoding`); UTF-16 sem BOM não foi testado |
| N3 | Restauração de janela e hot exit | As abas dos documentos voltam no reload porque o hash continua no store; o caminho não foi medido |
| N4 | Binário e arquivo grande | Não medidos no app — ver R3 |

| 2 | — | Nenhuma decisão pendente de usuário |