// Cenas de exemplo que vêm com o app (conteúdo original, gerado por scripts/gerar-exemplo.sh).
import type { Cena } from "./tipos";

const base = import.meta.env.BASE_URL;

export const CENAS_EXEMPLO: Cena[] = [
  {
    id: "exemplo-capivara-tucano",
    titulo: "Cadê meu chinelo?",
    descricao: "A Capivara procura o chinelo e o Tucano sabe exatamente onde ele está.",
    idioma: "Português (Brasil)",
    duracaoMs: 20000,
    video: { tipo: "url", url: `${base}exemplos/capivara-tucano/video.mp4` },
    fundo: { tipo: "url", url: `${base}exemplos/capivara-tucano/fundo.m4a` },
    personagens: [
      { id: "capivara", nome: "Capivara", cor: "#facc15" },
      { id: "tucano", nome: "Tucano", cor: "#38bdf8" },
    ],
    falas: [
      { id: "f1", personagemId: "capivara", texto: "Tucano, você viu meu chinelo?", inicioMs: 1000, fimMs: 3200 },
      { id: "f2", personagemId: "tucano", texto: "Vi sim. Tá no telhado, como sempre.", inicioMs: 3800, fimMs: 6200 },
      { id: "f3", personagemId: "capivara", texto: "No telhado? Quem coloca chinelo no telhado?", inicioMs: 6800, fimMs: 9400 },
      { id: "f4", personagemId: "tucano", texto: "Sua avó. Pra você não sair de casa.", inicioMs: 10000, fimMs: 12600 },
      { id: "f5", personagemId: "capivara", texto: "Então eu fico aqui. Passa o pão de queijo!", inicioMs: 13200, fimMs: 16000 },
      { id: "f6", personagemId: "tucano", texto: "Acabou. Mas tem café.", inicioMs: 16600, fimMs: 18600 },
    ],
    criadaEm: Date.UTC(2026, 10, 17),
    atualizadaEm: Date.UTC(2026, 10, 17),
    exemplo: true,
  },
];

export const capaExemplo = (c: Cena) =>
  c.exemplo ? `${base}exemplos/${c.id.replace("exemplo-", "")}/capa.jpg` : null;
