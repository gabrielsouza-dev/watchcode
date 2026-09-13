# Plano — E2-T7 · Arquivos alterados no Explorer

| Campo | Valor |
| --- | --- |
| Tarefa | **E2-T7 — Arquivos alterados no Explorer** |
| Workflow | High (implementação: derivação nova, provedor novo e teste manual) |
| Depende de | E2-T6 (feito) |
| Slug | `e2-t7-arquivos-alterados-no-explorer` |
| Entrada | Backlog do `overview.md`: "Decoração nos arquivos que o agente tocou, pelo `IDecorationsService` — sem tocar no Explorer" |
| Decisão do usuário | Opção **C**: cor para "o agente tocou" + selo só enquanto não visto |
| Saída desta etapa | Este plano → `docs/watch-code/SPECS/e2-t7-arquivos-alterados-no-explorer.md` |

## 1. Objetivo

Levar para a árvore de arquivos o que a E2-T6 levou para a lista: quem abre o Explorer vê **onde o agente passou** (cor no arquivo) e **o que ainda não foi olhado** (o ponto), sem precisar abrir a timeline.

A analogia: o Explorer é a lista telefônica do projeto, toda com a mesma cara. A E2-T6 carimbou as cartas dentro da faixa da timeline; a E2-T7 leva o carimbo para a porta de entrada e acrescenta o rastro de tinta — por onde o agente passou fica marcado, e a marca de "não lida" só some quando o desenvolvedor vai até a alteração.

## 2. Escopo

**Entra:**

1. Provedor registrado em `IDecorationsService` que decora **arquivos do workspace** com alteração no ledger: cor de "tocado" sempre, e o ponto enquanto houver alteração não vista.
2. O ponto nasce quando o agente grava (`onDidChange`) e morre quando o desenvolvedor vai até a alteração (`onDidMarkViewed`) — os dois avisos que a E2-T6 já publica.
3. Tooltip localizado dizendo o estado do arquivo.
4. Pasta que contém arquivo com alteração pendente ganha a bolha do próprio VS Code (via `bubble`), sem agregar estado por conta própria.
5. Derivação pura (eventos → índice por caminho) com testes de unidade.
6. Teste manual **T-0013** no registro acumulativo, transcrito para o arnês de `docs/watch-code/e2e`.

**Não entra:**

1. Esconder os arquivos que o agente **não** tocou, com o atalho F7 — **E2-T8**.
2. Decoração de linhas dentro do editor (verde/vermelho) — **E3-T3**.
3. Agrupar por sessão, retenção e filtro de ruído de escrita em massa — **E5-T3**.
4. Configuração própria para ligar/desligar a decoração: as chaves do próprio VS Code (`explorer.decorations.colors` e `explorer.decorations.badges`) já desligam, uma por sinal.
5. Contar lote ou mexer no selo da timeline — isso continua sendo da E2-T6.
6. Decorar qualquer superfície que não seja a árvore de arquivos: abas de editor, terminal e resultados de busca ficam como estão.

## 3. Contexto

| Arquivo | Papel hoje | O que a E2-T7 faz nele |
| --- | --- | --- |
| `platform/changeLedger/common/timelineService.ts` | Modelo de leitura: lista em memória, status derivado, `onDidChange`, `onDidMarkViewed`, `getSummary` | É a **fonte** da decoração (`getEvents`) — nenhum método novo; só perde a função privada de normalização de caminho, que passa a ser compartilhada |
| `platform/changeLedger/common/filePath.ts` (novo) | — | Normalização do caminho relativo (`normalizeFileUri`), hoje privada no serviço de timeline, em um lugar só |
| `workbench/contrib/watchCode/common/timelineFileDecoration.ts` (novo) | — | Derivação pura: lista de eventos → índice por caminho relativo com "tocado" e "não visto" |
| `workbench/contrib/watchCode/browser/timelineDecorations.contribution.ts` (novo) | — | Provedor em `IDecorationsService` + registro como contribuição do workbench |
| `workbench/contrib/watchCode/common/timelineRows.ts` | Converte evento em linha; normaliza o caminho por conta própria em `splitFilePath` | Passa a usar a normalização compartilhada — mesma regra, um dono |
| `docs/watch-code/e2e/run-manual-tests.ts` | Arnês que roda os testes manuais no app de verdade | Cenário **T-0013** |
| `docs/watch-code/testes-manuais.md` | Registro único dos testes manuais | Teste **T-0013** |

