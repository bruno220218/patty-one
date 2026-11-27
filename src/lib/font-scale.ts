/**
 * Tamanho da letra escolhido pela pessoa (botão "A" do topo e Configurações › Aparência).
 * Fica salvo neste navegador e vira `data-fonte` no <html>; o CSS (src/styles.css) multiplica
 * a escala adaptativa por 1 / 1,1 / 1,2. "normal" = nada salvo.
 */
export const FONT_STORAGE_KEY = "pattyone:fonte";

export type TamanhoFonte = "normal" | "grande" | "maior";

export const TAMANHOS_FONTE: { value: TamanhoFonte; label: string; amostra: string }[] = [
  { value: "normal", label: "Normal", amostra: "text-sm" },
  { value: "grande", label: "Grande", amostra: "text-base" },
  { value: "maior", label: "Maior", amostra: "text-lg" },
];

/** Roda antes de pintar a tela, para não piscar no tamanho errado. */
export const FONT_INIT_SCRIPT = `(function(){try{var f=localStorage.getItem('${FONT_STORAGE_KEY}');if(f==='grande'||f==='maior'){document.documentElement.dataset.fonte=f}}catch(e){}})();`;

export function fonteSalva(): TamanhoFonte {
  try {
    const f = localStorage.getItem(FONT_STORAGE_KEY);
    return f === "grande" || f === "maior" ? f : "normal";
  } catch {
    return "normal";
  }
}

export function aplicarFonte(tamanho: TamanhoFonte) {
  const html = document.documentElement;
  if (tamanho === "normal") delete html.dataset["fonte"];
  else html.dataset["fonte"] = tamanho;
  try {
    if (tamanho === "normal") localStorage.removeItem(FONT_STORAGE_KEY);
    else localStorage.setItem(FONT_STORAGE_KEY, tamanho);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("pattyone:fonte", { detail: tamanho }));
}
