// Úkoly vězňů v bludišti (server/prison.js): čím se vězeň dostane ven. Jen server; odpovědi se hráči nikdy neposílají.
// Příklady a hádanky se pokaždé vymyslí znovu (náhodná čísla, jména, dny), takže se nedají vyčíst z kódu ani si je
// předat. Bez vedlejších účinků při načtení.
//   'monsters' – zabij need pavouků v bludišti      'runes' – dotkni se need různých runových kamenů
//   'math'     – u své brány vyřeš need příkladů     'logic' – u své brány vyřeš need hádanek (řady, kdo je nejvyšší, dny)
// Úkoly jsou krátké: s cestou bludištěm ven zhruba za 5 minut (rozhodl Richard 18.11.2026).

export const TASK_KINDS = ['monsters', 'runes', 'math', 'logic'];
export const TASK_NEED = { monsters: 3, runes: 3, math: 3, logic: 3 };

/** Text úkolu pro hráče („Zabij 3 pavouky v bludišti“). */
export function taskText(kind, need) {
  switch (kind) {
    case 'monsters': return `Zabij ${need} ${need >= 5 ? 'obřích pavouků' : 'obří pavouky'} v bludišti`;
    case 'runes': return `Najdi ${need} runové kameny (pravé tlačítko)`;
    case 'math': return `U své brány vyřeš ${need} příklady`;
    case 'logic': return `U své brány vyřeš ${need} hádanky`;
  }
  return '';
}

/** Nový úkol: { kind, need }. */
export function newTask(rnd = Math.random) {
  const kind = TASK_KINDS[Math.floor(rnd() * TASK_KINDS.length)];
  return { kind, need: TASK_NEED[kind] };
}

const int = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/** Příklad: { q, a } (a = správná odpověď jako text). */
export function mathQuestion(rnd = Math.random) {
  const a = int(rnd, 3, 12), b = int(rnd, 3, 12), c = int(rnd, 2, 30);
  const forms = [
    () => [`${a} × ${b} + ${c} = ?`, a * b + c],
    () => [`${a} × ${b} − ${Math.min(c, a * b - 1)} = ?`, a * b - Math.min(c, a * b - 1)],
    () => [`${a * b} : ${a} + ${c} = ?`, b + c],
    () => [`(${a} + ${c}) × ${b % 5 + 2} = ?`, (a + c) * (b % 5 + 2)],
    () => [`V truhle je ${a} řad po ${b} diamantech. ${Math.min(c, a * b - 1)} jich prodáš. Kolik ti zbude?`, a * b - Math.min(c, a * b - 1)],
    () => [`Kolik nohou má ${a} obřích pavouků a ${c} slepic?`, 8 * a + 2 * c],
  ];
  const [q, ans] = pick(rnd, forms)();
  return { q, a: String(ans) };
}

const NAMES = ['Ája', 'Bára', 'Cyril', 'Dan', 'Ema', 'Filip', 'Gábina', 'Honza', 'Ivana', 'Kuba', 'Lenka', 'Matěj'];
const DAYS = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/** Hádanka: { q, a }. */
export function logicQuestion(rnd = Math.random) {
  const forms = [
    () => { const s = int(rnd, 2, 20), d = int(rnd, 3, 9); return [`Jaké číslo je další? ${[0, 1, 2, 3, 4].map((i) => s + i * d).join(', ')}, ?`, s + 5 * d]; },
    () => { const s = int(rnd, 1, 5); return [`Jaké číslo je další? ${[0, 1, 2, 3].map((i) => s * 2 ** i).join(', ')}, ?`, s * 16]; },
    () => { const s = int(rnd, 1, 9); return [`Jaké číslo je další? ${[0, 1, 3, 6, 10].map((t) => s + t).join(', ')}, ?`, s + 15]; },
    () => { const x = int(rnd, 1, 4), y = int(rnd, 1, 5), f = [x, y]; while (f.length < 6) f.push(f.at(-1) + f.at(-2)); return [`Jaké číslo je další? ${f.join(', ')}, ?`, f.at(-1) + f.at(-2)]; },
    () => { // kdo je nejvyšší / nejnižší
      const n = [...NAMES].sort(() => rnd() - 0.5).slice(0, 3); // n[0] nejvyšší, n[2] nejnižší
      const facts = [`${n[0]} je vyšší než ${n[1]}.`, `${n[2]} je nižší než ${n[1]}.`].sort(() => rnd() - 0.5);
      const top = rnd() < 0.5;
      return [`${facts.join(' ')} Kdo je ${top ? 'nejvyšší' : 'nejnižší'}?`, top ? n[0] : n[2]];
    },
    () => { const d = int(rnd, 0, 6), k = int(rnd, 8, 25); return [`Dnes je ${DAYS[d]}. Jaký den bude za ${k} dní?`, DAYS[(d + k) % 7]]; },
  ];
  const [q, ans] = pick(rnd, forms)();
  return { q, a: String(ans) };
}

/** Otázka pro úkol 'math' nebo 'logic'. */
export const taskQuestion = (kind, rnd = Math.random) => (kind === 'math' ? mathQuestion(rnd) : logicQuestion(rnd));

const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').replace(/[\s.!?]/g, '');
/** Je odpověď správně? Čísla i „ 42 “, jména a dny bez háčků a velkých písmen. */
export function rightAnswer(answer, input) {
  const a = plain(answer), b = plain(input).replace(',', '.');
  if (!b) return false;
  if (/^-?\d+$/.test(a)) return Number(b) === Number(a);
  return a === b;
}