Três fatos do código do próprio VS Code que decidem o desenho (conferidos em `workbench/services/decorations/browser/decorationsService.ts`):

- **Provedores são mesclados.** O serviço ordena as decorações por `weight` decrescente; a cor da primeira vence e as outras viram fallback, e se **qualquer** provedor trouxer `letter` como `ThemeIcon`, esse ícone substitui as letras dos demais (linhas 173-216 e 89-122). Ou seja: o peso é a alavanca para não depender da ordem de registro, e o selo precisa ser escolhido sabendo que ele disputa espaço com o do git e o do chat.
- **A pasta sai de graça.** `getDecoration(uri, includeChildren = true)` percorre os descendentes e, para cada decoração com `bubble: true`, mostra a bolha do VS Code em vez do selo, com o texto padrão "Contains emphasized items" (linhas 196-200 e 347-366). Nada de agregar estado por pasta.
- **O provedor pode ser síncrono.** `_fetchData` aceita resultado imediato ou promessa e guarda o resultado por provedor e por recurso (linhas 369-413). Com o índice carregado, responder é uma consulta de `Map`.

## 4. Dependências

1. **E2-T6 (feito)** — `viewedAt`/`isUnviewed` e `onDidMarkViewed` são o que dá sentido ao ponto.
2. **E2-T1 (feito)** — `ITimelineService.getEvents()` responde da lista em memória: a decoração **não lê disco** e não conhece o watcher.
3. **E1-T4 (feito)** — quem grava continua sendo o watcher; aqui nada é gravado.
4. **`IDecorationsService`** — serviço do workbench já registrado (`decorationsService.ts:416`). Nenhum pacote novo, nenhum serviço novo, nenhuma extensão: o provedor é do workbench e não passa pelo extension host.

## 5. Decisões

| # | Decisão | Situação | Motivo |
| --- | --- | --- | --- |
| **D1** | A decoração é a **opção C**: cor para "o agente tocou" (vale para todo arquivo com alteração) **e** o ponto só enquanto houver alteração não vista | **Aprovada pelo usuário** (opção C) | Não joga informação fora em nenhum dos dois sentidos: o rastro do agente e o "ninguém olhou ainda" convivem, cada um com seu sinal. É a leitura que o próprio VS Code já usa no git — cor de modificado mais selo de estado — e ainda permite desligar cada sinal na configuração do VS Code |
| **D2** | Provedor registrado em `IDecorationsService`, **sem tocar** em código do Explorer | Decidida — é o backlog | O Explorer é quem pergunta a decoração de cada recurso, e `registerDecorationsProvider` é o ponto de extensão do próprio VS Code; a bolha de pasta e o respeito às chaves `explorer.decorations.*` vêm do Explorer de graça |
| **D3** | A cor é `editorInfo.foreground` — a mesma do ponto da timeline — e **nenhuma cor nova é registrada** | Decidida — local | É o idioma que o produto já fala na lista. Registrar cor própria amplia a superfície de tema sem ganho, e a cor de informação não se confunde com o "modificado" do git |
| **D4** | O selo é o **mesmo ícone da timeline** (`Codicon.circleFilled`), com `weight` explícito na decoração | Decidida — local, com preço registrado | O ponto é o que a lista já usa, e o peso evita depender da ordem de registro. **Preço conhecido e aceito:** num arquivo que também está modificado no git, o ponto ocupa o lugar da letra do git — o mesmo comportamento que o chat do VS Code já tem com o próprio ícone |
| **D5** | A bolha da pasta aparece **só** quando há alteração não vista embaixo dela | Decidida — local | "Tem coisa nova aqui dentro" combina com o contador do título da timeline; ligar a bolha ao rastro faria a pasta ficar acesa para sempre, e pasta acesa vira ruído |
| **D6** | O dado é **derivado** em função pura, a partir de `getEvents()`; o provedor não guarda cópia da lista de eventos | Decidida — óbvia | Mesma divisão da E2-T6: quem deriva é o modelo de leitura. Uma cópia própria da lista sairia de sincronia com o serviço na primeira gravação que a decoração não visse |
| **D7** | O provedor reage a `onDidChange` (alteração nova) e `onDidMarkViewed` (ponto apagado), e a mais nada | Decidida — óbvia | São exatamente os dois fatos que mudam a decoração. Ouvir o disco ou reconsultar por tempo seria um segundo caminho para o mesmo dado |
| **D8** | O escopo é o workspace: só recurso sob uma pasta do workspace é decorado | Decidida — óbvia | O evento guarda caminho **relativo** ao workspace; sem pasta não há como resolver arquivo — e recurso fora do workspace não tem evento |

