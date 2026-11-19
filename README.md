# Říše

Survival hra v prohlížeči, kterou vymyslel a postavil Marek a kterou teď rozvíjíme spolu na AI kroužku.
Přežij, sbírej, stav a objevuj: lesy a biomy, podzemí s rudami, zvířata a noční stínožrouti, vaření, pole,
pec, elektřina, auto, letadlo, počítač s hrami a portál do Markovy dimenze. Všechno, co hra umí, je v
[docs/FEATURES.md](docs/FEATURES.md).

## Tahák pro kroužek

- **Hrát:** https://richard-vesely.github.io/rise/ (heslo kroužku ti řekne Richard, PIN si vymyslíš)
- **Úkoly:** [Issues](https://github.com/Richard-Vesely/rise/issues), štítek `dobrý první úkol`. Napiš do úkolu „beru si to“.
- **Domluva:** chat kroužku https://chat.ardoremy.cz, kanál **říše** (jen na pozvánku)

**Poprvé:** na GitHubu klikni vpravo nahoře **Fork → Create fork**. Máš svou kopii `github.com/TVOJE-JMENO/rise`.
Otevři ji v prohlížeči (ve svém forku **Code → Codespaces → Create codespace on main**) nebo na svém počítači
(potřebuješ [Node.js](https://nodejs.org) 20+ a [Git](https://git-scm.com)):

```bash
git clone https://github.com/TVOJE-JMENO/rise
cd rise
npm install
```

**Pokaždé, když začínáš novou věc:** na stránce svého forku klikni **Sync fork → Update branch**, pak:

```bash
git switch main
git pull                   # stáhne, co mezitím přidali ostatní
npm install                # kdyby přibylo něco nového
git switch -c moje-vec     # nová větev, pojmenuj ji podle toho, co děláš
npm run dev                # hra: otevři http://localhost:5173 a klikni Hrát sám
```

**Co napsat AI pomocníkovi na začátku** (třeba GitHub Copilot ve VS Code nebo Codespaces, režim **Agent**):

> Přečti si AGENTS.md a docs/FEATURES.md. Chci do hry přidat … . Udělej co nejmenší změnu, vysvětli mi ji česky
> a řekni mi, jak to vyzkouším.

**Než to pošleš, zkontroluj:**

1. Vyzkoušej to ve hře (**Hrát sám**).
2. Spusť `npm test` a `npm run build`. Nic nesmí svítit červeně.
3. Napiš AI pomocníkovi:
   > Zkontroluj moji změnu podle AGENTS.md: je co nejmenší, texty ve hře jsou česky, je zapsaná v docs/FEATURES.md
   > a projde `npm test` i `npm run build`? Co je potřeba opravit, mi vysvětli česky.

**Pošli to:**

```bash
git add .
git commit -m "Přidán …"
git push -u origin moje-vec
```

Ve svém forku na GitHubu klikni **Compare & pull request** (cíl `Richard-Vesely/rise`, `main`) a napiš, co jsi
přidal(a), jak to vyzkoušet a kdo na tom pracoval.
Když je automatická kontrola zelená ✅, Robot kroužku to sám sloučí a napíše ti komentář. Když ne, napíše, co opravit. Podrobný návod: [CONTRIBUTING.md](CONTRIBUTING.md).

## Jak hrát

Otevři hru, napiš své jméno a vyber:

- **Hlavní svět**, **Kreativní svět** – světy kroužku, každý má svoje velké tlačítko. Poprvé hra chce
  **heslo kroužku** a tvůj **PIN** (4 číslice, vymyslíš si ho). S jménem a PINem máš svůj batoh i na jiném počítači.
- **Hrát sám** – svět se ukládá v tvém prohlížeči.
- **Další možnosti**
  - **Vytvořit hru na svém počítači** – dostaneš kód (např. `LOUKA-7K2F`), pošli ho kamarádům. Nech hru otevřenou,
    dokud ostatní hrají.
  - **Připojit se ke kamarádovi kódem** – napiš kód od kamaráda (stačí 4 znaky).

Ovládání: WASD chůze · Shift běh · Mezerník skok · levé tlačítko těžba/útok · pravé položit/použít/jíst ·
E inventář · Q nebo G vyhodit · prostřední tlačítko = vzít blok do ruky · C kreativní režim · H návod · T chat · Esc menu. Na telefonu a tabletu je dotykové ovládání.

## Spuštění na počítači

Potřebuješ [Node.js](https://nodejs.org) 20 nebo novější.

```bash
npm install          # jednou
npm run dev          # hra: otevři http://localhost:5173
```

Vlastní stálý server (svět se ukládá na disk, hráči se připojí adresou):

```bash
npm run build        # sestaví hru do složky dist/
npm start            # server: http://localhost:8787 (hra i připojení)
```

Jak server provozovat na VPS nebo na notebooku: [docs/HOSTING.md](docs/HOSTING.md).

## Jak přidat něco do hry

Návod pro děti je v [CONTRIBUTING.md](CONTRIBUTING.md), pravidla a mapa kódu pro AI pomocníky v [AGENTS.md](AGENTS.md).
Známé chyby a co ještě chybí: [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Co je kde

```
index.html     menu a HUD
client/src/    hra v prohlížeči (Three.js): kreslení, zvuk, ovládání, okna
shared/        pravidla a data hry (předměty, recepty, bloky, tvorové…) – stejná v prohlížeči i na serveru
server/        stálý server v Node.js
tests/         automatické testy (i zahrání hry v prohlížeči)
legacy/        Markova původní verze v jednom souboru (pro srovnání)
```
