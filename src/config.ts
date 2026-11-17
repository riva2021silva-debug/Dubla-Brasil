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
  /** Desligar o cancelamento de eco preserva a qualidade da voz; use fones de ouvido. */
  cancelamentoEco: boolean;
}

export const PADRAO: Configuracoes = {
  microfoneId: "",
  latenciaMs: 0,
  preRollMs: 2000,
  volumeOriginalNaMinhaFala: 0,
  volumeVoz: 1,
  mostrarLegendas: true,
  cancelamentoEco: false,
};

const CHAVE = "dubla-brasil:config";
const ouvintes = new Set<(c: Configuracoes) => void>();

export function lerConfig(): Configuracoes {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo ? { ...PADRAO, ...JSON.parse(salvo) } : { ...PADRAO };
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