Nenhuma decisão fica pendente: D1 foi aprovada pelo usuário e D2 a D8 são técnicas, locais e reversíveis. O preço da D4 está registrado aqui e vai para os limites da SPEC.

## 6. Etapas

1. **Normalização compartilhada.** Extrair `normalizeFileUri` do serviço de timeline para `changeLedger/common/filePath.ts` e usá-la nos três lugares que hoje repetem a regra (serviço, `splitFilePath` da linha, derivação nova). Sem mudança de comportamento.
2. **Derivação pura.** Em `watchCode/common/timelineFileDecoration.ts`: a partir dos eventos, um índice por caminho normalizado com o que a decoração precisa saber — se o arquivo foi tocado e se ainda tem alteração não vista. Testável sem interface, sem disco e sem serviço.
3. **Provedor.** Em `watchCode/browser/timelineDecorations.contribution.ts`: `IDecorationsProvider` com `label`, `onDidChange` e `provideDecorations`. Traduz o recurso recebido do Explorer para o caminho relativo do índice (pela pasta do workspace) e devolve a decoração: cor quando tocado, ponto quando não visto, bolha só no não visto, tooltip localizado.
4. **Carga e avisos.** O índice carrega na construção da contribuição e, ao terminar, avisa uma vez com os recursos tocados — assim o que já estava desenhado na árvore se repinta. Daí em diante, cada `onDidChange` e cada `onDidMarkViewed` atualiza o índice e avisa **só o recurso afetado**.
5. **Registro.** A contribuição sobe como `IWorkbenchContribution` na fase já usada pelas outras do produto, e o provedor é registrado em `DisposableStore`, sem vazamento ao fechar a janela.
6. **Testes de unidade.** Derivação (tocado, não visto, arquivo com várias alterações, arquivo já visto) e a normalização compartilhada, no padrão das suítes existentes.
7. **Teste manual.** **T-0013** no registro acumulativo e transcrito para o arnês: arquivo escrito de fora aparece decorado na árvore → ir até a alteração apaga o ponto e mantém a cor → pasta com pendência mostra a bolha → o log do produto fica limpo.
8. **Validação.** Suítes de `changeLedger` e `watchCode`, `typecheck-client`, `eslint` nos arquivos tocados, `valid-layers-check`, higiene e o arnês inteiro; contagens novas anotadas no `overview.md` pela etapa Reporter.

