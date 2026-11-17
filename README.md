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
