// Preferências da pessoa, guardadas só neste navegador.
import { useEffect, useState } from "react";

export interface Configuracoes {
  /** deviceId do microfone escolhido ("" = padrão do sistema). */
  microfoneId: string;
  /** Compensação de atraso da gravação, em ms (positivo = adianta a voz). */
  latenciaMs: number;
  /** Quanto tempo o vídeo toca antes da sua fala começar. */
  preRollMs: number;
  /** Volume do áudio original durante as suas falas, quando a cena não tem trilha de fundo (0 a 1). */
  volumeOriginalNaMinhaFala: number;
  /** Volume da sua voz no resultado (0 a 2). */
  volumeVoz: number;
  mostrarLegendas: boolean;
  /** Tira do microfone o som que sai do alto-falante (evita eco quando não há fone de ouvido). */
  cancelamentoEco: boolean;
  /** Reduz ruídos constantes do ambiente durante a gravação. */
  reducaoRuido: boolean;
  /** Depois de gravar: corta graves de ruído, abafa o chiado nas pausas e equilibra o volume. */
  limparVoz: boolean;
  /** Depois de gravar: ajusta a voz no tempo para casar com a fala original (até 0,3 s). */
  alinharVoz: boolean;
  /** Grava a câmera frontal junto com a voz e mostra no cantinho do vídeo, como numa chamada. */
  usarCamera?: boolean;
  /** Versão das preferências (para ligar padrões novos em quem já usava o app). */
  versao?: number;
}

export const PADRAO: Configuracoes = {
  microfoneId: "",
  latenciaMs: 0,
  preRollMs: 2000,
  volumeOriginalNaMinhaFala: 0,
  volumeVoz: 1,
  mostrarLegendas: true,
  cancelamentoEco: true,
  reducaoRuido: true,
  limparVoz: true,
  alinharVoz: true,
  versao: 2,
};

const CHAVE = "dubla-brasil:config";
const ouvintes = new Set<(c: Configuracoes) => void>();

export function lerConfig(): Configuracoes {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (!salvo) return { ...PADRAO };
    const lido = JSON.parse(salvo) as Partial<Configuracoes>;
    // Versão 2: eco e ruído passam a vir ligados também para quem já tinha preferências salvas.
    if ((lido.versao ?? 1) < 2) Object.assign(lido, { cancelamentoEco: true, reducaoRuido: true, limparVoz: true, alinharVoz: true, versao: 2 });
    return { ...PADRAO, ...lido };
  } catch {
    return { ...PADRAO };
  }
}

export function salvarConfig(parcial: Partial<Configuracoes>) {
  const nova = { ...lerConfig(), ...parcial };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(nova));
  } catch {
    /* navegação privada: segue só na memória */
  }
  ouvintes.forEach((f) => f(nova));
}

export function useConfig(): [Configuracoes, (p: Partial<Configuracoes>) => void] {
  const [c, setC] = useState(lerConfig);
  useEffect(() => {
    ouvintes.add(setC);
    return () => void ouvintes.delete(setC);
  }, []);
  return [c, salvarConfig];
}
