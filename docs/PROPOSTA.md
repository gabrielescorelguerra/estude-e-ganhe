# Estude e Ganhe — Proposta de produto e planejamento

## 1. Produto em uma frase
Cada minuto estudado vira voto fictício numa eleição real do passado. Você decide em qual estado e em qual candidato usar esses votos, e vê o resultado oficial mudar ao lado do seu.

### Princípios
- **Cronômetro primeiro.** O uso diário é estudar. O mapa é a recompensa, não a tela inicial.
- **Oficial e fictício nunca se misturam.** Os dados do TSE aparecem em tinta neutra, e os votos de estudo têm uma cor própria e um rótulo fixo ("votos de estudo"). Nenhum número é somado sem identificar a origem.
- **Pouca interface, muita informação útil.** Uma tela principal com mapa, um painel lateral contextual e uma barra do cronômetro.

## 2. Mecânica
- **Taxa:** 1 min = 10.000 votos. O texto do pedido diz "10.00", então assumi 10.000, que bate com 60.000 por hora. A taxa fica em configuração.
- **Carteira de votos:** o tempo estudado gera um saldo. O usuário aloca o saldo em (estado, candidato).
- **Duas formas de alocar:**
  - **Manual:** clicar no estado e arrastar um controle de votos para um candidato.
  - **Estratégia automática**, escolhida de antemão e aplicada a cada sessão encerrada:
    - *Fixa:* sempre o mesmo candidato e os mesmos estados.
    - *Proporcional:* segue o peso eleitoral dos estados.
    - *Reforço:* vai para o estado onde a diferença para o oficial é menor.
    - *Rodízio:* alterna estados a cada sessão.
- **Resultado simulado:** `oficial + fictício` por estado, com o vencedor recalculado. Há uma alternância "Oficial / Com seus votos / Só seus votos".
- **Escala:** a eleição de 2022 teve cerca de 118 milhões de votos válidos no 1º turno. Mudar um estado exige muitas horas de estudo. Por isso o app mostra "Faltam X h para virar o Acre" e usa estados pequenos como primeiras vitórias. Isso dá metas concretas e evita a frustração de um mapa que nunca muda.

## 3. Cronômetro
- Iniciar, pausar, retomar e finalizar.
- O tempo é calculado por timestamps (`início`, `pausas[]`), não por contagem de ticks. Assim sobrevive a aba em segundo plano, recarga da página e fechamento do navegador.
- O estado da sessão ativa é gravado a cada transição, então não se perde progresso.
- Histórico de sessões, com edição de rótulo (matéria).
- Meta diária com anel de progresso, sequência de dias (streak), total semanal e heatmap de 12 semanas.
- Ao finalizar, aparece uma tela curta: "+N votos. Alocar agora ou usar a estratégia?"

## 4. Dados: o que testei hoje
| Fonte | Resultado do teste |
|---|---|
| TSE, `votacao_candidato_munzona_2022.zip` (CDN, CSV) | **Funciona.** 577 MB, um CSV por UF, votos por candidato, município e zona. Os totais conferem com o oficial: Lula 57.259.504 e Bolsonaro 51.072.345 no 1º turno, Lula 60.345.999 e Bolsonaro 58.206.354 no 2º. |
| TSE, CKAN (`dadosabertos.tse.jus.br/api/3`) | **Funciona.** Serve para descobrir os arquivos de cada eleição e detectar atualização pela data de modificação. |
| TSE, `resultados.tse.jus.br` (JSON de apuração) | Os caminhos que testei retornam 404. Não é necessário para eleições passadas. |
| TSE, DivulgaCandContas (fotos e candidatos) | **Bloqueado** (Access Denied do CDN) a partir deste ambiente de nuvem. |
| IBGE, API de malhas (GeoJSON de UF e município) | **Não consegui testar.** O túnel do proxy do ambiente cai antes da resposta. |

### Dificuldades reais
1. **Fotos.** O DivulgaCand bloqueia IPs de nuvem. Isso deve funcionar do navegador ou da máquina do usuário. Plano: script de ingestão que tenta baixar as fotos e, se falhar, usa o avatar tipográfico (iniciais e cor do partido). O app é completo sem fotos.
2. **Tamanho.** Não dá para o navegador baixar 577 MB. Um **script de ingestão offline** (`tools/ingest`) filtra a eleição e gera arquivos pequenos e versionados, com `manifest.json`, `candidatos.json`, `uf.json` e `municipios/{UF}.json` (votos por município, estimativa de 5 a 10 MB no total, comprimidos).
3. **Código de município.** O TSE usa um código próprio e o IBGE usa outro. Preciso de uma tabela de correspondência, que o IBGE publica com o código TSE na lista de municípios, e de uma verificação para os ~5.570 municípios.
4. **Voto no exterior** (ZZ): entra como um "estado" à parte, fora do mapa, numa faixa lateral.
5. **Geometria.** IBGE malhas v3 com qualidade mínima: UF em cerca de 100 KB e municípios em ~5–10 MB, simplificados e carregados sob demanda por UF (carregar o Brasil inteiro em municípios deixaria o app lento). Se a API do IBGE continuar inacessível aqui, a alternativa é o repositório `tbrugz/geodata-br` ou `kelvins/municipios-brasileiros`.
6. **Mudança nos dados oficiais ou fonte fora do ar.** O app embarca um snapshot validado (`manifest.json` com hash e data de geração) e nunca depende da rede em tempo de uso. A ingestão é um passo de build, não de runtime. Se o TSE mudar o layout do CSV, o script falha com erro claro e o app continua com o último snapshot.

