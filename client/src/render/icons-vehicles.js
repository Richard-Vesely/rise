// Pixelové ikony vozidel (16 × 16) ve vzhledu „Jasná budoucnost“: tónované sklo, tyrkysové proužky a podsvícení,
// bílá křídla dvouplošníku spojená štíty, aero kola se svítícím ráfkem. Písmena: M hlavní barva předmětu, L světlá,
// D tmavá, A druhá barva (u vozidel tyrkysová), W bílá, K černá, G šedá. Jen data (nic se nespouští při načtení);
// používá je render/icons-blocks.js.
const pix = (rows) => (x, y) => { const c = rows[Math.floor(y)]?.[Math.floor(x)]; return c && c !== '.' ? c : null; };
const seg = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - dx * t, y - ay - dy * t); };
const plane = ['', '', '', '...WWWWWWW......', '...AGGGGGA...MM.', '...A.KWKKA...MM.', '.GAMMMMMMMMMMMMM', 'GGAMMMMMMMMMMMM.', '.GADDDDDDDDDD...', '...WWWWWWW......', '...AGGGGGA......', '....D...D.......'];
// rám kola: spodní, horní a sedlová trubka, zadní stavby, vidlice
const BB = [7.6, 11.4], ST = [6.8, 6.4], HD = [11.4, 6.6], RH = [3.6, 11.4], FH = [12.4, 11.4];
const frame = (x, y) => [[BB, HD, 0.75], [ST, HD, 0.6], [BB, ST, 0.6], [BB, RH, 0.5], [ST, RH, 0.45], [HD, FH, 0.5]].some(([a, b, r]) => seg(x, y, a[0], a[1], b[0], b[1]) < r);

export const VEH_SHAPES = {
  // auto z boku (příď vlevo): černá střecha, tónovaná kabina, tyrkysový proužek a podsvícení, kola se svítícím nábojem
  car: pix(['', '', '', '', '', '......DDDDD.....', '.....KWWKKDKK...', '...LKWKKKKDKKKL.', '.LLLLLLLLLLLLLLL', 'WMMKKKAAAAAKKKMD', 'MMKGGGKMMMKGGGKM', '.DKGAGKDDDKGAGKD', '..KGGGKAAAKGGGK.', '...KKK.....KKK..']),
  // dvouplošník z boku (příď vlevo): kužel vrtule a prstenec sání, dvě bílá křídla spojená štíty se svítící hranou,
  // kryt kabiny, trup v barvě, kýlovka; podvozek, nebo u hydroplánu plovák se svítící čárou ponoru
  plane: pix([...plane, '...KKK.KKK......', '....K...K.......']),
  seaplane: pix([...plane, '..WWWWWWWWW.....', '...AAAAAAA......']),
  // kolo: pneumatiky, svítící ráfky, silný rám v barvě (proužek na spodní trubce), sedlo a řídítka
  bike: (x, y) => {
    for (const cx of [3.6, 12.4]) { const d = Math.hypot(x - cx, y - 11.4); if (d <= 3.4) return d > 2.55 ? 'K' : d > 1.85 ? 'A' : d < 0.8 ? 'G' : null; }
    if (frame(x, y)) return x > 8.4 && x < 10.6 && y > 8.2 && y < 9.8 ? 'A' : 'M';
    if (seg(x, y, 5.2, 5.6, 8.4, 5.6) < 0.6) return 'K';
    return seg(x, y, 11.6, 4.4, 13.6, 4.4) < 0.6 || seg(x, y, 11.6, 6.4, 12.4, 4.6) < 0.5 ? 'D' : null;
  },
  // motorový člun z boku: světlý okraj, boky v barvě, tyrkysová čára ponoru, tmavé dno, štít, bílý motor
  motorboat: pix(['', '', '', '', '', '', '.......KKK......', '......KWKK....WW', '.LLLLLLLLLLLL.AA', '..MMMMMMMMMMM.WW', '...MMMMMMMMMM..D', '....AAAAAAAAA..D', '.....DDDDDDDD.GD']),
  // plachetnice: bílé plachty se znakem kroužku, tmavý stěžeň, trup ve druhé barvě
  sailboat: pix(['', '.......D........', '.......DL.......', '.......DLL......', '......LDLML.....', '.....LLDLMML....', '.....LLDLKKML...', '....LLLDLKKMML..', '....LLLDLMMMMML.', '...GGGGDGGGGGGG.', '.......D........', '.WWWWWWWWWWWWWW.', '..AAAAAAAAAAAAA.', '...AAAAAAAAAAA..', '.......DD.......']),
};
