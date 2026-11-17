import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.dublabrasil.app",
  appName: "Dubla Brasil AI",
  webDir: "dist",
  backgroundColor: "#08021f",
  android: {
    // Permite tocar o áudio do vídeo sem toque prévio (necessário para a contagem e a gravação).
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#08021f",
  },
};

export default config;
