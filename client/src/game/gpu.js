// Jaká je grafická karta: podle toho se zvolí výchozí Grafika (nízká / střední / vysoká), když ji hráč nenastaví sám.
// Bez vedlejších účinků při načtení (jen funkce): používá ji prefs.js a okno Nastavení.

let cached = null;
/** Název grafické karty z WebGL (např. „ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 …)“), nebo '' když nejde zjistit. */
export function gpuName() {
  if (cached !== null) return cached;
  cached = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      cached = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { cached = ''; }
  return cached;
}

/**
 * Druh grafiky podle jména: 'software' (SwiftShader, llvmpipe – kreslí procesor), 'integrated' (Intel, AMD „Radeon Graphics“
 * v procesoru, Apple, mobilní čipy) nebo 'discrete' (samostatná karta NVIDIA / AMD Radeon RX…).
 */
export function gpuClass(name = gpuName()) {
  const n = name.toLowerCase();
  if (!n || /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/.test(n)) return 'software';
  if (/nvidia|geforce|quadro|rtx|gtx/.test(n)) return 'discrete';
  if (/radeon\s*(rx|pro|r9|r7|vii)|radeon\(tm\) rx|\brx\s*\d{3,4}/.test(n)) return 'discrete';
  if (/arc\(tm\) a\d|intel.*arc a\d/.test(n)) return 'discrete';
  return 'integrated'; // Intel (U)HD/Iris, AMD Radeon Graphics / Vega v procesoru, Apple, Adreno, Mali…
}

/**
 * Slabá integrovaná grafika: obyčejná Intel (U)HD Graphics (starší a levné školní notebooky). Iris, Xe a Arc mezi ně nepatří.
 * Střední grafika na ní má méně trávy, levnější koruny stromů, řidší překreslování stínů a víc zmenšuje rozlišení (render/look.js).
 */
export function gpuWeak(name = gpuName()) {
  const n = name.toLowerCase();
  return /intel/.test(n) && /\b(u?hd) graphics/.test(n) && !/iris|\bxe\b|\barc\b/.test(n);
}

/** Doporučená Grafika pro tento počítač: software → nízká, integrovaná → střední, samostatná karta → vysoká. */
export function autoQuality(touch = false) {
  if (touch) return 'low';
  return { software: 'low', integrated: 'medium', discrete: 'high' }[gpuClass()];
}
