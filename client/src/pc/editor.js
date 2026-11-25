// Textový editor v počítači.
import './doc-view.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { dayCount } from '../../../shared/sim/day.js';
import { PRINT_QUEUE, netOf } from '../../../shared/sim/power.js';
import { clamp, esc } from '../../../shared/util.js';
import { blocks, pcDisks, power } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { PC_APPS, pc } from './computer.js';
import { DISK_MAX, DOC_TEXT_MAX, kvPend, newPaper, printJob } from './printer.js';

// ---------- textový editor v počítači
const diskOf = (k) => pcDisks.get(k)?.docs || [];
function diskSave(k, docs) { pcDisks.set(k, { docs }); kvPend('pcDisks', k); }
const printersOf = (k) => (netOf.get(k)?.keys || []).filter((n) => blocks.get(n) === 'printer');
PC_APPS.editor = {
  title: 'Textový editor', icon: '📝', w: 700, h: 470,
  init(w) {
    w.body.innerHTML = `<div class="ed">
      <div class="ed-side"><button data-ed="new">＋ Nový dokument</button><div class="ed-list"></div><div class="ed-disk"></div></div>
      <div class="ed-main">
        <div class="ed-bar"><input class="ed-name" maxlength="40" placeholder="Název dokumentu"><button data-ed="save">💾 Uložit</button><button data-ed="print">🖨 Tisk</button><button data-ed="del">🗑 Smazat</button></div>
        <textarea class="ed-text" maxlength="${DOC_TEXT_MAX}" placeholder="Sem piš text…" spellcheck="false"></textarea>
        <div class="ed-print" hidden></div>
        <div class="ed-status"></div>
      </div></div>`;
    w.ed = { cur: null, dirty: false, sig: '' };
    const dirty = () => { w.ed.dirty = true; edStatus(w, 'Neuloženo'); };
    w.body.querySelector('.ed-text').addEventListener('input', dirty);
    w.body.querySelector('.ed-name').addEventListener('input', dirty);
    w.body.addEventListener('click', (e) => edClick(w, e));
    edLoad(w, null);
  },
  slow: (w) => edList(w),
  canClose: (w) => !w.ed.dirty || confirm('Dokument má neuložené změny. Zahodit je?'),
};
const edQ = (w, s) => w.body.querySelector(s);
function edStatus(w, html) { edQ(w, '.ed-status').innerHTML = html; }
function edList(w, force) {
  const docs = diskOf(pc.k), sig = JSON.stringify(docs.map((d) => [d.id, d.name, d.day])) + w.ed.cur;
  if (!force && sig === w.ed.sig) return;
  w.ed.sig = sig;
  edQ(w, '.ed-list').innerHTML = docs.length ? docs.map((d) => `<button data-open="${d.id}" class="${d.id === w.ed.cur ? 'on' : ''}">📄 ${esc(d.name)}<small>den ${d.day}</small></button>`).join('')
    : '<div class="ed-empty">Zatím žádné dokumenty.</div>';
  edQ(w, '.ed-disk').textContent = `Disk: ${docs.length} / ${DISK_MAX} dokumentů`;
}
function edLoad(w, d) {
  w.ed.cur = d?.id || null;
  w.ed.dirty = false;
  edQ(w, '.ed-name').value = d?.name || '';
  edQ(w, '.ed-text').value = d?.text || '';
  edQ(w, '.ed-print').hidden = true;
  edStatus(w, d ? `Otevřeno: „${esc(d.name)}“` : 'Nový dokument – napiš název a text, pak Uložit.');
  edList(w, true);
}
function edClick(w, e) {
  const b = e.target.closest('button');
  if (!b) return;
  const k = pc.k, docs = diskOf(k), cur = docs.find((d) => d.id === w.ed.cur);
  const name = edQ(w, '.ed-name').value.trim() || 'Bez názvu', text = edQ(w, '.ed-text').value;
  if (b.dataset.open || b.dataset.ed === 'new') {
    if (w.ed.dirty && !confirm('Dokument má neuložené změny. Zahodit je?')) return;
    edLoad(w, b.dataset.open ? docs.find((d) => d.id === b.dataset.open) : null);
    if (!b.dataset.open) edQ(w, '.ed-name').focus();
  } else if (b.dataset.ed === 'save') {
    if (!cur && docs.length >= DISK_MAX) return edStatus(w, '<b class="bad">Disk je plný – smaž nějaký dokument.</b>');
    const doc = { id: cur?.id || NET.uid(), name, text: text.slice(0, DOC_TEXT_MAX), day: dayCount };
    diskSave(k, cur ? docs.map((d) => (d.id === cur.id ? doc : d)) : [...docs, doc]);
    edQ(w, '.ed-name').value = name;
    w.ed.cur = doc.id;
    w.ed.dirty = false;
    edList(w, true);
    edStatus(w, `Uloženo: „${esc(name)}“`);
    Sound.pop();
  } else if (b.dataset.ed === 'del') {
    if (!cur) { if (!w.ed.dirty || confirm('Zahodit rozepsaný dokument?')) edLoad(w, null); return; }
    if (!confirm(`Smazat dokument „${cur.name}“? Smazání nejde vrátit.`)) return;
    diskSave(k, docs.filter((d) => d.id !== cur.id));
    edLoad(w, null);
    edStatus(w, `Smazáno: „${esc(cur.name)}“`);
  } else if (b.dataset.ed === 'print') {
    const prs = printersOf(k), box = edQ(w, '.ed-print');
    if (!prs.length) { box.hidden = true; return edStatus(w, '<b class="bad">V elektrické síti počítače není tiskárna – připoj ji kabelem.</b>'); }
    box.innerHTML = `Tiskárna: <select class="ed-prn">${prs.map((p, i) => { const st = power.get(p) || {}; return `<option value="${p}">Tiskárna ${i + 1} · papír ${st.slots?.[0]?.id === 'paper' ? st.slots[0].n : 0} ks${st.q?.length ? ` · ve frontě ${st.q.length}` : ''}</option>`; }).join('')}</select>
      Kopií: <input class="ed-copies" type="number" min="1" max="5" value="1"> <button data-ed="doprint">🖨 Vytisknout</button> <button data-ed="noprint">Zrušit</button>`;
    box.hidden = false;
  } else if (b.dataset.ed === 'noprint') edQ(w, '.ed-print').hidden = true;
  else if (b.dataset.ed === 'doprint') {
    if (!text.trim() && !edQ(w, '.ed-name').value.trim()) return edStatus(w, '<b class="bad">Dokument je prázdný.</b>');
    const prn = edQ(w, '.ed-prn').value, n = clamp(Math.floor(Number(edQ(w, '.ed-copies').value)) || 1, 1, 5), st = power.get(prn) || {};
    if (!NET.client && (st.q?.length || 0) >= PRINT_QUEUE) return edStatus(w, '<b class="bad">Fronta tiskárny je plná.</b>');
    printJob(prn, newPaper(name, text), n);
    edQ(w, '.ed-print').hidden = true;
    edStatus(w, `Odesláno do tiskárny: „${esc(name)}“, ${n}× · ${st.slots?.[0]?.id === 'paper' ? 'tiskne se' : 'tiskárna potřebuje papír'}`);
    Sound.tone(880, 0.08, 0.06, 'square');
  }
}
