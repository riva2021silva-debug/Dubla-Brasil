import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// Versão do motor de IA (ONNX Runtime) usada pela separação automática de falas.
const versaoOrt = JSON.parse(readFileSync(new URL('./node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8')).version as string

// O motor de IA (27 MB) só é usado pelo administrador: em vez de ir dentro do app,
// ele é baixado da CDN na primeira vez que a função é usada.
function semMotorDeIaNoPacote(): Plugin {
  return {
    name: 'sem-motor-de-ia-no-pacote',
    generateBundle(_, pacote) {
      for (const nome of Object.keys(pacote)) if (/ort-wasm.*\.(wasm|mjs)$/.test(nome)) delete pacote[nome]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), semMotorDeIaNoPacote()],
  define: { __VERSAO_ORT__: JSON.stringify(versaoOrt) },
  worker: { format: 'es', plugins: () => [semMotorDeIaNoPacote()] },
})
