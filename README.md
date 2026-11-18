# Dubla Brasil

Dublagem de cenas com a sua voz, fala por fala, direto no navegador.

Você escolhe uma cena, pega um ou mais personagens e grava cada fala enquanto o vídeo toca. Durante as suas
falas, o áudio original some e entra a trilha de fundo (música e efeitos sem vozes). No fim você assiste ao
resultado e baixa o vídeo dublado.

Tudo roda no navegador e fica salvo no próprio computador (IndexedDB): não há servidor nem conta.

## Funcionalidades

- **Cenas**: biblioteca com busca, cena de exemplo original e as cenas que você criar.
- **Escolher papel**: dublar um personagem ou vários; os outros continuam com a voz original.
- **Estúdio**: contagem regressiva, gravação fala por fala ou todas seguidas, regravar, ouvir, medidor do
  microfone e atalhos de teclado (`R` gravar, `O` ouvir, `↑`/`↓` escolher fala, `Espaço` tocar, `Esc` parar).
- **Sessão**: assiste ao dub completo e baixa o vídeo (MP4 ou WebM, conforme o navegador) com legendas opcionais.
- **Imitação**: sons curtos cadastrados pelo administrador; a pessoa imita e recebe uma nota de 0 a 100
  (ritmo e entonação, comparados com alinhamento no tempo e independentes de a voz ser grave ou aguda).
- **Jogos**: Voz no Alvo, em que o tom da voz controla a bolinha (com calibração grave/agudo e recorde).
- **Administração**: PIN, cenas e sons; publicar/ocultar, editar, exportar e excluir.
- **Editor de cenas**: envia o vídeo e a trilha de fundo opcional, cadastra personagens, marca início e fim
  de cada fala (`I`/`O`) ou importa legendas `.srt`.
- **Pacotes `.dubla`**: exporta uma cena (ZIP com `cena.json`, vídeo e fundo) para usar em outro navegador ou mandar
  para outra pessoa, e importa pacotes recebidos.
- **Configurações**: escolha e teste do microfone, ajuste de sincronia, tempo antes da fala, volumes e legendas.

## Como rodar

Requisitos: Node.js 22 ou mais recente.

```bash
npm install
npm run dev
```

Para gerar a versão de produção (arquivos estáticos em `dist/`, que funcionam em qualquer hospedagem, inclusive
em subpastas):

```bash
npm run build
```

## Testes

Com `npx vite preview --port 4173` rodando:

```bash
node testes/e2e.cjs
node testes/e2e-editor.cjs
node testes/e2e-imitacao.cjs
```

O primeiro escolhe a cena de exemplo, grava com um microfone simulado, assiste e baixa o vídeo. O segundo cria
uma cena no editor, exporta o pacote, exclui e reimporta. As capturas de tela ficam em `testes/saida/`.

## Como funciona a mixagem

- Cada gravação guarda o momento exato da cena em que começou (o microfone é lido por um AudioWorklet com o
  relógio do áudio), descontando a latência de saída do sistema e o ajuste manual de sincronia.
- Fora das suas falas toca o áudio original. Durante elas, o original é silenciado e entra a trilha de fundo.
  Sem trilha de fundo, o original fica no volume definido em Configurações.
- O vídeo baixado é gerado em tempo real: o quadro do vídeo é desenhado num canvas e gravado junto com a mixagem.

## Servidor (Supabase) e administração

Cenas e sons ficam no Supabase e aparecem para todos os usuários quando publicados. A estrutura do banco,
da pasta de arquivos e das permissões está em `supabase/esquema.sql` (rode no SQL Editor do projeto).
O endereço e a chave pública ficam em `src/nuvem-config.ts`.

A **Área do administrador** (link no rodapé) usa o login do Supabase: o primeiro usuário criado em
Authentication vira administrador. Visitantes só leem o que está publicado; só o administrador cadastra,
edita e exclui. Dubs e notas da Imitação continuam salvos no aparelho de cada pessoa.

