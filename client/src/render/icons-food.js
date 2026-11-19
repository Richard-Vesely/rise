// Ikony jídla, surovin, nádobí, ryb a nábytku.
import '../world/dig.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { clamp, hash2 } from '../../../shared/util.js';
import { ICONS, iconCanvas } from './icons.js';

// ============================================================ ikony jídla, surovin a nádobí
// Kreslí se tvary (elipsy, obdélníky) po pixelech 16×16 a nakonec se přidá tmavý obrys jako v Minecraftu.
(() => {
  const canvas16 = () => { const c = iconCanvas(); c.width = c.height = 16; return c; };
  const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inR = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // Barva se světlem zleva nahoře (k > 1 světlejší)
  const tone = (h, k) => { const c = hex(h); return `rgb(${c.map((v) => clamp(v * k, 0, 255) | 0).join(',')})`; };
  const lit = (h, x, y, cx = 8, cy = 8) => tone(h, 1.12 - ((x - cx) + (y - cy)) * 0.035);
  const noise = (x, y, s = 0) => hash2(Math.floor(x) * 7 + s, Math.floor(y) * 13 - s);
  function paint(fn, outline = true) {
    const c = canvas16(), g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x + 0.5, y + 0.5); if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    if (outline) {
      const d = g.getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
      g.fillStyle = 'rgba(24,16,12,0.9)';
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  // Talíř a mísa jako podklad hotových jídel
  const plate = (x, y) => (inE(x, y, 8, 10.5, 7.3, 4.2) ? (inE(x, y, 8, 10.3, 5.6, 3.0) ? '#eceef4' : lit('#c4c8d2', x, y)) : null);
  const dish = (food) => paint((x, y) => food(x, y) || plate(x, y));
  const bowlShape = (x, y) => (y >= 8 && inE(x, y, 8, 8, 7, 6.5) ? lit('#8a5a30', x, y) : null);
  const inBowl = (col, extra) => paint((x, y) => (extra && extra(x, y)) || (inE(x, y, 8, 8.2, 6.2, 1.7) ? lit(col, x, y) : bowlShape(x, y)));
  const bucket = (fill) => paint((x, y) => {
    const half = 4.2 + (y - 4) * 0.12;
    if (y >= 4 && y <= 14 && Math.abs(x - 8) <= half) {
      if (fill && y <= 5.6) return lit(fill, x, y);
      return lit(y % 4 < 1 ? '#7a808a' : '#aab0ba', x, y);
    }
    if (y < 4 && Math.abs(Math.hypot(x - 8, (y - 4) * 1.3) - 4.6) < 0.6) return '#5a606a'; // ucho
    return null;
  });

  const icons = {
    egg: paint((x, y) => (inE(x, y, 8, 9, 3.8, 4.8) ? lit('#f2e6d0', x, y) : null)),
    raw_chicken: paint((x, y) => (inE(x, y, 7, 9.5, 4.6, 3.8) ? lit('#f0a8a0', x, y) : inR(x, y, 10, 4, 12, 7.5) ? '#f4ecdc' : inE(x, y, 12.5, 3.8, 1.6, 1.2) ? '#f4ecdc' : null)),
    raw_beef: paint((x, y) => (inE(x, y, 8, 9, 6, 4.2) ? (noise(x, y, 3) > 0.82 || (x + y * 2) % 7 < 0.8 ? '#f4e0d0' : lit('#c8282a', x, y)) : null)),
    bucket: bucket(null),
    water_bucket: bucket('#3a7ae0'),
    milk_bucket: bucket('#f6f6f2'),
    wheat: paint((x, y) => {
      for (const sx of [5.5, 8, 10.5]) {
        if (Math.abs(x - sx) < 0.6 && y > 6 && y < 15) return '#8a7a3a';
        if (inE(x, y, sx, 4.8 - Math.abs(sx - 8) * 0.3, 1.4, 3.2)) return lit('#e8c450', x, y);
      }
      return null;
    }),
    wheat_seeds: paint((x, y) => ([[5, 6], [9, 5], [11, 9], [6, 10], [8.5, 12], [4, 13]].some(([a, b]) => inE(x, y, a, b, 1.2, 0.9)) ? lit('#c8a85a', x, y) : null)),
    tomato_seeds: paint((x, y) => ([[5, 6], [9, 5], [11, 9], [6, 10], [8.5, 12], [4, 13]].some(([a, b]) => inE(x, y, a, b, 1.1, 1.1)) ? lit('#f0e0a0', x, y) : null)),
    tomato: paint((x, y) => {
      if (inR(x, y, 7, 2, 9, 5) && Math.abs(x - 8) + Math.abs(y - 4.5) < 2.6) return '#3a8a2a';
      return inE(x, y, 8, 9.5, 5.6, 4.8) ? lit('#e03020', x, y) : null;
    }),
    potato: paint((x, y) => (inE(x, y, 8, 9, 6, 4.2) ? (noise(x, y, 5) > 0.9 ? '#6a4a2a' : lit('#c89a5a', x, y)) : null)),
    apple: paint((x, y) => {
      if (inR(x, y, 7.6, 2, 8.6, 5)) return '#5a3a1a';
      if (inE(x, y, 10.5, 3.5, 2, 1)) return '#4aa83a';
      return inE(x, y, 8, 9.5, 5.4, 5) ? lit('#d8202a', x, y) : null;
    }),
    mushroom: paint((x, y) => {
      if (inE(x, y, 8, 6.5, 6, 3.6) && y < 8.5) return inE(x, y, 6, 5.5, 1, 0.8) || inE(x, y, 10, 5, 0.9, 0.8) || inE(x, y, 8.2, 7.4, 0.9, 0.7) ? '#f4f0e8' : lit('#c8402a', x, y);
      return inR(x, y, 6.5, 8.5, 9.5, 13.5) ? lit('#eee2c8', x, y) : null;
    }),
    salt: paint((x, y) => {
      if (inE(x, y, 8, 4.5, 3.4, 1.6)) return lit('#9aa0aa', x, y);
      return inR(x, y, 4.6, 5, 11.4, 14) ? lit('#f6f6f8', x, y) : null;
    }),
    flour: paint((x, y) => {
      if (inR(x, y, 6, 2.5, 10, 4.5)) return '#a88a5a';
      return inE(x, y, 8, 10, 5.6, 5.4) ? lit('#eadcc0', x, y) : null;
    }),
    dough: paint((x, y) => (inE(x, y, 8, 10, 6, 4) ? lit('#f0dca8', x, y) : null)),
    pasta: paint((x, y) => {
      if (inR(x, y, 4, 7, 12, 8.4)) return '#c8402a';
      return inR(x, y, 5, 2, 11, 14.5) && Math.floor(x) % 2 === 0 ? lit('#f2d27a', x, y) : null;
    }),
    butter: paint((x, y) => (inR(x, y, 3, 6, 13, 12) ? (y < 7.5 ? '#fff4b0' : lit('#f6dc6a', x, y)) : null)),
    tomato_sauce: inBowl('#c8281e'),
    chicken_soup: inBowl('#e8c060', (x, y) => (inE(x, y, 6, 8, 1, 0.6) || inE(x, y, 10, 8.4, 1.1, 0.6) ? '#f0d8b0' : inE(x, y, 8.2, 7.8, 0.8, 0.5) ? '#e07a2a' : null)),
    mashed_potatoes: dish((x, y) => (inE(x, y, 8, 9, 4.6, 3) ? (inR(x, y, 7, 6.5, 9, 7.6) ? '#fff070' : lit('#f2e2b0', x, y)) : null)),
    fried_egg: dish((x, y) => (inE(x, y, 8.6, 9.2, 1.8, 1.4) ? lit('#ffb020', x, y) : inE(x, y, 8, 9.6, 4.8, 2.8) ? '#fbfbf8' : null)),
    scrambled_eggs: dish((x, y) => (inE(x, y, 8, 9.6, 4.8, 2.7) && noise(x, y, 9) > 0.15 ? (noise(x, y, 4) > 0.5 ? '#ffd84a' : '#f2c030') : null)),
    spaghetti: dish((x, y) => {
      if (inE(x, y, 9.5, 7.6, 1.1, 0.6)) return '#3aa83a'; // bazalka
      if (inE(x, y, 8, 8.8, 2.6, 1.6)) return noise(x, y, 2) > 0.8 ? '#f08a6a' : '#c8281e'; // omáčka
      if (inE(x, y, 8, 9.4, 5, 2.8)) return Math.sin(x * 2.2 + y * 1.4) > 0.1 ? '#f2d27a' : '#d8b458';
      return null;
    }),
    pancakes: dish((x, y) => (inE(x, y, 8, 7.4, 4.8, 1.6) ? '#f0c070' : inE(x, y, 8, 8.8, 5, 1.8) ? '#e0a050' : inE(x, y, 8, 10.2, 5.2, 1.8) ? '#d09040' : null)),
    berry_pancakes: dish((x, y) => ([[6.5, 7.2], [8.5, 6.8], [10, 7.6], [7.6, 8]].some(([a, b]) => inE(x, y, a, b, 0.9, 0.8)) ? '#3a4ab8' : inE(x, y, 8, 7.4, 4.8, 1.6) ? '#f0c070' : inE(x, y, 8, 8.8, 5, 1.8) ? '#e0a050' : inE(x, y, 8, 10.2, 5.2, 1.8) ? '#d09040' : null)),
    bread: paint((x, y) => (inE(x, y, 8, 9.5, 6.4, 4) ? ((Math.abs((x - y * 0.6) % 3.2) < 0.5 && y < 9) ? '#f4d89a' : lit('#c88a3a', x, y)) : null)),
    steak: dish((x, y) => (inE(x, y, 8, 9.4, 4.6, 2.6) ? (inE(x, y, 8, 9.4, 4.6, 2.6) && !inE(x, y, 7.6, 9.4, 3.8, 2) ? '#f2e2c8' : (Math.abs((x + y) % 3) < 0.6 ? '#3a1a0a' : lit('#7a3a1a', x, y))) : null)),
    roast_chicken: dish((x, y) => (inR(x, y, 11, 5.5, 13, 8) ? '#f4ecdc' : inE(x, y, 8, 9, 4.4, 2.8) ? lit('#d0882a', x, y) : null)),
    baked_potato: paint((x, y) => (inR(x, y, 7, 4.5, 9, 7.5) && inE(x, y, 8, 6.5, 2.2, 1.2) ? '#fff070' : inE(x, y, 8, 9, 6, 4.2) ? (inE(x, y, 8, 7.4, 3, 1.4) ? '#f4e2b0' : lit('#8a5a2a', x, y)) : null)),
    fries: paint((x, y) => {
      if (inR(x, y, 4, 8, 12, 14.5) && x - 4 > (y - 8) * -0.2) return lit('#d02a20', x, y);
      return inR(x, y, 5, 2, 11, 8) && Math.floor(x) % 2 === 1 && y > 2 + noise(x, 0, 6) * 2 ? lit('#f6d050', x, y) : null;
    }),
    mushroom_fry: dish((x, y) => (inE(x, y, 8, 9.4, 4.8, 2.7) ? (noise(x, y, 7) > 0.6 ? '#fff070' : lit('#8a5a2a', x, y)) : null)),
    fruit_salad: inBowl('#e8d8b0', (x, y) => {
      const n = noise(x, y, 11);
      if (y < 8.6 && inE(x, y, 8, 7.4, 5.6, 2.2)) return n > 0.66 ? '#d8202a' : n > 0.33 ? '#3a4ab8' : '#f0e0a0';
      return null;
    }),
    // nádobí
    knife: paint((x, y) => { // čepel nahoře vpravo, rukojeť dole vlevo
      if (Math.abs(x + y - 16) < 1.6 && x > 7 && x < 14) return lit('#e2e6ee', x, y);
      return Math.abs(x + y - 16) < 1.3 && x <= 7 && x > 2.5 ? '#5a3a1a' : null;
    }),
    pan: paint((x, y) => {
      if (inE(x, y, 6.5, 9.5, 5.2, 4.2)) return inE(x, y, 6.5, 9.3, 4, 3) ? '#3a3a40' : lit('#6a6a74', x, y);
      return Math.abs(y - (x - 11) * 0.8 - 7.5) < 0.9 && x > 11 && x < 15.5 ? '#2a2a30' : null;
    }),
    pot: paint((x, y) => {
      if (inR(x, y, 3, 6, 13, 14)) return lit(y < 7 ? '#8a909a' : '#5a606a', x, y);
      if (inR(x, y, 1, 7.5, 3, 9) || inR(x, y, 13, 7.5, 15, 9)) return '#3a3e46';
      if (inR(x, y, 4, 4, 12, 5.5)) return '#7a808a';
      return inR(x, y, 7, 2.5, 9, 4) ? '#3a3e46' : null;
    }),
    rolling_pin: paint((x, y) => {
      const d = Math.abs(y - (15 - x));
      if (d < 2.2 && x > 3.5 && x < 12.5) return lit('#e0c08a', x, y);
      return d < 0.8 && (x <= 3.5 || x >= 12.5) && x > 0.5 && x < 15.5 ? '#8a5a2a' : null;
    }),
    mill: paint((x, y) => {
      if (inR(x, y, 3, 7, 13, 14)) return lit(y < 9 ? '#9a6a3a' : '#7a4a22', x, y);
      if (inR(x, y, 7.4, 3, 8.6, 7)) return '#5a5a62';
      return inR(x, y, 8.6, 2.5, 13, 3.6) || inR(x, y, 12, 1.5, 13.4, 4) ? '#3a2a1a' : null;
    }),
    bowl: paint((x, y) => (inE(x, y, 8, 8.2, 6.2, 1.7) ? '#5a3a1a' : bowlShape(x, y))),
    whisk: paint((x, y) => {
      if (inR(x, y, 7.3, 9, 8.7, 15)) return '#5a3a1a';
      for (const rx of [1.5, 3, 4.3]) if (Math.abs(((x - 8) / rx) ** 2 + ((y - 5.5) / 4.5) ** 2 - 1) < 0.22 / rx * 3 && y < 9.5) return '#d8dce4';
      return null;
    }),
    hoe: paint((x, y) => {
      if (Math.abs(x + y - 17) < 1 && x > 2 && x < 11) return '#7a5430';
      return inR(x, y, 8, 2, 13.5, 4.2) || inR(x, y, 11.5, 4, 13.5, 6.5) ? lit('#9a9aa2', x, y) : null;
    }),
  };

  // Bloky jako 3D kostičky
  const tile16 = (fn) => { const c = canvas16(), g = c.getContext('2d'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = fn(x, y); g.fillRect(x, y, 1, 1); } return c; };
  const isoCube = (top, side) => {
    const c = iconCanvas();
    c.width = c.height = 32;
    const g = c.getContext('2d'), S = 16;
    g.imageSmoothingEnabled = false;
    const face = (img, a, b, cc, d, e, f, shade) => { g.setTransform(a / S, b / S, cc / S, d / S, e, f); g.drawImage(img, 0, 0); if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, S, S); } };
    face(top, 14, -7, 14, 7, 2, 8, 0);
    face(side, 14, 7, 0, 16, 2, 8, 0.25);
    face(side, 14, -7, 0, 16, 16, 15, 0.45);
    return c;
  };
  const n2 = (x, y, s) => 0.85 + hash2(x * 3 + s, y * 5 - s) * 0.3;
  icons.stove = isoCube(
    tile16((x, y) => (Math.hypot(x - 4.5, y - 4.5) < 2.6 || Math.hypot(x - 11, y - 11) < 2.6 ? '#1a1a1e' : tone('#5a5e66', n2(x, y, 1)))),
    tile16((x, y) => (y < 3 ? tone('#3a3e46', 1) : inR(x, y, 2, 5, 13, 13) ? (inR(x, y, 4, 7, 11, 11) ? '#2a1a12' : '#6a6e78') : tone('#8a8e96', n2(x, y, 2)))),
  );
  icons.well = isoCube(
    tile16((x, y) => (Math.hypot(x - 7.5, y - 7.5) < 4.5 ? tone('#3a7ae0', n2(x, y, 3)) : tone('#8a8a8a', n2(x, y, 4)))),
    tile16((x, y) => tone((y % 5 === 0 || (x + Math.floor(y / 5) * 4) % 8 === 0) ? '#5a5a5a' : '#9a9a96', n2(x, y, 5))),
  );
  for (const [id, c] of Object.entries(icons)) ICONS[id] = { canvas: c, url: c.toDataURL() };
})();

