// Modelo de dados do Dubla Brasil.

/** Onde está uma mídia: arquivo empacotado no app (url) ou enviado pelo usuário (blob no IndexedDB). */
export type FonteMidia =
  | { tipo: "url"; url: string }
  | { tipo: "blob"; chave: string };

export interface Personagem {
  id: string;
  nome: string;
  cor: string;
}

export interface Fala {
  id: string;
  personagemId: string;
  texto: string;
  inicioMs: number;
  fimMs: number;
}

export interface Cena {
  id: string;
  titulo: string;
  descricao: string;
  idioma: string;
  duracaoMs: number;
  /** Vídeo com o áudio original (vozes + música). */
  video: FonteMidia;
  /** Trilha de fundo opcional: música e efeitos SEM vozes. */
  fundo: FonteMidia | null;
  personagens: Personagem[];
  falas: Fala[];
  criadaEm: number;
  atualizadaEm: number;
  /** Cenas de exemplo que vêm com o app não podem ser editadas nem excluídas. */
  exemplo?: boolean;
}

export interface Tomada {
  /** Áudio WAV gravado pelo microfone. */
  audio: Blob;
  /** Momento da cena (ms) em que a primeira amostra do áudio deve tocar. */
  inicioMs: number;
  duracaoMs: number;
  gravadaEm: number;
}

export interface Dub {
  id: string;
  cenaId: string;
  /** Personagens que a pessoa dublou. */
  papeis: string[];
  tomadas: Record<string, Tomada>;
  nome: string;
  criadoEm: number;
  atualizadoEm: number;
}
