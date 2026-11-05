# Jak si hru zkopírovat, upravit s AI a přidat do ní něco svého

Hru stavíme spolu. Každý si udělá vlastní kopii (**fork**), tam si s AI pomocníkem zkouší, co chce, a hotové
věci pošle do společné hry:

**fork → větev → změna s AI → vyzkoušet → pull request → kontrola → sloučit**

## 0. Hraj hned

Otevři **https://richard-vesely.github.io/rise/**, napiš své jméno a klikni na **Hlavní svět** nebo **Kreativní svět**.
Poprvé hra chce **heslo kroužku** (řekne ti ho Richard) a tvůj **PIN**: 4 číslice, které si vymyslíš. Zapamatuj si ho,
s jménem a PINem máš svůj batoh na každém počítači. Bez internetu nebo jen pro sebe: **Hrát sám**.

## 1. Účet na GitHubu (jednou)

1. Založ si účet na **https://github.com/signup** (GitHub dovoluje účet od **13 let**).
2. Pošli Richardovi své **uživatelské jméno na GitHubu** (ne heslo!). Přidá tě do projektu: přijde ti e-mail
   s pozvánkou, nebo ji najdeš na **https://github.com/Richard-Vesely/rise/invitations**. Klikni **Accept invitation**.
   Pak se automatická kontrola u tvých pull requestů spustí hned a nemusí čekat na Richarda.

Když je ti míň než 13:
- pracuj **ve dvojici** s někým, kdo účet má, nebo přes **Richardův účet** na kroužku, nebo
- si hru jen stáhni a upravuj u sebe: na https://github.com/Richard-Vesely/rise klikni **Code → Download ZIP**,
  rozbal ho a pokračuj krokem 3 (příkazy `npm install` a `npm run dev`).

## 2. Udělej si vlastní kopii: fork (jednou)

1. Přihlas se na GitHub a otevři **https://github.com/Richard-Vesely/rise**.
2. Vpravo nahoře klikni **Fork** a pak **Create fork**.

Teď máš svou kopii na adrese `https://github.com/TVOJE-JMENO/rise`. Můžeš v ní měnit, co chceš,
společnou hru tím nerozbiješ.

## 3. Otevři svou kopii a spusť ji