// ============================================================ ikony mas a nových jídel
(() => {
  const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inR = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lit = (h, x, y) => { const k = 1.12 - ((x - 8) + (y - 8)) * 0.035; return `rgb(${hex(h).map((v) => clamp(v * k, 0, 255) | 0).join(',')})`; };
  const noise = (x, y, s = 0) => hash2(Math.floor(x) * 7 + s, Math.floor(y) * 13 - s);
  function paint(fn) {
    const c = iconCanvas();
    c.width = c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x + 0.5, y + 0.5); if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    const d = g.getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    g.fillStyle = 'rgba(24,16,12,0.9)';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    return c;
  }
  const plate = (x, y) => (inE(x, y, 8, 10.5, 7.3, 4.2) ? (inE(x, y, 8, 10.3, 5.6, 3.0) ? '#eceef4' : lit('#c4c8d2', x, y)) : null);
  const dish = (food) => paint((x, y) => food(x, y) || plate(x, y));
  const bowl = (col, extra) => paint((x, y) => (extra && extra(x, y)) || (inE(x, y, 8, 8.2, 6.2, 1.7) ? lit(col, x, y) : y >= 8 && inE(x, y, 8, 8, 7, 6.5) ? lit('#8a5a30', x, y) : null));
  // Plátek masa: barva masa, tuk po okraji, mramorování
  const slab = (meat, fat, marble) => paint((x, y) => {
    if (!inE(x, y, 8, 9, 6.2, 4.4)) return null;
    if (!inE(x, y, 7.6, 9.2, 5.2, 3.6)) return lit(fat, x, y);
    return marble && noise(x, y, 3) > 0.84 ? fat : lit(meat, x, y);
  });
  const knedlik = (x, y, cx) => (inE(x, y, cx, 9.4, 1.9, 2.2) ? (noise(x, y, 8) > 0.8 ? '#e8dcc0' : '#f6f0e0') : null);
  const icons = {
    raw_mutton: slab('#d0606a', '#f4ece0', true),
    raw_pork: slab('#e8909a', '#fbf2ea', false),
    raw_venison: slab('#8a2228', '#e8d8c8', false),
    cooked_mutton: slab('#9a5a3a', '#e0c090', false),
    cooked_pork: slab('#c08050', '#f0d8a8', false),
    cooked_venison: slab('#5a2a1a', '#a87050', false),
    bone: paint((x, y) => {
      const t = (x + y) / 2;
      if (Math.abs(x - y) < 1.6 && t > 4 && t < 12) return lit('#f2ead8', x, y);
      return inE(x, y, 3.5, 4.8, 1.6, 1.6) || inE(x, y, 4.8, 3.5, 1.6, 1.6) || inE(x, y, 12.5, 11.2, 1.6, 1.6) || inE(x, y, 11.2, 12.5, 1.6, 1.6) ? lit('#f2ead8', x, y) : null;
    }),
    cheese: paint((x, y) => {
      if (!(y >= 6 && y <= 13 && x >= 2 && x <= 14 && y >= 13 - (x - 2) * 0.6)) return null;
      return inE(x, y, 9, 10, 1, 0.9) || inE(x, y, 12, 12, 0.8, 0.7) || inE(x, y, 6, 12, 0.8, 0.8) ? '#d8a020' : lit(y < 8 ? '#ffe680' : '#f4c840', x, y);
    }),
    bacon: paint((x, y) => {
      for (const o of [5, 10]) { const w = o + Math.sin(x * 0.9) * 1.2; if (Math.abs(y - w) < 1.8) return Math.abs(y - w) < 0.6 ? '#f6e6d8' : lit('#b83a2a', x, y); }
      return null;
    }),
    dumplings: dish((x, y) => knedlik(x, y, 5.5) || knedlik(x, y, 8.4) || knedlik(x, y, 11.2)),
    pork_dumplings: dish((x, y) => {
      if (inE(x, y, 10.5, 10.6, 2.6, 1.2)) return '#a85a20'; // omáčka
      if (inE(x, y, 5.5, 9.2, 2.8, 2.2)) return lit('#c08050', x, y);
      return knedlik(x, y, 9.4) || knedlik(x, y, 12);
    }),
    mutton_potatoes: dish((x, y) => (inE(x, y, 6, 9.2, 2.8, 2) ? lit('#9a5a3a', x, y) : inE(x, y, 10.5, 8.6, 1.6, 1.2) || inE(x, y, 11, 10.6, 1.5, 1.1) ? lit('#e8c070', x, y) : null)),
    schnitzel: dish((x, y) => (inE(x, y, 10.5, 8.2, 1.2, 1) ? '#fff06a' : inE(x, y, 7.4, 9.6, 4.6, 2.6) ? (noise(x, y, 6) > 0.75 ? '#a86a20' : lit('#d8962a', x, y)) : null)),
    goulash: bowl('#8a2a12', (x, y) => (y < 8.6 && (inE(x, y, 6, 7.8, 1, 0.6) || inE(x, y, 10, 8, 1, 0.6)) ? '#5a2010' : null)),
    venison_goulash: bowl('#5a1a10', (x, y) => (y < 8.6 && (inE(x, y, 6.2, 7.8, 1.1, 0.6) || inE(x, y, 9.8, 7.9, 1, 0.6)) ? '#c8a070' : null)),
    bone_broth: bowl('#e8c86a', (x, y) => (inE(x, y, 9, 7.9, 0.7, 0.4) ? '#fff4b0' : null)),
    hamburger: paint((x, y) => {
      if (inE(x, y, 8, 5.4, 6, 3.2) && y < 6.6) return noise(x, y, 4) > 0.86 ? '#fff8e0' : lit('#d8902a', x, y); // horní bulka se sezamem
      if (inR(x, y, 2, 6.6, 14, 7.6)) return '#f6c820'; // sýr
      if (inR(x, y, 2.5, 7.6, 13.5, 8.6)) return '#d03020'; // rajče
      if (inR(x, y, 2, 8.6, 14, 10.6)) return lit('#5a2a12', x, y); // maso
      return inR(x, y, 2.5, 10.6, 13.5, 12.6) ? lit('#d8902a', x, y) : null;
    }),
    eggs_bacon: dish((x, y) => {
      if (inE(x, y, 6.4, 9.4, 1.4, 1.1)) return '#ffb020';
      if (inE(x, y, 6, 9.6, 3.2, 2.2)) return '#fbfbf8';
      for (const o of [8.4, 10.4]) { const w = o + Math.sin(x * 1.1) * 0.5; if (x > 9 && x < 13.5 && Math.abs(y - w) < 0.8) return Math.abs(y - w) < 0.3 ? '#f6e6d8' : '#b83a2a'; }
      return null;
    }),
    pizza: paint((x, y) => {
      if (!inE(x, y, 8, 8.5, 6.8, 6.4)) return null;
      if (!inE(x, y, 8, 8.5, 5.6, 5.2)) return lit('#d89a40', x, y); // okraj
      if ([[6, 6.5], [10, 7], [7.5, 10.5], [10.5, 10.5]].some(([a, b]) => inE(x, y, a, b, 0.9, 0.8))) return '#8a5a30'; // houby
      return noise(x, y, 2) > 0.45 ? '#f6d860' : '#d02a1a';
    }),
    strudel: paint((x, y) => {
      if (!inE(x, y, 8, 9.5, 6.8, 3.4)) return null;
      if (noise(x, y, 9) > 0.86) return '#ffffff'; // cukr
      return lit(Math.abs((x * 1.3 + y) % 4) < 0.7 ? '#b8762a' : '#e0a850', x, y);
    }),
  };
  for (const [id, c] of Object.entries(icons)) ICONS[id] = { canvas: c, url: c.toDataURL() };
})();

