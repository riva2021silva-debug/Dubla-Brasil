// Histórico de novidades do app (tela "🆕 Novidades"). A mais nova fica em cima.
export interface Versao {
  versao: string;
  quando?: string;
  itens: string[];
}

export const NOVIDADES: Versao[] = [
  {
    versao: "5.8",
    quando: "novembro de 2026",
    itens: [
      "🎬 Nota da dublagem: cada fala ganha uma nota (falou junto com o personagem, começou na hora, duração e volume) e o resultado mostra a nota final",
      "🗂️ Categorias na tela de Cenas: Ação, Comédia, Anime, Terror… e filtro por idioma",
      "🆕 Esta tela de Novidades",
    ],
  },
  {
    versao: "5.7",
    quando: "novembro de 2026",
    itens: [
      "⏳ Cenas novas são preparadas e publicadas sozinhas: vídeo leve, vozes separadas pela IA e publicação, tudo em segundo plano",
      "Sem travadas: a IA pausa enquanto você dubla e continua depois",
      "Dublando todos os personagens, a voz original não volta entre as falas",
    ],
  },
  {
    versao: "5.6",
    itens: ["🎙️ Se o microfone escolhido for desconectado, o app volta sozinho para o do celular"],
  },
  {
    versao: "5.5",
    itens: ["🔇 “Só a minha voz” já vem ligado: no vídeo final fica só a voz de quem dublou"],
  },
  {
    versao: "5.3 e 5.4",
    itens: [
      "🎧 Dublagem de ouvido: sem legendas — ouça o personagem e fale do seu jeito",
      "⏳ Contagem no vídeo até a próxima fala (“🎙️ Sua vez em 3”)",
      "Chave para tirar todas as vozes originais do resultado",
    ],
  },
  {
    versao: "5.0 a 5.2",
    itens: [
      "🎤 Modo Cantar: cante músicas com o instrumental e ganhe nota de afinação",
      "📱 Estúdio numa tela só no celular",
      "🔊 Som que não estoura e voz equilibrada com a música",
      "📲 Aviso no site para baixar o app",
    ],
  },
  {
    versao: "4.0 a 4.6",
    itens: [
      "🎭 Dueto: dublagem junto com outra pessoa da galeria",
      "🔔 Notificações de curtidas, comentários e duetos",
      "🎙️ Gravação fala por fala, cada um na sua vez, com contagem 3, 2, 1",
      "⚡ Vídeos leves que não travam e trilhas de fundo geradas pela IA",
      "Envio que tenta de novo sozinho quando a internet cai",
    ],
  },
  {
    versao: "1.0 a 3.9",
    itens: [
      "🎬 Estúdio de dublagem, resultado em vídeo e galeria para publicar",
      "🦜 Modo Imitação e o minijogo Voz no Alvo",
      "📷 Câmera no estúdio, estilo chamada de vídeo",
      "⭐ Plano Premium",
      "🤖 IA que separa as falas da cena sozinha",
    ],
  },
];