## 5. Arquitetura e stack
**Escolha: PWA com React + TypeScript + Vite, sem backend na v1.**
- **Por que sem backend:** dados eleitorais passados são estáticos, e as sessões de estudo são do próprio usuário. Isso simplifica hospedagem (qualquer host estático) e permite uso offline.
- **Android depois:** empacotar a mesma PWA com **Capacitor** dá um APK sem reescrever. Por isso a lógica fica em módulos puros, desacoplados do DOM (`core/`), e a persistência atrás de uma interface (`Storage`) que hoje usa IndexedDB e amanhã pode usar SQLite ou sincronização.
- **Mapa:** **D3-geo** para projeção e caminhos, renderizado em **SVG** (27 UFs) e **Canvas** só no nível de município, onde há milhares de polígonos. Zoom e pan com `d3-zoom`. Evito Leaflet e Mapbox porque a mapa é abstrato, sem tiles de rua.
- **Estado:** Zustand. **Persistência:** IndexedDB via `idb`. **Estilo:** CSS Modules com tokens de design, sem biblioteca de componentes pronta. **Testes:** Vitest para o núcleo (conversão, alocação, estratégias, cronômetro) e Playwright para o fluxo principal.
- **Backend (v2, opcional):** sincronização entre dispositivos e ranking de amigos.

```
src/
  core/        timer, votos, estratégias, apuração (puro, testado)
  data/        loaders do snapshot, tipos, validação (zod)
  features/    cronometro/ mapa/ alocacao/ historico/ metas/
  ui/          tokens, tipografia, componentes base
tools/ingest/  baixa TSE + IBGE → public/data/{ano}/{cargo}/
```

## 6. Direção visual
- **Referências:** quadro de apuração do TSE, jornalismo de dados (mapas de eleição de grandes jornais) e a sobriedade de apps como Linear e Things.
- **Tipografia:** uma serifada de texto para títulos e nomes (sensação editorial) e uma sans com **números tabulares** para toda a apuração, com alinhamento rigoroso das casas.
- **Cor:** fundo em papel quente e quase neutro, com tema escuro opcional. Uma cor por candidato, aplicada **apenas** em mapa e barras. Os votos de estudo usam uma única cor de destaque, reservada a eles. Nada de gradientes ou sombras decorativas.
- **Layout:** mapa ocupando ~65% da tela. À direita, um painel contextual que muda entre "Brasil", "Estado" e "Município". Embaixo, uma barra fina fixa com o cronômetro. Poucos cards, e as tabelas respeitam a hierarquia.
- **Mapa:** coroplético mostrando o vencedor por estado, com opacidade proporcional à margem. Contorno mais grosso nos estados em que o usuário mudou o resultado.

## 7. Escopo da v1 e roteiro
**v1 (eleição presidencial 2022, 1º e 2º turnos):**
1. Fundação: projeto, tokens de design, núcleo do cronômetro com testes.
2. Ingestão TSE → snapshot, validada contra os totais oficiais.
3. Cronômetro completo, histórico, meta diária, estatísticas.
4. Mapa por UF, painel de estado, comparação oficial vs. simulado.
5. Alocação manual e estratégias automáticas.
6. Mapa por município (carga sob demanda), PWA offline, polimento.

**Fica para depois:** outros anos e cargos (governador, senador: o mesmo CSV serve, a ingestão é parametrizada por cargo), outros países, sincronização em nuvem, Android via Capacitor, ranking social.

## 8. Decisões que preciso de você
1. A taxa é **10.000 votos/min**, certo (o texto dizia "10.00")?
2. Começo pelo **1º turno ou pelo 2º** como visão padrão? Minha sugestão é o 2º turno, pois a disputa binária deixa o mapa mais legível. O 1º turno fica disponível por alternância.
3. Libero o acesso ao IBGE no ambiente, ou aceita que eu use um espelho público das malhas (GitHub)? O proxy atual cai para `servicodados.ibge.gov.br`.
4. Posso seguir com **PWA + React/TypeScript** como descrito?
