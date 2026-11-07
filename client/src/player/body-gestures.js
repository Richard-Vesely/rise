// Ovládání tělem: z bodů těla z kamery (MediaPipe Pose, 33 bodů, x a y 0–1 v obraze, y dolů) udělá ovládání hry.
// Čisté výpočty bez kamery a bez DOM (unit test: tests/unit/body.test.mjs). Kameru a model řeší body-control.js.
//   chůze: 'knees' = chůze na místě (střídavě zvedaná kolena, rychlost podle tempa), 'lean' = náklon dopředu / dozadu,
//          'hands' = jen rukama vsedě (střídavé mávání rukama = chůze, obě ruce nad hlavou = skok, bez úkroků)
//   úkrok: náklon do strany · otáčení: upažení levou / pravou rukou (hráč zůstane čelem k obrazovce)
//   pohled nahoru / dolů: malé kývnutí hlavou · útok: pravá ruka nad hlavou · pravé tlačítko: levá ruka nad hlavou · skok: výskok

export const P = { NOSE: 0, LSH: 11, RSH: 12, LWR: 15, RWR: 16, LHIP: 23, RHIP: 24, LKNEE: 25, RKNEE: 26 };
const seen = (l) => !!l && (l.visibility ?? 1) > 0.5;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Co je z těla vidět a měřítko (šířka ramen); null = tělo nevidím. */
function measure(L) {
  const ls = L[P.LSH], rs = L[P.RSH];
  if (!seen(ls) || !seen(rs) || !seen(L[P.NOSE])) return null;
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (sw < 0.03) return null;
  const hips = seen(L[P.LHIP]) && seen(L[P.RHIP]), knees = hips && seen(L[P.LKNEE]) && seen(L[P.RKNEE]);
  const sh = mid(ls, rs), hp = hips ? mid(L[P.LHIP], L[P.RHIP]) : null;
  return {
    sw, sh, hp, knees,
    side: Math.sign(ls.x - rs.x) || 1, // kam v obraze leží levá strana těla (kamera může být zrcadlená)
    head: (L[P.NOSE].y - sh.y) / sw, // hlava nad rameny (záporné)
    ratio: hips ? sw / Math.max(0.01, Math.abs(L[P.LHIP].x - L[P.RHIP].x)) : null, // náklon ke kameře: ramena se zvětší víc než boky
    lateral: hp ? (sh.x - hp.x) / sw : 0, // náklon do strany
    hipY: hp ? hp.y / sw : null,
    kneeL: knees ? (L[P.LHIP].y - L[P.LKNEE].y) / sw : null, // koleno pod bokem (záporné; zvednuté koleno = blíž nule)
    kneeR: knees ? (L[P.RHIP].y - L[P.RKNEE].y) / sw : null,
  };
}

