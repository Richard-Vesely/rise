// Okno Nastavení (grafika, ovládání, tlačítka, citlivost, hlasitost) – používá ho hlavní menu i hra (window.RiseSettings).
import { VOL_LABELS, readVolumes } from '../audio/volume.js';
import { autoQuality } from '../game/gpu.js';
const KEY = 'rise-nastaveni';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const store = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} dispatchEvent(new Event('rise-prefs')); };
const touchAuto = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
const OPTS = {
  quality: [['', 'Automaticky'], ['low', 'Nízká'], ['medium', 'Střední'], ['high', 'Vysoká']],
  controls: [['', 'Automaticky'], ['touch', 'Dotykové'], ['mouse', 'Myš a klávesnice']],
};
let box = null;
// Dokud je okno otevřené, klávesy E a Esc zavřou jen jeho (dřív E zavřelo batoh pod ním, zamklo myš a okno zůstalo viset
// nad běžící hrou, Zavřít pak nešlo kliknout). Ostatní klávesy hra nedostane (hráč za oknem nechodí); posuvníky
// se šipkami dál fungují (to je výchozí chování prohlížeče).
function onKey(e) {
  if (!box) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); close(); }
}
function close() {
  box?.remove(); box = null;
  removeEventListener('keydown', onKey, true);
}
function open(opts = {}) {
  box?.remove();
  addEventListener('keydown', onKey, true);
  box = document.createElement('div');
  box.id = 'settings';
  const render = () => {
    const p = load();
    const seg = (k) => `<div class="seg">${OPTS[k].map(([v, t]) => `<button class="mc-btn ${(p[k] || '') === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`).join('')}</div>`;
    const autoQ = { low: 'nízká', medium: 'střední', high: 'vysoká' }[autoQuality(touchAuto)], autoC = touchAuto ? 'dotykové' : 'myš a klávesnice';
    box.innerHTML = `<div class="mc-panel set-panel px">
      <div class="mc-title">Nastavení</div>
      <div class="set-row"><div class="set-label">Grafika <small>(automaticky: ${autoQ})</small></div>${seg('quality')}</div>
      <div class="set-row"><div class="set-label">Ovládání <small>(automaticky: ${autoC})</small></div>${seg('controls')}</div>
      <div class="set-row"><div class="set-label">Velikost dotykových tlačítek <b>${Math.round((p.btnScale || 1) * 100)} %</b></div><input type="range" min="60" max="150" step="5" value="${Math.round((p.btnScale || 1) * 100)}" data-r="btnScale"></div>
      <div class="set-row"><div class="set-label">Citlivost otáčení <b>${Math.round((p.sens || 1) * 100)} %</b></div><input type="range" min="40" max="250" step="10" value="${Math.round((p.sens || 1) * 100)}" data-r="sens"></div>
      <div class="set-sound">${VOL_LABELS.map(([k, t]) => { const v = Math.round(readVolumes(p)[k] * 100); return `<div class="set-row"><div class="set-label">${t} <b>${v} %</b></div><input type="range" min="0" max="100" step="5" value="${v}" data-r="${k}"></div>`; }).join('')}</div>
      <p class="mc-note">${opts.inGame ? 'Grafika a typ ovládání se projeví po restartu hry' + (opts.restart ? '.' : ' (při příštím spuštění).') : 'Grafika a ovládání se použijí při spuštění hry.'} Velikost tlačítek, citlivost a hlasitost platí hned.</p>
      <div class="menu-row">${opts.restart ? '<button class="mc-btn" data-restart>Použít a restartovat</button>' : ''}<button class="mc-btn" data-close>Zavřít</button></div>
    </div>`;
  };
  render();
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) { close(); return; }
    if (b.dataset.restart !== undefined) { opts.onRestart?.(); return; }
    if (b.dataset.k) { const p = load(); if (b.dataset.v) p[b.dataset.k] = b.dataset.v; else delete p[b.dataset.k]; store(p); render(); }
  });
  box.addEventListener('input', (e) => {
    const r = e.target.closest('[data-r]');
    if (!r) return;
    const p = load();
    p[r.dataset.r] = +r.value / 100;
    store(p);
    r.previousElementSibling.querySelector('b').textContent = `${r.value} %`;
  });
  document.body.append(box);
}
window.RiseSettings = { open };
