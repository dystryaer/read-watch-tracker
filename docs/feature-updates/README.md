# Feature: Updates – wo neue Kapitel warten

> Status: **umgesetzt** · 2026-10-22 · Branch `feat/updates-seite` · Aufgabe T47 · SPEC §4.9, U8
> Screenshots der fertigen Seite: [`docs/screenshots/feat-updates-seite/`](../screenshots/feat-updates-seite/)
> Entwurf als Klick-Mock: [`mock.html`](mock.html) · [Desktop](mock-desktop.png) · [Handy](mock-mobile.png). Der Mock zeigt den Stand **vor** den Entscheidungen (Arbeitstitel „Galerie“, Abschnitt „Nicht geprüft“); wo er abweicht, gilt diese Datei.

## 0. Entscheidungen des Nutzers (2026-10-22)

Alle Fragen sind entschieden. Sie gehen dem übrigen Text vor; der Text unten ist bereits an sie angepasst.

| # | Frage | Entscheidung |
|---|---|---|
| Design | Welcher Vorschlag aus `docs/mocks/` | **Vorschlag 1 „Cover-Regal“** ist die neue Optik der App; die Updates-Seite nutzt dieselbe Sprache (große Cover 2:3, Badge oben rechts, Titel darunter) |
| 1 | Eigene Seite oder Umschalter | **Eigene Seite mit eigenem Navigationseintrag.** Name **„Updates“**, Pfad **`/updates`** (endgültig) |
| 2 | Ziel des Klicks aufs Bild | Gibt es neue Kapitel: **das erste ungelesene (n+1)**, dieselbe Adresse wie „Weiterlesen“. Gibt es keins: **das neueste Kapitel, also das zuletzt gelesene** (`last_url`). Immer im neuen Tab |
| 3 | Alle oder nur Werke mit Neuem | **Alle**; Werke mit neuen Kapiteln stehen oben und sind hervorgehoben (Ring, „+N“) |
| 4 | Reihenfolge | Standard **„Zuletzt gelesen“**, umschaltbar auf **„Meiste neue“**; dazu der Umschalter **„Alle \| Nur neue“** |
| 5 | Titel immer sichtbar | **Ja**, höchstens 2 Zeilen, darunter der Stand. Der Titel führt zur Detailseite |
| 6 | Werke ohne Kapitel (`Kap. ?`) | **Nicht anzeigen** (kein zugeklappter Abschnitt) |
| 7 | Abgeschlossen, abgebrochen, Light Novels | **Anzeigen, wenn es neue Kapitel gibt.** Die Extension prüft dafür auch Serienseiten abgeschlossener und abgebrochener Werke (SPEC §7.11). Für Light Novels gibt es noch keine eigene Quelle für neue Kapitel; sie erscheinen nur, wenn `latest_chapter` gesetzt ist |
| 8 | Werke ohne bekannte Lese-Seite | **Anzeigen, aber ausgegraut und nicht klickbar.** Kein Link auf dem Bild, sichtbarer Hinweis „keine Seite bekannt“; der Titel führt weiter zur Detailseite |
| 9 | Zähler in der Navigation | **Ja:** die Zahl der **Werke** mit neuen Kapiteln („Updates 5“), keine Zahl bei 0. Screenreader hören „5 Werke mit neuen Kapiteln“. Eine günstige Abfrage pro Seitenaufruf |
| 10 | Bilder verkleinern | **Nein**, erst messen |

## 1. Ziel und User Story

**Ziel:** Ich sehe auf einen Blick, bei welchen Manga, Manhwa und Manhua neue Kapitel erschienen sind, und lande mit einem Klick beim ersten ungelesenen Kapitel.

| # | Als Nutzer will ich … | damit … |
|---|---|---|
| U8 | eine eigene Seite „Updates“ aus Covern, auf der Werke mit neuen Kapiteln markiert oben stehen, und ein Klick aufs Cover öffnet das erste ungelesene Kapitel | ich sofort weiß und erreiche, wo es etwas Neues zu lesen gibt |

