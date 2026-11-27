import { useEffect, useState } from "react";
import { aplicarFonte, fonteSalva, type TamanhoFonte } from "@/lib/font-scale";

/** Mantém o estado igual entre o botão do topo e Configurações. */
export function useTamanhoFonte(): [TamanhoFonte, (t: TamanhoFonte) => void] {
  const [tamanho, setTamanho] = useState<TamanhoFonte>("normal");
  useEffect(() => {
    setTamanho(fonteSalva());
    const ouvir = (e: Event) => setTamanho((e as CustomEvent<TamanhoFonte>).detail);
    window.addEventListener("pattyone:fonte", ouvir);
    return () => window.removeEventListener("pattyone:fonte", ouvir);
  }, []);
  return [tamanho, aplicarFonte];
}
