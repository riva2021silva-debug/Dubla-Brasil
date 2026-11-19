// Aviso de espaço (só para o administrador): quando os arquivos do servidor chegam perto do limite do plano,
// o app avisa para usar o "🧹 Liberar espaço". O tamanho real vem da função admin_uso_armazenamento
// (supabase/uso-armazenamento.sql); sem ela, avisa pela quantidade de dubs antigos e sem curtidas.
import { useEffect, useState } from "react";
import { supabase } from "./nuvem";
import { listarParaLimpeza } from "./galeria";

export const GB = 1024 ** 3;
const CHAVE_PLANO = "dubla-brasil:limite-espaco";
/** Limite do plano do Supabase: grátis = 1 GB; Pro = 100 GB. */
export function limiteDoPlano(): number {
  try {
    return Number(localStorage.getItem(CHAVE_PLANO)) || GB;
  } catch {
    return GB;
  }
}
export function definirLimiteDoPlano(bytes: number) {
  try {
    localStorage.setItem(CHAVE_PLANO, String(bytes));
  } catch {
    /* sem armazenamento */
  }
  window.dispatchEvent(new Event(EVENTO_ESPACO));
}
export const EVENTO_ESPACO = "dubla:espaco-mudou";

export interface AvisoEspaco {
  /** Bytes usados (null = o servidor ainda não tem a função de medir). */
  usados: number | null;
  limite: number;
  /** Fração usada (0 a 1), quando se sabe. */
  fracao: number | null;
  /** Dubs que o "Liberar espaço" apagaria. */
  candidatos: number;
  /** Precisa avisar? */
  avisar: boolean;
  texto: string;
}

const PORCENTAGEM_AVISO = 0.7;
const CANDIDATOS_AVISO = 10;

export async function verificarEspaco(): Promise<AvisoEspaco> {
  const limite = limiteDoPlano();
  let usados: number | null = null;
  const { data, error } = await supabase.rpc("admin_uso_armazenamento");
  if (!error && Array.isArray(data)) usados = (data as { bytes: number }[]).reduce((t, x) => t + Number(x.bytes || 0), 0);
  const candidatos = await listarParaLimpeza(60, 2).then((l) => l.length).catch(() => 0);
  const fracao = usados === null ? null : usados / limite;
  const avisar = fracao !== null ? fracao >= PORCENTAGEM_AVISO : candidatos >= CANDIDATOS_AVISO;
  const mb = (b: number) => (b >= GB ? `${(b / GB).toFixed(1).replace(".", ",")} GB` : `${Math.round(b / 1024 / 1024)} MB`);
  const texto =
    fracao !== null
      ? `O espaço do servidor está em ${Math.round(fracao * 100)}% (${mb(usados!)} de ${mb(limite)}).${candidatos ? ` Dá para apagar ${candidatos} ${candidatos === 1 ? "dub antigo" : "dubs antigos"} sem curtidas.` : ""}`
      : `Há ${candidatos} dubs antigos e sem curtidas ocupando espaço no servidor.`;
  return { usados, limite, fracao, candidatos, avisar, texto };
}

/** Para o administrador: confere ao abrir e a cada 30 minutos. */
export function useAvisoEspaco(ehAdmin: boolean): AvisoEspaco | null {
  const [aviso, setAviso] = useState<AvisoEspaco | null>(null);
  useEffect(() => {
    if (!ehAdmin) {
      setAviso(null);
      return;
    }
    let vivo = true;
    const conferir = () => void verificarEspaco().then((a) => vivo && setAviso(a)).catch(() => {});
    conferir();
    const t = setInterval(conferir, 30 * 60_000);
    window.addEventListener(EVENTO_ESPACO, conferir);
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener(EVENTO_ESPACO, conferir);
    };
  }, [ehAdmin]);
  return aviso;
}