Die Daten gab es schon: Die Extension meldet das neueste Kapitel (§7.11), die Übersicht zeigt daraus „3 neu“ (§4.2), und „Weiterlesen“ baut den Link (§4.4). Die Seite ist vor allem eine neue Ansicht auf diese Daten. Neu auf dem Server sind nur die Prüfung abgeschlossener und abgebrochener Werke und zwei kleine Abfragen (Abschnitt 5).

## 2. Wo die Seite lebt

- Eigene Seite **`/updates`**, Navigationseintrag **„Updates“** zwischen „Übersicht“ und „Schnell-Update“. Der Pfad ist englisch wie `/quick` und `/stats`.
- Name und Pfad stehen an einer Stelle: `UPDATES_PAGE` in `apps/web/src/lib/updates-page.ts`. Next.js nimmt den Pfad aus dem Ordner `app/(app)/updates/`; ein Unit-Test prüft, dass beide zusammenpassen.
- Die Startseite bleibt die Übersicht, die PWA startet weiter mit dem Schnell-Update (§4.6). Die Übersicht bleibt unverändert.

## 3. Layout

Desktop (Container 1024 px wie in der übrigen App, 6 Spalten ab 1024 px, 5 ab 768 px, 4 ab 640 px):

```
 ▣ Read-Watch-Tracker      Übersicht  [Updates ⑧]  Schnell-Update  Statistik  Einstellungen  Abmelden
 ─────────────────────────────────────────────────────────────────────────────────────────────────
 Updates                                         [ Alle 74 | Nur neue 8 ]  Reihenfolge [Zuletzt gelesen ▾]
 8 Werke mit neuen Kapiteln · 30 Kapitel zu lesen
 Serienseiten zuletzt geprüft vor 1 Std.
 Bild: weiterlesen im neuen Tab · Titel: Details

 Neue Kapitel ⑧
 ╔══════╗+4  ╔══════╗+3  ╔══════╗+2  ╔══════╗+2  ╔══════╗+5  ╔══════╗+1
 ║ Bild ║    ║      ║    ║      ║    ║      ║    ║      ║    ║      ║      ← Ring + „+N“ = neu
 ║ 2:3  ║    ║      ║    ║      ║    ║      ║    ║      ║    ║      ║        Hover/Fokus im Bild:
 ╚══════╝    ╚══════╝    ╚══════╝    ╚══════╝    ╚══════╝    ╚══════╝        „Kap. 345 lesen ↗“
 Overgeared  Omniscie…   Eleceed     Shadow Sl…  Swordmas…   One Piece     ← Titel → Detailseite
 Kap. 344    Kap. 250    Kap. 421    Kap. 1204   Kap. 216    Kap. 1172
   von 348     von 253     von 423     von 1206    von 221     von 1173
                                     Light Novel

 Ohne neue Kapitel 66
 ┌──────┐    ┌──────┐    ┌──────┐    ┌┄┄┄┄┄┄┐
 │      │    │      │    │      │    ┊ grau ┊                            ← ohne Lese-Seite: grau,
 └──────┘    └──────┘    └──────┘    └┄┄┄┄┄┄┘                              kein Link
 Nano Mach…  Absolute …  Return of…  Absolute Necromancer
 Kap. 332    Kap. 51     Kap. 89     Kap. 30
                                     keine Seite bekannt
```

Handy (375 px, 3 Spalten): Kopfzeile wie oben, darunter Umschalter und Reihenfolge in einer Zeile (die Beschriftung „Reihenfolge“ nur für Screenreader). Die Navigation scrollt wie bisher waagerecht.

## 4. Verhalten

### 4.1 Inhalt, Abschnitte, Reihenfolge

- **Inhalt** (reine Funktion `toUpdateItem` in `apps/web/src/lib/updates.ts`):

| Werk | erscheint |
|---|---|
| Manga, Manhwa, Manhua im Status „Lese“ mit bekanntem Stand | immer |
| abgeschlossene und abgebrochene Werke | nur mit neuen Kapiteln |
| Light Novels (jeder Status) | nur mit neuen Kapiteln (also nur, wenn `latest_chapter` gesetzt ist) |
| `Kap. ?` (Stand unbekannt) | nie |
| E-Books, Anime, Serien, Filme | nie |
| bekannter Stand, aber keine Lese-Seite | ja, ausgegraut, ohne Link auf dem Bild, mit „keine Seite bekannt“ |

