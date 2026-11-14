# Estude e Ganhe

Cronômetro de estudos que transforma tempo em **votos fictícios** numa eleição real do passado. Os dados eleitorais são oficiais (TSE); os votos de estudo existem só no app e nunca se misturam com a apuração.

Veja a proposta e as decisões de projeto em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Como funciona
1. Você escolhe uma eleição (hoje: Presidente 2022), o turno e o candidato.
2. Define um **prazo** e uma **meta diária**. O app calcula quantos votos vale cada minuto para a vitória ser alcançável: `taxa = votos que faltam ÷ (dias × minutos por dia)`.
3. Cada sessão vira votos. Você os distribui no mapa (estado ou município) ou escolhe uma estratégia automática.
4. No 1º turno, ao atingir o objetivo (chegar ao 2º turno), a campanha avança para o 2º.

## Desenvolvimento
```bash
npm install
npm run dev      # servidor local
npm test         # núcleo: taxa, estratégias, cronômetro, estatísticas
npm run build    # produção em dist/
```

## Dados
`npm run ingest` baixa o arquivo `votacao_candidato_munzona_2022` do TSE (~580 MB) e as malhas municipais, valida os totais contra o resultado oficial e gera `public/data` e `public/geo`. O app usa só esse snapshot, sem acessar o TSE em tempo de execução.

## Android
O mesmo código vira APK com Capacitor: `npm run cap:sync` e depois abra `android/` no Android Studio, ou deixe o GitHub Actions gerar. Cada push publica o APK na release `apk-latest`.