Os testes rodam contra um servidor simulado (`testes/servidor-falso.cjs`), sem tocar no projeto real:

```bash
node testes/servidor-falso.cjs &
VITE_SUPABASE_URL=http://localhost:54399 npx vite build --outDir dist-teste
npx vite preview --outDir dist-teste --port 4174 &
node testes/e2e-editor.cjs http://localhost:4174/
```

## Cena de teste

Os testes usam uma cena original gerada por `scripts/gerar-cena-teste.sh` (fica em `testes/fixtures`, fora do app).

## Direitos autorais

Use apenas vídeos e áudios que você tem direito de usar.

## Aplicativo para Android e iOS

O app é empacotado com o [Capacitor](https://capacitorjs.com). As pastas `android/` e `ios/` são os projetos nativos.

Depois de qualquer mudança no código:

```bash
npm run build
npx cap sync
```

**Android (APK):** precisa do Android Studio (ou do Android SDK) e do Java 21.

```bash
cd android
./gradlew assembleDebug
```

O APK fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Para publicar na Google Play, gere um
pacote assinado (`./gradlew bundleRelease`) com a sua chave de assinatura, ou use o Android Studio
(Build → Generate Signed App Bundle).

**iOS:** precisa de um Mac com Xcode e de uma conta Apple Developer para instalar no iPhone ou publicar na
App Store.

```bash
npx cap open ios
```

No Xcode, escolha o seu time em Signing & Capabilities e clique em ▶ para rodar no iPhone conectado.

Os ícones e a tela de abertura são gerados a partir de `assets/` com `npx capacitor-assets generate`.

## Rostos dos personagens

Ao salvar uma cena, o editor procura o rosto de cada personagem nos momentos em que ele fala (o maior rosto
em alguns quadros de cada fala) e recorta uma foto redonda. O administrador pode ajustar com
**Quadro atual** (pausa no rosto certo) ou **Foto** (envia uma imagem). A detecção roda no próprio aparelho,
com o modelo *tiny face detector* da biblioteca [@vladmandic/face-api](https://github.com/vladmandic/face-api)
(licença MIT), carregado só no editor.

O vídeo de teste `testes/fixtures/cena-rostos/video.mp4` usa as fotos de exemplo dessa biblioteca (MIT).

## Galeria de dubs

Quem termina um dub pode tocar em **Publicar na galeria**. Na primeira vez o app pede um apelido (login anônimo
do Supabase, sem e-mail). A galeria é uma rolagem vertical com 👍/👎, comentários, compartilhar e denunciar.
O administrador modera pela aba **Galeria** do painel (as mais denunciadas primeiro) ou direto na galeria.

Para ativar no servidor: rode `supabase/galeria.sql` no SQL Editor e ligue **Allow anonymous sign-ins** em
Authentication → Sign In / Providers. Teste: `node testes/e2e-galeria.cjs http://localhost:4174/`.

## Separar falas automaticamente (IA)

No editor, **✨ Separar falas** ouve o vídeo e cria as falas sozinho:

1. **Whisper base** (`onnx-community/whisper-base`) transcreve e marca o tempo de cada fala, no idioma escolhido em
   “Idioma das falas”. Vídeos em outros idiomas saem em inglês pelo próprio Whisper.
2. Os tempos são refinados pelo volume da voz (o Whisper às vezes arredonda para o segundo).
3. **Tradução para o português** com `Xenova/opus-mt-en-ROMANCE` (código `>>pt_br<<` inserido direto na entrada).
   Vídeos em português não são traduzidos. O texto original fica guardado e aparece embaixo de cada fala no editor.
4. Falas longas são divididas nas pontuações; cada fala recebe um personagem pelo tom de voz (agrupamento por semitons).

Tudo roda no aparelho, num Web Worker. Os modelos (≈77 MB + 113 MB) vêm do Hugging Face e o motor ONNX Runtime da
jsDelivr só na primeira vez, e não vão dentro do APK. Teste: `node testes/e2e-ia.cjs http://localhost:4174/`.

No estúdio, a legenda em português aparece embaixo do vídeo no estilo karaokê (preenche conforme a fala passa).

## Versão 1.8: ajustes de uso

- **Legenda fora da imagem:** no estúdio e no resultado, a legenda em português fica numa barra embaixo do vídeo.
  O vídeo salvo sai sem legenda por cima.
- **Marca d'água:** o vídeo salvo leva a logo pequena no canto de baixo, à direita.
- **Salvar na galeria:** no celular, o vídeo vai direto para a galeria (álbum "Dubla Brasil AI"), com o plugin
  `@capacitor-community/media`. Se a galeria recusar, abre o compartilhar.
- **Microfone:** cancelamento de eco e redução de ruído ligados por padrão. Depois de gravar, a voz é limpa
  (passa-altas de 80 Hz, porta de ruído suave, volume até −1 dB) e alinhada com a fala original pelo desenho do
  volume (até ±0,3 s, só quando a semelhança é clara). Tudo pode ser desligado em Configurações.
- **Capa:** no editor, escolha a capa pelo quadro atual do vídeo ou envie uma imagem.
- **Fotos sem quadro preto:** antes de fotografar, o app espera o quadro ser desenhado e descarta quadros escuros
  (problema do Android). Se o detector de rostos não carregar, cada personagem ainda ganha uma foto.
- **Vídeos 9:16:** o player se ajusta ao formato do vídeo (em pé ou deitado). Teste: `node testes/e2e-melhorias.cjs`.

## Versão 2.0: câmera estilo chamada

- **Câmera no estúdio (opcional):** o botão 📷 no topo do estúdio liga a câmera frontal. A prévia aparece
  espelhada no canto do vídeo. Ao gravar, a câmera grava junto com a voz (`src/audio/camera.ts`). Cada trecho
  fica guardado no dub (`Dub.cameras`), com o momento da cena em que começou. Regravar uma fala troca o trecho
  da câmera dessa fala. A escolha fica salva nas preferências.
- **Resultado:** o rosto da pessoa passa num quadradinho com borda branca no canto de cima, à direita,
  sincronizado com o vídeo. O vídeo salvo na galeria e o publicado levam o quadradinho também.
- **Permissões:** `CAMERA` no Android (câmera não obrigatória) e `NSCameraUsageDescription` no iOS.
- **Administrador:** os botões "🖼 Da galeria" no editor escolhem as fotos dos personagens e a capa pelas
  imagens do celular.
- **Galeria:** barra "Faça um comentário…" embaixo de cada dub, que abre os comentários.
- Teste: `node testes/e2e-camera.cjs` (usa a câmera falsa do Chrome).

## Versão 2.2: plano Premium (R$ 19,90/mês)

- **Grátis:** 3 dublagens por dia (o dia vira à meia-noite de Brasília) e vídeo com a marca d'água.
- **Premium:** dublagens ilimitadas e vídeo sem marca d'água.
- **Contagem no servidor:** quem conta e quem decide é o servidor (`supabase/assinatura.sql`, rode no SQL Editor
  depois de `esquema.sql` e `galeria.sql`). Tabelas `assinantes` e `uso_diario`. A pessoa só lê os próprios dados.
  Ninguém consegue se dar Premium nem zerar o próprio contador pelo app (testado no Postgres local).
  O administrador conta como Premium.
- **Ainda sem o SQL:** enquanto o arquivo não for rodado, o app segue liberado e com marca d'água.
- **Telas:** botão "⭐ Seja Premium" no topo, "Minha conta" (`#/conta`, com plano, uso de hoje, criar conta e
  entrar) e "Premium" (`#/premium`, página de venda). Para assinar é preciso ter conta com e-mail, para o Premium
  valer em qualquer celular.
- **Administrador:** aba "⭐ Assinantes" lista os assinantes e libera ou tira o Premium pelo e-mail ou @apelido.
- **Pagamento:** o link da plataforma vai em `LINK_ASSINATURA` (`src/nuvem-config.ts`). O app abre o link com
  `?email=` da conta. A liberação automática depois do pagamento fica a cargo de um webhook da plataforma, que grava
  em `assinantes` com `origem = 'checkout'`. Isso é feito por uma Edge Function do Supabase, a ser escrita quando a
  plataforma for escolhida.
- Teste: `node testes/e2e-premium.cjs`.

## iPhone (iOS)

- **Projeto:** está em `ios/`, com Capacitor 8 e Swift Package Manager (iOS 15 ou mais novo). Versão 2.7 (build 18).
  Já tem as permissões de microfone, câmera e galeria.
- **Ajustes para iPhone:** o quadradinho da câmera é desenhado sem `roundRect`. A gravação do vídeo cai para
  30 quadros por segundo quando o aparelho não tem `requestFrame`.
- **Gerar sem Mac:** `codemagic.yaml` gera o app num Mac na nuvem e envia ao TestFlight. Precisa da conta Apple
  Developer e da chave da App Store Connect cadastrada no Codemagic.
- **Gerar com Mac:** rode `npm ci && npm run build && npx cap sync ios`, abra `ios/App/App.xcodeproj` no Xcode,
  escolha o time em *Signing & Capabilities* e use *Product → Archive*.
- **Excluir minha conta:** exigida pela App Store e pela Google Play. Ativar com `supabase/conta.sql`.

## Versão em site (link para iPhone)

- `netlify.toml` já tem tudo: no Netlify, *Add new site → Import from GitHub → Dubla-Brasil* e publicar.
  Cada envio ao GitHub atualiza o site sozinho.
- No iPhone: abrir o link no Safari → Compartilhar → "Adicionar à Tela de Início".
- No celular pelo navegador, "Salvar na galeria" abre o menu de compartilhar, onde aparece "Salvar vídeo".

## Versão 2.4: editar o vídeo no editor de cenas

- O botão **✂️ Editar vídeo** fica ao lado de "Importar legendas". Ele corta o começo e o fim por barras de
  arrastar ou por "Começar aqui" e "Terminar aqui", e muda o formato para **Original, 9:16 (em pé), 1:1 ou 16:9**.
- Nos formatos com recorte, uma moldura amarela mostra a parte que fica, e uma barra escolhe a posição do recorte.
- O vídeo é regravado no aparelho, tocando o trecho uma vez, e por isso leva o mesmo tempo do trecho
  (`src/edicaoVideo.ts`). Sai em MP4/H.264 quando o aparelho suporta, até 1280 px, sem aumentar a imagem.
- As falas são ajustadas ao corte: as que ficam fora saem e as outras têm os tempos mudados. A trilha de fundo é
  cortada no mesmo trecho e vira WAV.
- Teste: `node testes/e2e-edicao.cjs`.

## Versão 2.5: corrigir legendas

- No editor, cada fala tem uma caixa de texto que cresce com o texto, com a legenda em português. Embaixo fica o
  texto original, também editável, quando a fala veio da IA. Uma dica em destaque explica como corrigir.
- Teste: `node testes/e2e-legendas.cjs`. O administrador corrige o texto e o usuário vê a correção no estúdio.
- **2.6:** o ▶ de cada fala no editor toca o trecho direto no toque e para sozinho no fim, vigiando o próprio vídeo.
  Antes ele podia parar na hora quando o vídeo já tinha passado da fala. Enquanto toca, o vídeo vira um
  miniplayer no canto da tela, com a legenda, e tocar de novo (⏸) para.
- **2.7:** o botão "Assinar" abre o checkout da Cakto (`LINK_ASSINATURA`), com `?email=` da conta. Por enquanto
  o administrador libera o Premium à mão, na aba Assinantes, depois de ver a venda na Cakto. A liberação
  automática depende de um webhook da Cakto para uma Edge Function do Supabase.

## Versão 2.8: aviso de atualização

- **Uma fonte só da versão:** `public/versao.json`, com versão, código, novidades e link do APK. O Android
  (`build.gradle`) e o iPhone (`codemagic.yaml`) leem o número dali, e o site publica o arquivo.
- **Ao abrir o app,** ao voltar para ele e a cada 30 minutos, o app compara com o `versao.json` do site
  (dublabr.netlify.app). Se houver versão nova, mostra **"🎉 Atualização X disponível"** com as novidades:
  - no Android: **⬇ Baixar a atualização** (o APK em `/baixar/DublaBrasilAI.apk`);
  - no site: **🔄 Atualizar agora** (recarrega);
  - no iPhone instalado: atualizar pelo TestFlight ou pela App Store.

  "Depois" adia por 12 horas. Depois de atualizar, mostra **"✨ Novidades da versão"** uma vez.
- **Em Configurações:** versão atual e o botão **🔄 Procurar atualização**.
- **Para lançar uma versão:**
  1. Edite `public/versao.json` (versão, código +1, novidades).
  2. Gere o APK e copie para `downloads/DublaBrasilAI.apk`.
  3. Envie ao GitHub. O Netlify publica e todos recebem o aviso.
- Teste: `node testes/e2e-atualizacao.cjs`.

## Versão 2.9: Cakto automática e Ajuda

- **Cakto → Supabase:**
  - Pagamento aprovado ou renovado: Premium por 32 dias a partir do aviso. Avisos repetidos não somam.
  - Cancelamento: o Premium vale até o fim do período pago.
  - Reembolso ou chargeback: o Premium acaba na hora.
  - Quem pagou antes de criar a conta recebe o Premium ao criar a conta com o mesmo e-mail (gatilho em
    `auth.users`).
- **Arquivos:**
  - SQL: `supabase/cakto-e-ajuda.sql`. As funções `cakto_aplicar` e `cakto_recusado` só podem ser chamadas
    pela chave de serviço.
  - Edge Function: `supabase/functions/cakto/index.ts`, sem dependências. Ela confere o `secret` do aviso (ou
    `?segredo=` no endereço) com o segredo `CAKTO_SECRET` e guarda tudo em `pagamentos_log`, sem o segredo.
    Precisa de "Enforce JWT verification" desligado.
- **Endereço do webhook:** `https://<projeto>.supabase.co/functions/v1/cakto`
- **Admin → ⭐ Assinantes → 💳 Avisos da Cakto:** os últimos 50 avisos e o que foi feito com cada um.
- **Ajuda (❓ no topo, `#/ajuda`):**
  - A pessoa escolhe o assunto e escreve. Vão junto a versão e o aparelho.
  - Limite de 5 mensagens por dia. A resposta aparece em "Minhas mensagens".
  - O admin vê o número de mensagens novas no botão Admin e responde e resolve em **Admin → 💬 Mensagens**.
- **Testes:** `node testes/e2e-ajuda.cjs`. As regras do SQL e a função foram testadas no Postgres local.

## Versão 3.0: sinal de fala e rascunho do editor

- **Estúdio, na onda da fala:** marcas **▶ FALE** (verde) e **PARE ■** (vermelha). O som original fora da fala
  (por exemplo, a fala de outro personagem) fica cinza.
- **Estúdio, faixa de sinal acima da onda:** "Comece no traço verde e pare no vermelho" quando está parado.
  Ao gravar ou ouvir, passa por **⏳ Prepare-se (fale em X s)**, **🎙️ FALE AGORA (faltam X s)** com barra, e
  **✋ PARE**.
- **Editor, rascunho automático** (`src/rascunho.ts`, loja `rascunhos` no IndexedDB, versão 3):
  - guarda tudo 0,8 s depois de cada mudança: cena, falas, personagens, fotos, capa, e o vídeo e a trilha à
    parte, só quando mudam;
  - ao voltar, aparece **"📝 Você tem uma edição não salva" → ↩ Retomar edição / Descartar**;
  - a Administração mostra **"📝 Vídeo novo em edição"**;
  - salvar a cena apaga o rascunho.
- **Testes:** `node testes/e2e-sinal.cjs` e `node testes/e2e-rascunho.cjs`.