- **Neu** heißt wie beim Badge in der Liste (§4.2): `floor(latest_chapter) − floor(chapter) > 0`. Kap. 470.5 mit neuestem Kapitel 472 zeigt „+2“. Zeigt die Serienseite weniger als gelesen, ist nichts neu.
- **Zwei Abschnitte:** „Neue Kapitel“ (Ring und „+N“) und darunter „Ohne neue Kapitel“ (auf dem Stand oder noch nie geprüft).
- **Reihenfolge** (gilt in jedem Abschnitt): `Zuletzt gelesen` (Standard; Werke ohne Aktivität unten, bei Gleichstand nach Titel) · `Meiste neue` (nach Zahl der neuen Kapitel, dann wie „Zuletzt gelesen“).
- **Umschalter** `Alle | Nur neue`, jeweils mit Anzahl: „Nur neue“ zeigt nur den ersten Abschnitt.
- **Kopfzeile:** „8 Werke mit neuen Kapiteln · 30 Kapitel zu lesen“ (sonst „Gerade nichts Neues“) und „Serienseiten zuletzt geprüft vor 1 Std.“ (jüngstes `latest_chapter_at`; sonst „Serienseiten noch nie geprüft“). Die zweite Zeile zeigt, ob die Extension überhaupt prüft.
- **Leerer Abschnitt „Neue Kapitel“:** „Gerade nichts Neues. Die Extension prüft die Serienseiten einmal am Tag, solange Brave läuft.“
- Auswahl und Beschriftungen entstehen auf dem Server; Umschalter und Reihenfolge laufen im Browser (`updateSections`, ohne Server-Roundtrip). Eine Suche und ein Typ-Filter gibt es nicht; die Titel sind sichtbar, Strg+F findet sie.

### 4.2 Karte

- **Bild** im Format 2:3, beschnitten (`object-cover`), volle Kartenbreite. Ohne Bild die Kachel mit Initialen in derselben Farbe wie in der Liste (`coverTile` aus `lib/cover.ts`), nur größer.
- **Markierung:** Badge „+3“ oben rechts als Text, nicht nur als Farbe, dazu ein Ring in Akzentfarbe. Der Abschnittstitel „Neue Kapitel“ sagt es ein drittes Mal.
- **Unter dem Bild:** der Titel (höchstens 2 Zeilen) und der Stand („Kap. 344 von 348“; bei nichts Neuem nur „Kap. 332“). Eine kleine Zeile nennt, was das Werk von einem gelesenen Comic unterscheidet: „Light Novel“, „Abgeschlossen“, „Abgebrochen“.
- **Ohne Lese-Seite:** Bild grau und halb transparent, kein Link, darunter „keine Seite bekannt“.
- **Hover und Tastaturfokus** (nur Geräte mit Maus): eine Leiste unten im Bild, „Kap. 345 lesen ↗“ bzw. „Zuletzt gelesen ↗“. Sie ist Beiwerk; nötige Informationen stehen sichtbar auf der Karte.

### 4.3 Klickverhalten

| Fall | Klick aufs Bild öffnet | Tab |
|---|---|---|
| neue Kapitel, *n+1* ableitbar (Seitenregel oder generische Regel, inkl. Domain-Umzug; §4.4 Regeln 1, 2, 4) | das erste ungelesene Kapitel `floor(n) + 1`, **dieselbe Adresse wie „Weiterlesen“** in der Übersicht | neu |
| neue Kapitel, nur `last_url` ohne erkennbares Muster (§4.4 Regel 3) | das zuletzt gelesene Kapitel, wie „Weiterlesen“ („Zuletzt gelesen“) | neu |
| nichts Neues (auf dem Stand oder nie geprüft) | das neueste Kapitel, also das zuletzt gelesene (`last_url`, auf der aktuellen Domain der Quelle) | neu |
| keine Lese-Seite bekannt (z. B. aus dem Excel-Import, nie in Brave gelesen) | nichts: Bild ohne Link, ausgegraut | – |