**V prohlížeči, bez instalace (Codespaces):** ve **svém forku** klikni **Code → Codespaces → Create codespace on main**.
Počkej, až se všechno nainstaluje, a pak napiš dole do terminálu:
```bash
npm run dev
```
Hra se otevře v nové záložce. GitHub dává na Codespaces jen omezený čas zdarma, tak když skončíš, codespace zastav
(na https://github.com/codespaces u něj klikni **⋯ → Stop codespace**).

**Na svém počítači:** nainstaluj si [Node.js](https://nodejs.org) (verze 20 nebo novější), [Git](https://git-scm.com)
a editor [VS Code](https://code.visualstudio.com). Pak v terminálu:
```bash
git clone https://github.com/TVOJE-JMENO/rise
cd rise
npm install
npm run dev
```
Otevři **http://localhost:5173** a klikni **Hrát sám**. To je **tvoje verze** hry: všechno, co změníš, uvidíš tady
(když se stránka neobnoví sama, zmáčkni F5).

## 4. Než začneš novou věc: stáhni novinky a udělej si větev

Ostatní mezitím přidávají věci do společné hry. Ať je máš i ty:
1. Na stránce **svého forku** klikni **Sync fork → Update branch**.
2. V terminálu:
```bash
git switch main
git pull                   # stáhne novinky do tvého počítače
npm install                # kdyby přibylo něco nového
git switch -c med-a-vcely  # nová větev pro novou věc
```
Větev pojmenuj podle toho, co děláš (malá písmena, bez háčků, slova spoj pomlčkou).

## 5. Vyber si úkol

Na **https://github.com/Richard-Vesely/rise/issues** najdi štítek **`dobrý první úkol`** a napiš do něj
„beru si to“, ať na stejné věci nepracují dva. Máš vlastní nápad? Založ issue přes šablonu **Nový nápad**.
Co už ve hře je, najdeš v [docs/FEATURES.md](docs/FEATURES.md).

## 6. Uprav hru s AI pomocníkem

Ve VS Code i v Codespaces je AI pomocník **GitHub Copilot**: otevři okno **Chat** (ikona Copilota nahoře)
a dole v chatu přepni režim na **Agent**. Pak umí sám číst a upravovat soubory. Můžeš použít i jiného AI pomocníka,
který umí pracovat se soubory. Pravidla hry zná ze souboru `AGENTS.md`.

Co mu napsat:

- **Na začátku:**
  > Přečti si AGENTS.md a docs/FEATURES.md. Chci do hry přidat med: nový předmět, který se vyrobí z lesních plodů
  > a dá se sníst. Udělej co nejmenší změnu, vysvětli mi ji česky a řekni mi, jak to vyzkouším.
- **Když nevíš, co dělat:**
  > Přečti si AGENTS.md a docs/FEATURES.md a navrhni mi 3 malé věci, které můžu do hry přidat jako začátečník.
- **Když něco nefunguje:**
  > Spustil jsem `npm run dev` a vidím tuhle chybu: … Vysvětli mi česky, co znamená, a oprav ji.
- **Než to pošleš:**
  > Zkontroluj moji změnu podle AGENTS.md: je co nejmenší, texty ve hře jsou česky, je zapsaná v docs/FEATURES.md
  > a projde `npm test` i `npm run build`? Co je potřeba opravit, mi vysvětli česky.

Dobré vědět:
- **Jedna věc najednou.** Nový tvor = jeden pull request. Nový tvor + déšť + truhla = tři.
- Předměty, recepty, bloky, jídla a tvorové se přidávají hlavně ve složce **`shared/`**.
- Všechny texty ve hře jsou **česky**.
- Když AI navrhne změnit „jádro“ hry (síť, ukládání, server, pořadí modulů), ať ti vysvětlí, co se může rozbít,
  a přidá na to test. Do pull requestu napiš, že měníš jádro.
- Do hry nepřidáváme nic, co by sbíralo osobní údaje.

## 7. Vyzkoušej to

Ve hře (`npm run dev`, **Hrát sám**) vyzkoušej, že tvoje věc funguje. Užitečné příkazy v konzoli prohlížeče (F12):
`game.addItem('med', 5)`, `game.setTime(0.9)` (noc), `game.setCreative(true)`.

Pak spusť testy:
```bash
npm test
npm run build
```
Když něco svítí červeně, ukaž chybu AI pomocníkovi a oprav to.

## 8. Pošli to do společné hry

```bash
git add .
git commit -m "Přidán med"
git push -u origin med-a-vcely
```
Tím se změna nahraje do **tvého forku**. Otevři ho na GitHubu a klikni **Compare & pull request**
(nebo **Contribute → Open pull request**). Zkontroluj, že cíl je `Richard-Vesely/rise`, větev `main`, a napiš:
- **co** jsi přidal(a),
- **jak** to vyzkoušet (třeba „vyrob med ze 4 lesních plodů a sněz ho“),
- kdo na tom pracoval.

## 9. Kontrola

- **CI** (automatická kontrola) sestaví hru, spustí testy a hru si sama zahraje v prohlížeči.
  Musí být zelená ✅. Když je červená ❌, klikni na **Details** a podívej se, co se nepovedlo.
- Nikdo to nemusí schvalovat. Když je CI zelená ✅, **Robot kroužku** pull request do pár minut sám
  **sloučí do `main`** a napíše ti to do komentáře. (Můžeš i sám kliknout **Merge pull request**.)
- Když to sloučit nejde (CI je červená nebo je konflikt s `main`), robot napíše do komentáře česky, co je
  špatně, a přidá **zadání pro tvého AI pomocníka**: zkopíruj ho do chatu, nech AI opravit a pushni.
  Nechceš, aby robot sloučil rozdělanou věc? Založ pull request jako **Draft**.
- Když chceš, ať se na to někdo podívá (kamarád nebo Richard), napiš mu. Připomínky oprav ve stejné větvi
  (`git commit` + `git push`), pull request se sám aktualizuje a CI proběhne znovu.
- Za pár minut je změna ve hře na webu (https://richard-vesely.github.io/rise/) a na serveru kroužku,
  jakmile na něm nikdo nehraje (server se aktualizuje sám).

## Pravidla

1. Jedna malá věc na jeden pull request.
2. Texty ve hře česky.
3. Nové věci do `docs/FEATURES.md`.
4. Nic nemaž, co dělá někdo jiný; když něco nefunguje, napiš issue.
5. Do společné hry jde všechno přes pull request.
