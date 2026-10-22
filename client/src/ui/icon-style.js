// Ikony předmětů ve stylu Hytale (grafický update): tmavý obrys kolem tvaru, světlo shora (přechod), světlá horní
// a levá hrana, tmavší spodní a pravá. Kreslí se jen pro okna a lištu (kopie obrázku); předmět v ruce a 3D ikony bloků zůstávají, jak jsou.
// Bez vedlejších účinků při načtení (ikona se upraví až při prvním zobrazení a uloží se).
import { ICONS } from '../render/icons.js';

const cache = new Map();
/** Adresa obrázku ikony ve stylu Hytale (hladké 3D ikony bloků beze změny). */
export function styledIconUrl(id) {
  const I = ICONS[id];
  if (!I || I.smooth || !I.canvas) return I?.url;
  let u = cache.get(id);
  if (u && u.src === I.url) return u.url;
  u = { src: I.url, url: stylize(I.canvas) };
  cache.set(id, u);
  return u.url;
}

function stylize(src) {
  const n = src.width, m = src.height, P = 1; // o pixel větší plátno, ať se obrys vejde
  const c = document.createElement('canvas');
  c.width = n + 2 * P; c.height = m + 2 * P;
  const g = c.getContext('2d');
  g.drawImage(src, P, P);
  const W = c.width, H = c.height, img = g.getImageData(0, 0, W, H), d = img.data, out = new Uint8ClampedArray(d);
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 40) { // obrys: průhledný pixel vedle tvaru
      if (a(x - 1, y) > 40 || a(x + 1, y) > 40 || a(x, y - 1) > 40 || a(x, y + 1) > 40) { out[i] = 22; out[i + 1] = 16; out[i + 2] = 20; out[i + 3] = 235; }
      continue;
    }
    // hrany tvaru (o pixel dovnitř, starý tmavý obrys ikon se nezesvětlí): nahoře a vlevo světlejší, dole a vpravo tmavší
    const lit = d[i] + d[i + 1] + d[i + 2] >= 150, out1 = (dx, dy) => a(x + dx, y + dy) < 40 || a(x + 2 * dx, y + 2 * dy) < 40;
    const edge = !lit ? 1 : out1(0, -1) || out1(-1, 0) ? 1.3 : out1(0, 1) || out1(1, 0) ? 0.7 : 1;
    const k = edge * (1.14 - 0.3 * (y / H)); // světlo shora: nahoře světlejší, dole tmavší
    for (let j = 0; j < 3; j++) out[i + j] = Math.min(255, d[i + j] * k + (edge > 1 ? 22 : 0));
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