- **Der Titel** unter dem Bild führt immer zur Detailseite: ein eigener Link mit eigenem Tab-Stopp.
- **Warum *n+1* statt des neuesten Kapitels:** Der Stand ist das zuletzt gelesene Kapitel (§2.4). Das neueste Kapitel würde Kapitel überspringen, und seine Adresse wird nicht gespeichert (§7.11 meldet nur die Nummer). Ob *n+1* existiert, wird wie bei „Weiterlesen“ nicht geprüft (§4.4 Regel 6).
- **Neuer Tab** mit `target="_blank" rel="noopener noreferrer"`: Die Seite bleibt offen, die Lese-Seite sieht keinen Referer. Es werden nur http(s)-Adressen verlinkt (`parseHttpUrl`).
- **Zurück aus dem Lese-Tab:** `RefreshOnReturn` lädt Seite und Zähler neu, sobald der Tab wieder sichtbar ist. Eine Karte darf dabei den Abschnitt wechseln.
- Ein Unit-Test prüft für Seitenregel, generische Regel, Domain-Umzug und fehlendes Muster, dass die Adresse gleich der von „Weiterlesen“ ist.

### 4.4 Barrierefreiheit

- Jeder Abschnitt ist eine `<section>` mit `<h2>`, jede Liste ein `<ul>` mit `aria-label`, jede Karte ein `<li>`.
- **Bild-Link** mit vollem Namen: „Overgeared: Kapitel 345 lesen (4 neue Kapitel, öffnet neuen Tab)“ bzw. „Nano Machine: zuletzt gelesenes Kapitel 332 öffnen (öffnet neuen Tab)“. Das Bild hat `alt=""`, die Kachel `aria-hidden`.
- **Titel-Link:** „Overgeared, Details“ (`aria-label`, beginnt mit dem sichtbaren Titel). Bei grauen Karten ist er der einzige Link; das Badge nennt die neuen Kapitel dort als Text für Screenreader.
- **Tastatur:** zwei Tab-Stopps pro Karte in Lesereihenfolge, sichtbarer Fokusring (3 px, mit Abstand zum Ring für „neu“). Die Leiste im Bild erscheint auch bei Tastaturfokus.
- **Kontraste:** Badge weiß auf teal-700, dunkel teal-950 auf teal-300; graue Schrift mindestens zinc-500 auf zinc-50. „Neu“ ist nie nur Farbe: Text „+3“ und Abschnittstitel.
- `prefers-reduced-motion`: kein Anheben und kein Einblenden.

### 4.5 Dunkelmodus

Über `dark:`-Klassen wie in der übrigen App (`prefers-color-scheme`). Das Badge kehrt sich um (teal-300 mit teal-950), der Ring wird teal-400, die Kacheln nutzen die Töne 950/300 wie `CoverThumb`.

### 4.6 Zähler in der Navigation

- „Updates 8“: die Zahl der **Werke** mit neuen Kapiteln, also genau die Karten im Abschnitt „Neue Kapitel“. Bei 0 steht nur „Updates“.
- Für Screenreader heißt der Link „Updates, 8 Werke mit neuen Kapiteln“ (`aria-label`; die nackte Zahl sagt allein nichts).
- Das Layout holt die Zahl mit `countWorksWithNewChapters(db)`: ein `count(*)` über `works` mit derselben Regel wie oben, ohne Joins. Die Datenbank bekommt das Layout über `getAuthorizedDb()`; die Sitzungsprüfung bleibt also, wo sie war.

## 5. Daten und Änderungen

**Keine Migration, keine neue Abhängigkeit, kein neuer HTTP-Endpunkt, keine neue Berechtigung der Extension.**