// ============================================================ ikony: sushi, ryby, prut, nábytek
(() => {
  const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inR = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lit = (h, x, y) => { const k = 1.12 - ((x - 8) + (y - 8)) * 0.035; return `rgb(${hex(h).map((v) => clamp(v * k, 0, 255) | 0).join(',')})`; };
  const noise = (x, y, s = 0) => hash2(Math.floor(x) * 7 + s, Math.floor(y) * 13 - s);
  function paint(fn) {
    const c = iconCanvas();
    c.width = c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x + 0.5, y + 0.5); if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    const d = g.getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    g.fillStyle = 'rgba(24,16,12,0.9)';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    return c;
  }
  // Ryba z boku: tělo, ocas, oko
  const fish = (body, belly, stripe) => paint((x, y) => {
    if (inE(x, y, 4.5, 6.8, 0.6, 0.6)) return '#111111';
    if (x > 11 && Math.abs(y - 8) < (x - 11) * 0.9 + 0.3 && x < 15.5) return lit(body, x, y);
    if (!inE(x, y, 7, 8, 5.6, 3.2)) return null;
    if (stripe && Math.abs(y - 8) < 0.6) return stripe;
    return y > 8.6 ? lit(belly, x, y) : lit(body, x, y);
  });
  const roll = (x, y, cx, cy) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > 2.6) return null;
    if (d > 2.0) return '#1a2a1a'; // nori
    return d < 0.9 ? '#f07a4a' : '#f6f6f0'; // losos uprostřed, rýže kolem
  };
  const nigiriAt = (x, y, cx, cy) => (inE(x, y, cx, cy - 0.8, 2.6, 1.1) ? lit('#f08a5a', x, y) : inE(x, y, cx, cy, 2.4, 1.4) ? '#f6f6f0' : null);
  const icons = {
    raw_salmon: fish('#e8806a', '#f6c8b0', null),
    raw_trout: fish('#7a8a6a', '#e8e0c8', '#d06a8a'),
    fried_trout: fish('#b8742a', '#e8b860', null),
    seaweed: paint((x, y) => { for (const [o, a] of [[5, 0.9], [8, 1.3], [11, 1.1]]) if (Math.abs(x - o - Math.sin(y * 0.8 + o) * a) < 0.9 && y > 2 && y < 15) return lit('#2a7a3a', x, y); return null; }),
    nori: paint((x, y) => (inR(x, y, 3, 3, 13, 13) ? (noise(x, y, 2) > 0.8 ? '#2a4a2a' : '#13221a') : null)),
    rice: paint((x, y) => ([[5, 6], [8, 5], [11, 7], [6, 9], [9, 9.5], [12, 11], [7, 12], [4, 12]].some(([a, b]) => inE(x, y, a, b, 1.3, 0.7)) ? lit('#f2ecd8', x, y) : null)),
    cooked_rice: paint((x, y) => (y < 8.6 && inE(x, y, 8, 7.8, 6, 2.6) ? (noise(x, y, 5) > 0.6 ? '#e8e2cc' : '#fbf8ee') : y >= 8 && inE(x, y, 8, 8, 7, 6.5) ? lit('#2a2a30', x, y) : null)),
    maki: paint((x, y) => roll(x, y, 5, 6) || roll(x, y, 11, 6) || roll(x, y, 8, 11)),
    nigiri: paint((x, y) => nigiriAt(x, y, 5, 7) || nigiriAt(x, y, 11, 11)),
    sushi_platter: paint((x, y) => roll(x, y, 4.5, 6) || roll(x, y, 9.5, 5.5) || nigiriAt(x, y, 11.5, 10.5) || (inR(x, y, 1, 3, 15, 13.5) ? lit('#2a2a30', x, y) : null)),
    makisu: paint((x, y) => (inR(x, y, 2, 3, 14, 13) ? (Math.floor(y) % 2 === 0 ? lit('#c8b070', x, y) : '#8a7040') : null)),
    fishing_rod: paint((x, y) => {
      if (Math.abs(x + y - 16) < 0.9 && x > 1 && x < 14) return x < 5 ? '#3a2a1a' : lit('#a87a40', x, y);
      if (Math.abs(x - 14.2) < 0.4 && y > 2 && y < 11) return '#dddddd'; // vlasec
      return inE(x, y, 14.2, 11.5, 0.9, 0.9) ? '#e03020' : null; // splávek
    }),
    cutlery: paint((x, y) => {
      if (inR(x, y, 4, 7, 5.4, 15)) return '#9aa0aa'; // rukojeť vidličky
      if (inR(x, y, 2.6, 2, 6.8, 7) && (Math.floor(x) % 2 === 0 || y > 5.4)) return lit('#dfe3ea', x, y);
      if (inR(x, y, 10.6, 9, 12, 15)) return '#9aa0aa';
      return inR(x, y, 10, 2, 12.6, 9) && x - 10 < (y - 2) * 0.6 + 1.2 ? lit('#e8ecf2', x, y) : null;
    }),
    table: paint((x, y) => (inR(x, y, 1, 4, 15, 6.5) ? lit('#b8864e', x, y) : (inR(x, y, 2, 6.5, 3.6, 14) || inR(x, y, 12.4, 6.5, 14, 14)) ? lit('#8a5e32', x, y) : null)),
    chopsticks: paint((x, y) => (Math.abs(x - y * 0.55 - 3) < 0.7 && y > 1 && y < 15 ? lit(y < 4 ? '#c0402a' : '#d8b078', x, y) : Math.abs(x - y * 0.55 - 6.5) < 0.7 && y > 1 && y < 15 ? lit(y < 4 ? '#c0402a' : '#d8b078', x, y) : null)),
    chair: paint((x, y) => (inR(x, y, 4, 1, 5.6, 9) ? lit('#8a5e32', x, y) : inR(x, y, 4, 8, 12, 9.8) ? lit('#b8864e', x, y) : (inR(x, y, 4, 9.8, 5.6, 15) || inR(x, y, 10.4, 9.8, 12, 15)) ? lit('#8a5e32', x, y) : null)),
  };
  for (const [id, c] of Object.entries(icons)) ICONS[id] = { canvas: c, url: c.toDataURL() };
})();