/** Klidový postoj (průměr z kalibrace). */
export function calibrate(frames) {
  const ms = frames.map(measure).filter(Boolean);
  if (ms.length < 5) return null;
  const avg = (k) => { const v = ms.map((m) => m[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return { head: avg('head'), ratio: avg('ratio'), lateral: avg('lateral'), hipY: avg('hipY'), kneeL: avg('kneeL'), kneeR: avg('kneeR') };
}

export function newState() { return { steps: [], lastKnee: null, lastArm: null, jumpT: 0, atk: {}, use: {}, both: {}, yAvg: null, phase: null }; }
const handOk = (l) => !!l && (l.visibility ?? 1) > 0.6;
// Gesto ruky s hysterezí: zapne se, až drží 0,2 s, a vypne se 0,2 s po puštění (body z kamery se třesou; hrubé ovládání)
function steady(g, raw, now) {
  if (raw) { g.since ??= now; g.lost = null; } else if (g.since != null) { g.lost ??= now; }
  if (!raw && g.lost != null && now - g.lost > 0.2) g.since = g.lost = null;
  return g.since != null && now - g.since >= 0.2;
}
const smooth01 = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Ovládání z jednoho snímku.
 * @param {object[]} L body těla
 * @param {object} base klidový postoj (calibrate)
 * @param {object} st stav mezi snímky (newState)
 * @param {number} now čas v sekundách
 * @param {'knees'|'lean'|'hands'} mode chůze
 * @returns {{ ok: boolean, forward: number, strafe: number, sprint: boolean, turn: number, look: number, attack: boolean, use: boolean, jump: boolean, byShoulders?: boolean, why?: string }}
 */
export function readPose(L, base, st, now, mode = 'knees') {
  const out = { ok: false, forward: 0, strafe: 0, sprint: false, turn: 0, look: 0, attack: false, use: false, jump: false };
  const m = measure(L);
  if (!m || !base) { out.why = 'Nevidím tě – postav se před kameru'; return out; }
  out.ok = true;
  const { sw, side } = m;
  // otáčení: ruka upažená do strany (zápěstí zhruba ve výšce ramen, daleko od ramene ven)
  const armOut = (wr, shd, dir) => {
    if (!handOk(wr)) return 0;
    const outward = (wr.x - shd.x) * dir / sw, level = Math.abs(wr.y - shd.y) / sw;
    return level < 0.9 && outward > 1.15 ? 1 : 0; // hrubé ovládání: jasně upažená ruka = otáčení stálou rychlostí
  };
  out.turn = armOut(L[P.LWR], L[P.LSH], side) - armOut(L[P.RWR], L[P.RSH], -side); // + = doleva
  // ruka nad hlavou: pravá = útok, levá = pravé tlačítko
  const nose = L[P.NOSE];
  const rUp = handOk(L[P.RWR]) && L[P.RWR].y < nose.y - 0.3 * sw, lUp = handOk(L[P.LWR]) && L[P.LWR].y < nose.y - 0.3 * sw; // ruka opravdu nad hlavou
  const both = mode === 'hands' && rUp && lUp;
  if (steady(st.both, both, now) && now - st.jumpT > 0.8) { out.jump = true; st.jumpT = now; } // vsedě: obě ruce nahoru = skok
  out.attack = steady(st.atk, rUp && !both, now);
  out.use = steady(st.use, lUp && !both, now);
  // pohled: kývnutí hlavou proti klidu (mrtvá zóna, ať se obraz necuká)
  const dh = m.head - base.head;
  out.look = Math.abs(dh) < 0.16 ? 0 : -Math.sign(dh); // + = nahoru; jen výrazné kývnutí, pak stálá rychlost
  // úkrok: náklon do strany
  if (base.lateral != null && mode !== 'hands') { const dl = (m.lateral - base.lateral) * side; out.strafe = Math.abs(dl) < 0.22 ? 0 : -Math.sign(dl); } // + = doprava; jen výrazný náklon
  // skok: boky vyskočí nahoru proti klidu
  if (mode !== 'hands' && m.hipY != null && base.hipY != null && base.hipY - m.hipY > 0.35 && now - st.jumpT > 0.6) { out.jump = true; st.jumpT = now; }
  // chůze
  if (mode === 'hands') {
    // střídavé mávání rukama: jedno zápěstí výrazně výš než druhé, pak naopak = krok (upažení a ruka nad hlavou se nepočítají)
    const lw = L[P.LWR], rw = L[P.RWR];
    if (handOk(lw) && handOk(rw) && !out.turn && !rUp && !lUp) {
      const d = (rw.y - lw.y) / sw, which = d > 0.5 ? 'L' : d < -0.5 ? 'R' : null; // výš je levá / pravá
      if (which && which !== st.lastArm) { st.steps.push(now); st.lastArm = which; }
    }
    st.steps = st.steps.filter((t) => now - t < 2);
    const last = st.steps.at(-1) ?? -9, cadence = st.steps.length / 2;
    out.forward = cadence >= 1 ? clamp01(0.45 + cadence * 0.25) * (1 - smooth01(0.7, 1.2, now - last)) : 0;
    out.sprint = cadence >= 3 && now - last < 0.6;
    if (!handOk(lw) || !handOk(rw)) out.why = 'Nevidím obě ruce – posaď se dál od kamery';
  } else if (mode === 'lean') {
    if (m.ratio != null && base.ratio != null) {
      const d = m.ratio / base.ratio - 1;
      out.forward = Math.abs(d) < 0.1 ? 0 : Math.sign(d); // jen výrazný náklon, pak plná chůze
      out.sprint = d > 0.32;
    } else out.why = 'Nevidím boky – ustup kousek dál';
  } else {
    // pohupování ramen: při chůzi na místě se celé tělo houpe nahoru a dolů (náhrada, když kamera nevidí kolena)
    st.sw = st.sw == null ? sw : st.sw + (sw - st.sw) * 0.05; // vyhlazené měřítko: šum v šířce ramen by dělal falešné kroky
    const y = m.sh.y / st.sw;
    st.yAvg = st.yAvg == null ? y : st.yAvg + (y - st.yAvg) * 0.08;
    const dy = y - st.yAvg;
    if (dy > 0.06 && st.phase !== 'down') { st.phase = 'down'; if (!(m.knees && base.kneeL != null)) st.steps.push(now); }
    else if (dy < -0.06 && st.phase !== 'up') { st.phase = 'up'; }
    if (m.knees && base.kneeL != null) {
      const up = (k, b) => k - b > 0.4; // koleno zvednuté pořádně nad klid (blíž k boku)
      const which = up(m.kneeL, base.kneeL) ? 'L' : up(m.kneeR, base.kneeR) ? 'R' : null;
      if (which && which !== st.lastKnee) { st.steps.push(now); st.lastKnee = which; } // krok = střídání kolen
      if (!which && st.lastKnee && now - (st.steps.at(-1) ?? 0) > 0.6) st.lastKnee = null;
      st.steps = st.steps.filter((t) => now - t < 2);
      const last = st.steps.at(-1) ?? -9, cadence = st.steps.length / 2; // kroky za sekundu (poslední 2 s)
      out.forward = clamp01(0.45 + cadence * 0.25) * (1 - smooth01(0.6, 1.1, now - last)); // po posledním kroku dobrzdí
      out.sprint = cadence >= 2.6 && now - last < 0.6;
    } else { // kolena nejsou vidět: kroky podle pohupování ramen
      st.steps = st.steps.filter((t) => now - t < 2);
      const last = st.steps.at(-1) ?? -9, cadence = st.steps.length / 2;
      out.forward = cadence >= 1 ? clamp01(0.4 + cadence * 0.25) * (1 - smooth01(0.7, 1.2, now - last)) : 0;
      out.sprint = cadence >= 2.8 && now - last < 0.6;
      out.byShoulders = true;
    }
  }
  // klidový postoj se pomalu přizpůsobuje, když hráč nic nedělá (posune se, nakloní kameru…)
  if (!out.forward && !out.strafe && !out.turn && !out.look && !out.attack && !out.use) {
    const k = 0.01, adapt = (key) => { if (m[key] != null && base[key] != null) base[key] += (m[key] - base[key]) * k; };
    for (const key of ['head', 'lateral', 'ratio', 'hipY', 'kneeL', 'kneeR']) adapt(key);
  }
  return out;
}