| # | Änderung | Wo |
|---|---|---|
| S1 | `/series-watch` liefert auch abgeschlossene und abgebrochene Werke; `/latest-chapters` nimmt für sie an. Werke im Status „Lese“ zuerst, dann die übrigen, jeweils zuletzt gelesene zuerst (die Grenze von 500 trifft so die unwahrscheinlichsten). Die Grenzen der Extension bleiben: jede Serie höchstens einmal am Tag, höchstens 10 pro Stunde, höchstens 3 pro Seite | `packages/server/src/latest.ts` |
| S2 | `countWorksWithNewChapters(db)` für den Zähler, `lastSeriesCheck(db)` für „zuletzt geprüft“ | `packages/server/src/updates.ts` |
| W1 | `UPDATES_PAGE` (Name, Pfad) und `worksWithNewChaptersLabel` | `apps/web/src/lib/updates-page.ts` |
| W2 | reine Funktionen `toUpdateItem`, `updateLink`, `updateSections`, `updatesSummary`, `lastCheckLabel` | `apps/web/src/lib/updates.ts` |
| W3 | `newChapterCount` aus `lib/overview.ts` exportiert, damit Liste, Seite und Zähler dieselbe Regel nutzen | `apps/web/src/lib/overview.ts` |
| W4 | Seite, Bildschirm, Karte, Cover in voller Breite | `app/(app)/updates/page.tsx`, `components/updates/*` |
| W5 | Navigationseintrag mit Zähler | `components/nav-links.tsx`, `app/(app)/layout.tsx` |

Die Extension filtert nicht selbst nach Status (`apps/extension/src/lib/new-chapters.ts` prüft, was `/series-watch` liefert) und braucht deshalb keine Änderung.

Die Seite nutzt `listOverview` unverändert (4 Abfragen, unabhängig von der Zahl der Werke) und filtert auf dem Server, bevor Daten an den Browser gehen. `OverviewRow` bleibt gleich.

## 6. Performance und Grenzen

- **Bilder** kommen nur von `/works/[id]/cover?v=…` (eigener Origin; die CSP erlaubt `img-src 'self' data:`) mit `private, max-age=31536000, immutable`, alle mit `loading="lazy"` und `decoding="async"`, `width`/`height` 300 × 450 und `aspect-[2/3]` gegen Layout-Sprünge.
- **Größe:** Bilder werden nicht verkleinert (Entscheidung 10). Erst die Bildbytes beim ersten Laden messen; eine Verkleinerung auf dem Server (z. B. `sharp`) wäre eine neue Abhängigkeit und braucht Freigabe (§16).
- **CSP:** keine Inline-Styles; Seitenverhältnis, Ring, Kachelfarben und Leiste laufen über Tailwind-Klassen. Der Mock nutzt Inline-Styles nur, weil er eigenständig ist.
- **Grenzen aus §16/§18:** Der Browser lädt keine Bilder von fremden Servern. Die Seite löst keine zusätzlichen Prüfungen aus und hat keinen „Jetzt prüfen“-Knopf. Keine neuen Berechtigungen, kein Umgehen von Bot-Schutz.
- **Mehr Prüfungen:** Abgeschlossene und abgebrochene Werke kommen auf die Liste der Extension. Weil die Extension höchstens 10 Serien pro Stunde prüft, dauert eine Runde über alle Serien bei vielen solchen Werken länger; Werke im Status „Lese“ stehen vorn, nie geprüfte Serien gehen vor (§7.11).

## 7. Akzeptanzkriterien