## 7. Riscos e impactos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Mescla com os provedores de git e de chat, que já decoram os mesmos arquivos | Cor ou selo de outro provedor pode ser encoberto | Peso explícito na nossa decoração (D4) em vez de depender da ordem de registro; o preço fica registrado nos limites da SPEC e a conferência é no app, no T-0013 |
| `provideDecorations` é chamado para **cada** recurso desenhado — e também para as pastas, com `includeChildren` | Custo por quadro da árvore | Índice em `Map` carregado uma vez: resposta em tempo constante, sem varrer a lista de eventos e sem tocar no disco |
| Árvore virtualizada: linha fora da área visível não existe no DOM | A decoração de um arquivo fora da vista não é observável no teste | Mesmo limite já medido no T-0012; o T-0013 confere nos arquivos que estão à vista e o cenário rola a árvore até o arquivo do passo |
| Índice ainda carregando na primeira pintura da árvore | Arquivo tocado aparece sem decoração por um instante | Aviso de mudança uma vez, ao terminar a carga (etapa 4) — quem já foi desenhado se repinta |
| Arquivo do evento que não existe mais, ou pasta do workspace ainda não resolvida | Decoração fantasma numa árvore que esconde o arquivo | O Explorer só pergunta por recurso que está mostrando e o índice é por caminho: nada é inventado |
| Workspace de várias raízes | O caminho relativo do evento pode não distinguir a raiz | Resolver pela pasta do próprio recurso (`getWorkspaceFolder`) e registrar o limite; a convenção de uma raiz é a mesma que a view da timeline já usa (`folders[0]`) |
| Dublês de teste do serviço de timeline usados nas suítes existentes | Compilação quebrada ao mexer no serviço | A mudança no serviço é extração de função privada (etapa 1), sem assinatura nova; ajuste exigido por compilação é permitido ao Developer e registrado como divergência |
| Registro do provedor em toda janela, inclusive com a árvore fechada | Provedor duplicado, com selo desenhado duas vezes | Registro único na contribuição do workbench, com o mesmo cuidado já documentado no `ExplorerDecorationsProvider` do VS Code |

## 8. Fontes de prova

| O que precisa de prova | Onde é provado |
| --- | --- |
| O índice acerta tocado e não visto, inclusive com várias alterações do mesmo arquivo | Teste de unidade da derivação pura |
| A normalização de caminho é uma só e não mudou de comportamento | Teste de unidade da função compartilhada + suíte do `changeLedger` |
| O arquivo tocado aparece decorado na árvore de verdade | Cenário **T-0013** no arnês, lendo as classes de decoração das linhas do Explorer no app aberto |
| O ponto some ao ir até a alteração e a cor permanece | T-0013 (mesmo cenário, segundo e terceiro passos) |
| A pasta com pendência mostra a bolha | T-0013 |
| Nada disso quebra o que existia | Suíte do `changeLedger` e do `watchCode`, `typecheck-client`, `eslint`, `valid-layers-check` e o arnês inteiro, com o log do produto sem erro nem aviso |

## 9. Critérios de aceite

1. Existe um provedor registrado em `IDecorationsService`, sem nenhuma alteração em código do Explorer.
2. Arquivo com alteração no ledger recebe decoração com cor; arquivo sem alteração não recebe nada.
3. Arquivo com alteração não vista recebe também o ponto; arquivo cujo histórico inteiro já foi visto recebe **só** a cor.
4. Ir até a alteração (F5, clique, setas, Enter ou duplo clique) apaga o ponto do arquivo na árvore, sem apagar a cor.
5. Alteração nova gravada pelo agente faz o ponto aparecer no arquivo, com a árvore já desenhada.
6. A pasta que contém arquivo com alteração não vista mostra a bolha; quando nada pendente sobra embaixo dela, a bolha some.
7. O tooltip da decoração é localizado e diz o estado do arquivo.
8. A decoração não escreve nada no disco e não dispara gravação: quem marca como vista continua sendo a timeline.
9. A normalização do caminho relativo tem um dono só, usada pelo serviço de timeline, pela linha da lista e pela decoração.
10. O provedor é descartado ao fechar a janela, sem vazar assinatura nem provedor duplicado.
11. T-0013 registrado em `testes-manuais.md` com objetivo, pré-condições, passos, resultado esperado, resultado obtido e situação, executado de fato.
12. `npm run typecheck-client`, `npx eslint` nos arquivos tocados, `npm run valid-layers-check`, a higiene e as suítes de unidade saem verdes, com as contagens novas no `overview.md`.
13. O arnês inteiro passa, incluindo o T-0013 e o T-0012 da tarefa anterior.
14. O preço da D4 (ponto no lugar da letra do git no mesmo arquivo) está registrado nos limites da SPEC.

