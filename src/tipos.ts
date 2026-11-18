// Modelo de dados do Dubla Brasil.

/** Onde está uma mídia: arquivo empacotado no app (url) ou enviado pelo usuário (blob no IndexedDB). */
export type FonteMidia =
  | { tipo: "url"; url: string }
  | { tipo: "blob"; chave: string };

export interface Personagem {
  id: string;
  nome: string;
  cor: string;
  /** Endereço da foto do rosto (gerada do vídeo ou enviada pelo administrador). */
  foto?: string | null;
  /** Caminho da foto no servidor (pasta "midias"). */
  fotoPath?: string | null;
}

export interface Fala {
  id: string;
  personagemId: string;
  texto: string;
  inicioMs: number;
  fimMs: number;
  /** Texto no idioma original (quando a legenda foi traduzida automaticamente). */
  original?: string;
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
  /** Só cenas publicadas aparecem para quem usa o app. Ausente = publicada (cenas antigas). */
  publicada?: boolean;
  /** Imagem de capa gerada a partir do vídeo. */
  capa?: FonteMidia | null;
  /** Caminhos dos arquivos no servidor (pasta "midias"), quando a cena vem do servidor. */
  caminhos?: { video: string; fundo: string | null; capa: string | null; rostos?: Record<string, string> };
}

export const estaPublicada = (c: Cena) => c.publicada !== false;

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
  /** Vídeos da câmera gravados junto com as falas (aparecem no cantinho, como numa chamada). */
  cameras?: TrechoCamera[];
  /** Dueto: dublando junto com um dub da galeria. O vídeo publicado (com a voz da outra pessoa) vira a base. */
  base?: DuetoBase;
  nome: string;
  criadoEm: number;
  atualizadoEm: number;
}

export interface DuetoBase {
  publicacaoId: string;
  /** Endereço do vídeo publicado na galeria. */
  video: string;
  apelido: string;
  /** Nomes dos personagens que já têm voz no vídeo publicado. */
  papeis: string[];
}

/** Um trecho gravado pela câmera frontal durante a dublagem. */
export interface TrechoCamera {
  id: string;
  video: Blob;
  /** Momento da cena (ms) em que o primeiro quadro deve aparecer. */
  inicioMs: number;
  duracaoMs: number;
  /** Falas gravadas neste trecho (regravar uma delas substitui o trecho). */
  falas: string[];
}

/** Som curto para o Modo Imitação (cadastrado pelo administrador). */
export interface Som {
  id: string;
  titulo: string;
  categoria: string;
  emoji: string;
  midia: FonteMidia;
  duracaoMs: number;
  publicada: boolean;
  criadoEm: number;
  /** Caminho do arquivo no servidor (pasta "midias"). */
  caminho?: string;
}

/** Melhor tentativa da pessoa para um som. */
export interface Imitacao {
  somId: string;
  audio: Blob;
  nota: number;
  ritmo: number;
  entonacao: number;
  tentativas: number;
  atualizadaEm: number;
}

export const CATEGORIAS_SOM = ["Bordões", "Animais", "Efeitos", "Música", "Personagens", "Outros"];