- [x] `/updates` zeigt Manga, Manhwa und Manhua mit bekanntem Stand als Raster aus Bildern im Format 2:3: 3 Spalten bei 375 px, 6 im 1024-px-Container. Bei 375 px gibt es kein waagerechtes Scrollen (E2E).
- [x] Werke mit `floor(latest_chapter) − floor(chapter) > 0` stehen oben im Abschnitt „Neue Kapitel“ und tragen „+N“; Screenreader hören „N neue Kapitel“. Kap. 470.5 mit neuestem Kapitel 472 zeigt „+2“ (Unit).
- [x] `Kap. ?` erscheint nie; abgeschlossene, abgebrochene Werke und Light Novels nur mit neuen Kapiteln (Unit, E2E).
- [x] Ein Klick aufs Bild öffnet in einem neuen Tab: mit neuen Kapiteln dieselbe Adresse wie „Weiterlesen“, sonst das zuletzt gelesene Kapitel (Unit, E2E).
- [x] Ohne Lese-Seite ist die Karte ausgegraut, das Bild kein Link, „keine Seite bekannt“ steht darunter; der Titel führt zur Detailseite (E2E).
- [x] „Nur neue“ und die Reihenfolge reagieren ohne Server-Roundtrip. Die Übersicht bleibt unverändert, ihre E2E-Tests bleiben grün.
- [x] Die Navigation zeigt „Updates N“ mit der Zahl der Werke mit neuen Kapiteln, ohne Zahl bei 0; Screenreader hören „N Werke mit neuen Kapiteln“ (Unit, E2E).
- [x] Die Extension prüft auch Serienseiten abgeschlossener und abgebrochener Werke; der Tracker nimmt deren neueste Kapitel an (Integration, E2E).
- [x] Die Seite lädt nur Ressourcen vom eigenen Origin (E2E prüft alle Requests).
- [x] Tastatur: zwei Tab-Stopps pro Karte mit sichtbarem Fokus; „neu“ ist nie nur Farbe. Hell und dunkel per Screenshot geprüft.
- [ ] Mit 500 Werken: LCP < 1,5 s (Desktop), CLS < 0,1 – noch nicht gemessen.
- [ ] Brave-Lauf mit echter Extension: abgeschlossenes Werk bekommt neue Kapitel – noch offen (manuell).

## 8. Aufgaben in Scheiben (T47)

| Scheibe | Inhalt | Test | Stand |
|---|---|---|---|
| T47a | SPEC: §4.9 Updates, U8, Satz „Der einzige Hauptbildschirm“ in §4, §6.1 und §7.11 (abgeschlossene und abgebrochene Werke) | Review | erledigt |
| T47b | server: `seriesToWatch`/`recordLatestChapters` auch für abgeschlossene und abgebrochene Werke, Lese-Werke zuerst | Integration (Vitest + PGlite): `packages/server/test/latest.test.ts` | erledigt |
| T47c | server: `countWorksWithNewChapters`, `lastSeriesCheck` | Integration: `packages/server/test/updates.test.ts` | erledigt |
| T47d | web: `lib/updates.ts` und `lib/updates-page.ts`, reine Funktionen (Auswahl, Reihenfolge, Klickziel, Beschriftungen) | Unit, tabellengetrieben, TDD: `apps/web/test/updates.test.ts` | erledigt |
| T47e | web: Seite `/updates`, `UpdatesScreen`, `UpdateCard`, `UpdateCover` (volle Breite, 2:3, lazy) | E2E | erledigt |
| T47f | web: Navigationseintrag mit Zähler | E2E | erledigt |
| T47g | Handy, Barrierefreiheit, Datenschutz | E2E: 375 px ohne Querscrollen, nur Requests an den eigenen Origin; Screenshots hell/dunkel/Handy | erledigt |

Nicht hier: Der Apostroph-Fehler in `coverTile` („Ranker’s Return“ ergibt heute „RS“) wird im Umbau der Übersicht (Cover-Regal) behoben; die Updates-Seite nutzt `coverTile` unverändert und profitiert davon.

## 9. Nicht gebaut

- Ein Link zum **neuesten** Kapitel (bräuchte `works.latest_chapter_url`, also Migration und API-Änderung, §16)
- Bilder auf dem Server verkleinern (neue Abhängigkeit, §16; erst messen)
- Eine Quelle für neue Kapitel von Light Novels (offen, Spike S2; ein Discord-Bot für WebNovel-Updates wäre eine neue Drittanbieter-Anbindung)
- Ein „Jetzt prüfen“-Knopf, Push-Benachrichtigungen oder Prüfungen öfter als einmal am Tag (§18)
- Den Stand auf der Seite ändern; Stepper und Bearbeiten bleiben in Übersicht und Detailseite
- „Als gesehen markieren“, ohne zu lesen
- Fremde Bilder, Favicons oder Cover-Datenbanken
- Eine eigene Sortierung per Ziehen
