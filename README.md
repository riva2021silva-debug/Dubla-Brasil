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

## Administração

O app começa sem cenas. Em **Área do administrador** (link no rodapé), crie um PIN e use **Adicionar vídeo**
para cadastrar cenas: vídeo, trilha de fundo opcional, personagens e falas. Só cenas marcadas como
**Publicada no app** aparecem para os usuários. O PIN protege a área neste aparelho.

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
