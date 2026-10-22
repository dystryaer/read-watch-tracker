# Design-Overhaul: Vorschläge, Tokens und Mocks

> Status: **Vorschlag** · 22.10.2026 · nichts eingebaut, kein App-Code geändert
> Mocks: zwei Stilrichtungen mit je sechs Seiten (`a-*.html`, `b-*.html`), im Browser öffnen. Screenshots in [`screenshots/`](screenshots/).
> Rahmen: Übersicht als **Cover-Regal** und die neue Seite **Updates** sind entschieden ([Entwurf Cover-Galerie](../feature-cover-galerie/README.md) und `docs/mocks/01-regal.html`, beide noch nicht versioniert). Dieser Vorschlag gibt beiden und allen übrigen Seiten eine gemeinsame Gestaltung.

## 1. Kurzfazit

- Heute ist die App korrekt und zugänglich, wirkt aber wie ein Formular. Jede Zeile der Übersicht hat einen gefüllten Teal-Knopf, das Cover misst 40 × 56 px, und die Detailseite stapelt sieben gleich wichtige Abschnitte mit sechs Hauptknöpfen.
- Vorschlag: **Das Cover wird zum Werk.** Ein Klick aufs Cover liest weiter, der Titel öffnet die Details, und zwar in der Übersicht genauso wie in Updates. Pro Bereich gibt es nur noch einen Hauptknopf.
- **„Neu“ bekommt eine eigene Farbe, die sonst nirgends vorkommt** (Textmarker-Gelb), und steht immer mit Zahl da: „+2“.
- **Zwei Stilrichtungen zur Wahl:**
  - **A „Papier“** ist ruhig und hell. Bücher stehen im Regal, neue Kapitel stecken als Haftmarker im Buch.
  - **B „Kino“** ist kräftig und dunkel. Das Cover färbt die Seite, und die Kapitelzahl ist die Schlagzeile.
  - Beide gibt es hell und dunkel, beide erfüllen WCAG AA.
- **Empfehlung:** A als Grundlage, dazu aus B die große Zahl und der Schein in Cover-Farbe auf der Detailseite.
- Viele Gewinne sind klein (Aufwand S) und unabhängig vom Regal-Umbau, siehe [§ 8](#8-priorisierte-liste).

| | Desktop | Handy |
|---|---|---|
| **Heute** | [Übersicht](screenshots/vorher-uebersicht-desktop-hell.png) · [Detail](screenshots/vorher-detail-desktop-hell.png) · [Login](screenshots/vorher-login-desktop-hell.png) | [Übersicht](screenshots/vorher-uebersicht-mobile-hell.png) · [Schnell-Update](screenshots/vorher-schnell-mobile-hell.png) |
| **Entwurf (bisher)** | [Regal](screenshots/entwurf-regal-desktop.png) · [Updates](screenshots/entwurf-updates-desktop.png) | [Regal](screenshots/entwurf-regal-mobile.png) · [Updates](screenshots/entwurf-updates-mobile.png) |
| **A „Papier“** | [Übersicht](screenshots/a-01-uebersicht-desktop-hell.png) · [Updates](screenshots/a-02-updates-desktop-hell.png) · [Detail](screenshots/a-03-detail-desktop-hell.png) · [Login](screenshots/a-05-login-desktop-hell.png) · [Tokens](screenshots/a-00-system-desktop-hell.png) | [Übersicht](screenshots/a-01-uebersicht-mobile-hell.png) · [Eintragen](screenshots/a-04-eintragen-mobile-hell.png) · [Detail](screenshots/a-03-detail-mobile-hell.png) |
| **B „Kino“** | [Übersicht](screenshots/b-01-uebersicht-desktop-dunkel.png) · [Updates](screenshots/b-02-updates-desktop-dunkel.png) · [Detail](screenshots/b-03-detail-desktop-dunkel.png) · [Login](screenshots/b-05-login-desktop-dunkel.png) · [Tokens](screenshots/b-00-system-desktop-dunkel.png) | [Übersicht](screenshots/b-01-uebersicht-mobile-dunkel.png) · [Eintragen](screenshots/b-04-eintragen-mobile-dunkel.png) · [Detail](screenshots/b-03-detail-mobile-dunkel.png) |

Jede Seite gibt es als `<richtung>-<nr>-<seite>-<desktop|mobile>-<hell|dunkel>.png`, insgesamt 48 Bilder.

---

## 2. Ausgangslage: was heute auffällt

Die Vorher-Bilder stammen aus der echten App (Produktions-Build, Wegwerf-Datenbank mit den Beispieldaten unten).

**Gut, und das bleibt:**

- Die Kontraste stimmen, alles lässt sich per Tastatur bedienen, und Zahlen stehen in Tabellenziffern.
- Der Dunkelmodus folgt dem System.
- Fehlt ein Bild, erscheint eine Kachel.
- Kein Request verlässt den eigenen Server.

**Übersicht** ([Bild](screenshots/vorher-uebersicht-desktop-hell.png)):

- Bis zu sieben gefüllte Teal-Knöpfe pro Bildschirm konkurrieren miteinander.
- Derselbe Knopf hat drei Beschriftungen: „Weiterlesen ›“, „Zuletzt gelesen ›“ und „Öffnen ›“.
- Cover messen 40 × 56 px. Die Initialen-Kacheln sehen alle gleich aus, und aus „Omniscient Reader's Viewpoint“ wird „OR“.
- Teal steht für Knopf, Navigation, „2 neu“ und den gespeicherten Zustand zugleich und sagt deshalb nichts mehr. Amber steht für „Kap. ?“ und für das Zuordnungs-Banner.
- Der Typ heißt in der Zeile „Novel“, im Reiter „Light Novels“.

**Detailseite** ([Bild](screenshots/vorher-detail-desktop-hell.png)):

- Im Kopf fehlen „Weiterlesen“ und der Stepper. Das Wichtigste (Kapitel 422 öffnen) gibt es hier gar nicht.
- Bild, Titel, Stand, Status, Quellen, Verlauf und Zusammenführen sind gleich gewichtet und haben sechs Hauptknöpfe.
- Zwei „Lösen“-Knöpfe sind voll rot, also lauter als jede positive Handlung.
- Der Verlauf zeigt nur absolute Zeiten („22.10.2026, 01:32“), keine relativen.

**Handy** ([Übersicht](screenshots/vorher-uebersicht-mobile-hell.png), [Schnell-Update](screenshots/vorher-schnell-mobile-hell.png)):

- Die Navigation ist eine scrollende Zeile, „Einstellungen“ wird abgeschnitten.
- Die Stepper-Knöpfe messen 28 px. WCAG 2.5.8 verlangt mindestens 24 px, Apple empfiehlt 44 pt.
- Nach einem Tipp kommt keine sichtbare Rückmeldung, und es gibt kein Rückgängig.

**Allgemein:**

- Es gibt keine Symbole. Pfeile sind Textzeichen („→“, „›“).
- Die Systemschrift läuft ohne Typo-Skala, Überschriften und Text unterscheiden sich kaum.
- Tiefe entsteht aus Rahmen und Linien statt aus Flächen.

## 3. Gestaltungsprinzipien

1. **Das Cover ist das Werk.** Es ist das größte Element und der wichtigste Klick: Ein Klick aufs Cover öffnet das nächste Kapitel in einem neuen Tab, der Titel darunter die Detailseite. Das gilt in der Übersicht und in Updates gleich (Entscheidung 2 aus dem Galerie-Entwurf).
2. **Eine Handlung pro Bereich.** Pro Karte, Kopf oder Formular gibt es höchstens einen gefüllten Knopf. Alles andere ist leise: Textknopf, Symbol oder eingeklappt. Gefährliches bleibt leise, bis es bestätigt wird.
3. **„Neu“ ist nie nur Farbe.**
   - „Neu“ hat eine reservierte Farbe (Gelb), eine eigene Form (Haftmarker bzw. goldene Zahl) und immer eine Zahl.
   - Gelb kommt sonst nirgends vor.
   - „Kap. ?“ ist eine gestrichelte Lücke wie eine Bleistiftmarkierung, keine zweite Warnfarbe.
4. **Struktur spürt man, man sieht sie nicht.** Flächen, Abstand und Größe gliedern die Seite, Linien und Rahmen werden seltener. Vorbild ist Linears Grundsatz „Structure should be felt not seen“.
5. **Häufiges oben, Seltenes eingeklappt.** Auf der Detailseite stehen Stand, Weiterlesen und Stepper oben. Umbenennen, Typ, Bild und Zusammenführen liegen unter „Bearbeiten“ in aufklappbaren Zeilen.
6. **Bewegung antwortet, sonst ist Ruhe.** Animiert wird nur, was auf eine Handlung folgt: gedrückt, gespeichert, rückgängig, Cover öffnet sich. Es gibt keine Einblend-Effekte beim Laden. Mit „Bewegung reduzieren“ bleibt nur Überblenden.
7. **Lokal und privat bleibt sichtbar.** Schriften werden selbst ausgeliefert, es kommen keine fremden Bilder und keine neuen Requests dazu. Die Farbe eines Covers wird aus dem eigenen Bild berechnet.

## 4. Zwei Stilrichtungen

| | **A „Papier“** (ruhig, hell zuerst) | **B „Kino“** (kräftig, dunkel zuerst) |
|---|---|---|
| Idee | Ein Bücherregal. Cover sind Bücher mit Buchrücken-Schatten und stehen auf einem Regalbrett. Neue Kapitel stecken als gelber Haftmarker oben im Buch. | Eine Kinoleinwand. Cover sind leuchtende Poster, das zuletzt gelesene Werk steht auf einer „Bühne“, und seine Cover-Farbe scheint in die Seite. |
| Grund | kühles Papiergrau `#F2F4F5`, weiße Blätter | tiefes Petrol-Nachtblau `#0E171C` |
| Akzent | Petrol `#0B5D66` (Weiterentwicklung des heutigen Teal) | Türkis `#45D6C6` |
| „Neu“ | Haftmarker in Textmarker-Gelb `#FFE15A` | goldene Zahl `#FFD447` mit Ring |
| Schrift | Werktitel und Überschriften in **Literata**, die Oberfläche in der Systemschrift | **Barlow** in drei Breiten: Semi Condensed für Titel, Condensed für große Zahlen, normal für Text |
| Cover | 2–4 px Radius wie ein Buch, Buchrücken links, Regalbrett darunter. Ohne Bild: Leinen-Einband mit Titelschild | 10 px Radius, Stand groß unten auf dem Bild, Typ oben links. Ohne Bild: große Initialen und Titel auf einem Farbverlauf |
| Tiefe | Kontur und ein weicher Buchschatten; im Dunkeln hellere Flächen | farbiger Schein in Cover-Farbe statt grauer Schatten |
| Handy-Navigation | Leiste unten, flach | schwebende Glasleiste, aktives Ziel invertiert |
| Stärken | ruhig, lange angenehm, bleibt nah am heutigen Teal, wirkt auch mit vielen Kacheln ohne Bild | auffällig, persönlich, große Zahlen auf dem Handy sofort lesbar, Cover-Farben tragen die Seite |
| Risiken | Das Regalbrett ist eine Metapher, die man mögen muss. Literata braucht eine selbst ausgelieferte Schrift (etwa 100–150 KB) | lebt von echten Covern und der Cover-Farbe (mehr Aufwand, [U4](#8-priorisierte-liste)). Im Hellmodus weniger eigen. Große Zahlen brauchen Platz |
| Mocks | [Tokens](a-00-system.html) · [Übersicht](a-01-uebersicht.html) · [Updates](a-02-updates.html) · [Detail](a-03-detail.html) · [Eintragen](a-04-eintragen.html) · [Login](a-05-login.html) | [Tokens](b-00-system.html) · [Übersicht](b-01-uebersicht.html) · [Updates](b-02-updates.html) · [Detail](b-03-detail.html) · [Eintragen](b-04-eintragen.html) · [Login](b-05-login.html) |

**Empfehlung: A „Papier“ als Grundlage, dazu zwei Teile aus B:**

1. Auf der Detailseite stehen die große Kapitelzahl und ein leichter Schein in der Cover-Farbe. A zeigt ihn schon zart im Kopf der Detailseite.
2. Auf „Eintragen“ (Handy) steht die große Zahl zwischen runden 56-px-Knöpfen.

Warum A: Der Tracker ist ein Werkzeug, das man täglich kurz öffnet. Ruhe und Lesbarkeit zählen mehr als Wirkung. A funktioniert auch, solange viele Titel aus dem Excel-Import noch kein Bild haben, weil der Leinen-Einband mit Titelschild auch ohne Bild gut aussieht. B entfaltet sich erst mit echten Covern und der Cover-Farbe.

---

## 5. Design-Tokens

### 5.1 Farben

**A „Papier“**

| Token | hell | dunkel | Verwendung |
|---|---|---|---|
| `--bg` Papier | `#F2F4F5` | `#13181B` | Seitengrund |
| `--surface` Blatt | `#FFFFFF` | `#1B2125` | Karten, Felder |
| `--surface-2` | `#E7EBED` | `#242B30` | Hover, Segment-Hintergrund, Skelett |
| `--line` | `#D3D9DD` | `#313A40` | Konturen (nicht interaktiv) |
| `--line-strong` | `#7D8A93` | `#6F7C85` | Rahmen von Eingaben (≥ 3 : 1) |
| `--ink` Tinte | `#15202B` | `#E8EDEF` | Text |
| `--ink-2` | `#4A5763` | `#A7B3BA` | Zweittext |
| `--ink-3` Bleistift | `#5D6A75` | `#8D99A1` | Metadaten, Zeiten |
| `--accent` Petrol | `#0B5D66` | `#5FC4C4` | Hauptknopf, Links, Fokus |
| `--on-accent` | `#FFFFFF` | `#062528` | Text auf Akzent |
| `--accent-soft` / `-ink` | `#DCEEEF` / `#084A52` | `#143A3D` / `#A5E6E3` | gewählte Filter, Hinweise |
| `--marker` Textmarker | `#FFE15A` | `#F5D94E` | **nur** „neu“ |
| `--on-marker` | `#2E2600` | `#2B2200` | Zahl auf Gelb |
| `--danger` | `#B42318` | `#FF8F85` | Fehler, Lösen, Zusammenführen |

**B „Kino“**

| Token | dunkel | hell | Verwendung |
|---|---|---|---|
| `--bg` Nacht | `#0E171C` | `#EDF1F2` | Seitengrund |
| `--surface` | `#152229` | `#FFFFFF` | Karten |
| `--surface-2` | `#1C2D35` | `#E1E8EA` | Hover |
| `--line` / `--line-strong` | `#284049` / `#5A7783` | `#CBD5D9` / `#73858D` | Konturen / Eingaben |
| `--ink` / `-2` / `-3` | `#F2F6F7` / `#A9BCC4` / `#8EA3AC` | `#0B161B` / `#44555D` / `#56676F` | Text |
| `--accent` Türkis | `#45D6C6` (Text `#03211E`) | `#0A6A63` (Text `#FFFFFF`) | Hauptknopf |
| `--marker` Gold | `#FFD447` (Text `#2A2000`) | gleich | **nur** „neu“ |
| `--danger` | `#FF8A7A` | `#B42318` | Fehler |
| `--glow` | Cover-Farbe | Cover-Farbe | Schein auf Bühne, Detail, Karten |

### 5.2 Kontraste (WCAG 2.2, berechnet)

| Paar | A hell | A dunkel | B dunkel | B hell | Ziel |
|---|---|---|---|---|---|
| Text auf Grund | 14,95 | 15,15 | 16,67 | 16,13 | ≥ 4,5 |
| Text auf Fläche | 16,49 | 13,78 | 14,93 | 18,34 | ≥ 4,5 |
| Zweittext auf Grund | 6,71 | 8,35 | 9,22 | 6,83 | ≥ 4,5 |
| Zweittext auf Fläche | 7,41 | 7,59 | 8,26 | 7,77 | ≥ 4,5 |
| Dritttext auf Fläche | 5,55 | 5,58 | 6,18 | 5,89 | ≥ 4,5 |
| Dritttext auf Grund | 5,03 | 6,14 | 6,90 | 5,18 | ≥ 4,5 |
| Knopftext auf Akzent | 7,58 | 7,81 | 9,42 | 6,45 | ≥ 4,5 |
| Akzent als Link auf Grund | 6,87 | 8,67 | 10,09 | 5,67 | ≥ 4,5 |
| Text auf Akzent-hell | 8,30 | 8,83 | 9,03 | 7,49 | ≥ 4,5 |
| Zahl auf „neu“-Gelb | 11,60 | 11,20 | 11,31 | 11,31 | ≥ 4,5 |
| Rahmen Eingabefeld auf Grund | 3,21 | 4,17 | 3,80 | 3,38 | ≥ 3 (1.4.11) |
| Rahmen Eingabefeld auf Fläche | 3,54 | 3,79 | 3,40 | 3,84 | ≥ 3 (1.4.11) |
| Fehlertext auf Fläche | 6,57 | 7,37 | 7,09 | 6,57 | ≥ 4,5 |
| Text auf Gefahr-Knopf | 6,57 | 8,46 | 8,14 | 6,57 | ≥ 4,5 |

Alle Werte sind Verhältnisse x : 1 und mit der WCAG-Formel für relative Leuchtdichte berechnet.

- Das Gelb hebt sich im Hellmodus kaum vom Grund ab (1,2 : 1). Bedeutung trägt deshalb die Zahl darauf (11,6 : 1), und der Haftmarker bekommt eine Kante und einen Schatten. Seine Form ist Beiwerk.
- Weiße Zahlen auf den B-Postern stehen nur im unteren Verlauf. Der Scrim reicht dort bis 88 % Deckkraft.

### 5.3 Akzent aus dem Cover

Vorbild sind Apple Music und Plex:

- Apple Music liefert zu jedem Artwork eine `bgColor` und vier passende Textfarben.
- Plex berechnet die Farben auf dem Server und schickt Farbwerte statt Bildern.
- Material 3 leitet aus *einer* Quellfarbe des Bildes ein ganzes Schema ab.

Für uns:

1. **Bestimmen, wenn das Bild gespeichert wird.** Die Detailseite verkleinert hochgeladene Bilder schon heute in einem Canvas. Aus denselben Pixeln wird die häufigste kräftige Farbe gezählt und mitgeschickt.
   - Bilder der Lese-Seiten lädt der Server herunter, kann sie aber nicht dekodieren. Zwei Wege:
     - **(a)** Der Browser bestimmt die Farbe beim ersten Anzeigen nach und speichert sie per Server Action. Das Bild kommt vom eigenen Origin, das Canvas ist also lesbar.
     - **(b)** Eine Bildbibliothek auf dem Server, z. B. `sharp` mit Color Thief v3. Das ist eine neue Abhängigkeit und braucht deine Freigabe nach SPEC §16.
2. **Speichern** als `work_covers.color`. Das ist eine Schemaänderung und braucht eine Freigabe.
3. **Lesbar machen.** Die Farbe wird in OKLCH auf feste Helligkeit gebracht und in der Sättigung begrenzt.
   - Flächen: L ≈ 0,95 (hell) bzw. 0,25 (dunkel), Chroma ≤ 0,06.
   - Schein: Chroma ≤ 0,15.
   - Text steht so immer auf bekanntem Kontrast.
4. **Ohne Inline-Styles anwenden**, siehe [§ 9.3](#93-werte-pro-werk-ohne-inline-styles).

### 5.4 Typografie

| Rolle | A „Papier“ | B „Kino“ |
|---|---|---|
| Seitentitel | Literata 32/37, 600 (Handy 27) | Barlow Semi Condensed 44/44, 700 (Handy 38) |
| Werktitel groß (Detail) | Literata 40/44, 600 (Handy 26) | Semi Condensed 76/68, 700 (Handy 44) |
| Abschnittstitel | Literata 20/26, 600 | Semi Condensed 24/26, 700 |
| Werktitel auf Karte | Literata 15,5/20, 600, max. 2 Zeilen | Semi Condensed 17/20, 700 |
| Fließtext | System 15/22, 400 | Barlow 15–16/24, 400 |
| Metadaten | System 13/18, 400 | Barlow 13/18, 400–600 |
| Badge, Zähler | System 12–14, 700 | Barlow Condensed 13–16, 700 |
| Große Zahl | System 30, 600 | Barlow Condensed 96–128, 700 |

- **Schriftwahl.** Literata entstand als Leseschrift für Google Play Books, passend für Buchtitel. Barlow gibt es in mehreren Breiten, die Condensed-Ziffern tragen große Zahlen auf kleinem Raum. Beide stehen unter der SIL Open Font License.
  - Alternative für die Oberfläche: Atkinson Hyperlegible Next (OFL, Braille Institute) mit sehr gut unterscheidbaren Ziffern.
  - Die Mocks zeigen lokale Platzhalter: Sitka statt Literata, Bahnschrift statt Barlow.
- **Skala.** Ungefähr Faktor 1,2 (kleine Terz). Zeilenlänge im Text höchstens 70 Zeichen.
- **Zahlen** immer `tabular-nums`, damit „Kap. 421“ und „Kap. 1204“ beim Hochzählen nicht springen. Literata bekommt etwas mehr Zeilenhöhe als die Sans.
- **Deutsch.** `lang="de"` steht schon, und `hyphens: auto` für lange Titel auf schmalen Karten funktioniert damit. Keine Versalien-Etiketten.

### 5.5 Abstände, Radien, Schatten

- **Raster 4 px:** 4, 8, 12, 16, 24, 32, 48, 64.
  - Karteninnenabstand 16–24 px.
  - Abstand zwischen Abschnitten 48 px.
  - Regal: 28 px Spalten- und 40 px Zeilenabstand.
- **Radien.**
  - A: Buch 2–4 px, Bedienelement 10 px, Fläche 16 px, Pille.
  - B: Poster 10 px, Karte 20 px, alles Bedienbare als Pille.
  - Verschiedene Radien zeigen Rangfolge. Ein Radius für alles wirkt wie ein Baukasten.
- **Schatten / Tiefe.**
  - A: Flächen haben eine 1-px-Kontur statt eines Schattens. Nur Bücher haben einen weichen Schlagschatten (`0 14px 22px -14px`), Aufklapper einen größeren.
  - B: Der Schein in Cover-Farbe ersetzt den Schatten.
  - Im Dunkeln heben sich höhere Ebenen durch hellere Flächen ab, wie es Apple HIG und Material 3 (Tonal Surfaces) empfehlen.
  - Bilder werden im Dunkelmodus auf 90 % Helligkeit gedimmt (HIG: „Soften white backgrounds in content images“).

### 5.6 Bewegung

| Token | Dauer | Kurve | Wofür |
|---|---|---|---|
| `fast` | 120 ms | `cubic-bezier(.2,0,0,1)` | Hover, Drücken (Skalierung 0,98) |
| `base` | 200 ms | gleich | Aufklappen, „Gespeichert“, Hover-Anheben 4 px |
| `slow` | 320 ms | `cubic-bezier(.05,.7,.1,1)` | Cover morpht in die Detailseite (View Transition) |

- Die Werte folgen den Material-3-Kurven *standard* und *emphasized decelerate* und den Dauern *short* und *medium*.
- **Mikrointeraktionen** nach NN/g: Rückmeldung direkt am Auslöser, kurz, mit Rückgängig.
  - Stepper: Die Zahl rückt 4 px nach oben.
  - „Gespeichert ✓“ erscheint am Knopf und blendet nach 4 s aus.
  - Ein gelesenes „+2“ schrumpft beim nächsten Laden weg.
- **`prefers-reduced-motion: reduce`:** kein Anheben, Skalieren oder Morphen, nur Überblenden. In Tailwind über `motion-safe:` bzw. `motion-reduce:`.
- **View Transitions:**
  - Bei Navigation zwischen Seiten: `@view-transition { navigation: auto; }`, Chrome/Edge ab 126 und Safari ab 18.2. Firefox ignoriert es ohne Schaden.
  - Cover und Detailbild brauchen denselben `view-transition-name`.

---

## 6. Komponenten-Katalog

Gezeigt in [`a-00-system.html`](a-00-system.html) und [`b-00-system.html`](b-00-system.html).

| Komponente | Vorschlag |
|---|---|
| **Cover-Karte** | Cover im Format 2:3, darunter Titel (max. 2 Zeilen), Stand, Quelle und Zeit. <br>• Klick aufs Cover öffnet das nächste Kapitel im neuen Tab. Hover/Fokus zeigt „Kap. 422 lesen ↗“ auf dem Bild. <br>• Der Titel öffnet die Details. <br>• Ein leiser „+“-Knopf (30 px, ohne Rahmen) zählt ein Kapitel weiter. <br>• Zwei Tab-Stopps pro Karte. <br>• Das `aria-label` des Covers nennt alles: „Eleceed: Kap. 422 lesen, 2 neue Kapitel (öffnet neuen Tab)“. |
| **Cover ohne Bild** | **Ganzer Titel statt Initialen.** <br>• A: Leinen-Einband in einem von 8 Tönen mit Papierschild. <br>• B: große Initialen angeschnitten, Titel darüber. <br>• Damit wird die Wand aus Initialen-Kacheln nach dem Excel-Import erkennbar. Die Apostroph-Korrektur (RR statt RS) aus dem Galerie-Entwurf (D3) gilt weiter. |
| **E-Book auf dem Cover** | 5 px Fortschrittsbalken an der Unterkante, gelb. Breite in 5-%-Stufen über Klassen. |
| **Badges** | <br>• „+2“: Gelb mit dunkler Zahl, nur für neue Kapitel. <br>• „Kap. ?“: gestrichelt in Bleistiftgrau. <br>• Typ und Status: graue Pillen. <br>• Quelle: Buchstabe in 18-px-Kästchen. <br>• Zähler in der Navigation: gelbe Pille. |
| **Knöpfe** | <br>• Primär: gefüllt, Akzent. <br>• Sekundär: Kontur. <br>• Leise: nur Text in Akzent. <br>• Gefahr: nur Text in Rot, erst im Bestätigungsschritt gefüllt. <br>• Höhe 40 px Desktop, 46–56 px Handy; „Bitte warten …“ mit 45 % Deckkraft. <br>• Neuer Tab nur mit ↗-Symbol, sonst keine angehängten Pfeile. |
| **Stepper** | Ein Rahmen mit „−“, Wert und „+“. <br>• Desktop 40 px. <br>• Handy 56 px über die volle Breite, „+“ gefüllt, weil es die häufigere Richtung ist. <br>• Wert mit `aria-live`. <br>• Danach „Gespeichert, vorher Kap. 812, Rückgängig“. |
| **Reiter / Segmente** | Medientypen mit Zahl („E-Books 1“). Auf dem Handy scrollt nur die Segmentleiste in sich, die Seite nicht. Filter wie „Neue Kapitel 2“ als Chips mit Zahl. |
| **Eingaben** | <br>• 40 px hoch (Handy 46), Rahmen `--line-strong` (≥ 3 : 1). <br>• Fokus: 2 px Akzent. <br>• Fehler: roter Rahmen und ein Satz, wie es richtig geht („Bitte eine Zahl eingeben, z. B. 421 oder 105.5.“). <br>• Passwort mit „Anzeigen“. |
| **Navigation Desktop** | <br>• Marke links. <br>• Übersicht, Updates (mit Zähler), Eintragen, Statistik als Pillen. <br>• Rechts die Suche mit Kürzel `/` und Einstellungen als Symbol. <br>• „Abmelden“ zieht in die Einstellungen. |
| **Navigation Handy** | <br>• Leiste unten mit 4 Zielen à ≥ 48 px, Symbol und Wort, Zähler an „Updates“. <br>• Einstellungen oben rechts. <br>• Ersetzt die abgeschnittene Zeile von heute. |
| **Leere Zustände** | Ein Satz, was los ist, ein Satz, warum, und eine Handlung. <br>• Updates: „Gerade nichts Neues. Die Extension prüft die Serienseiten einmal am Tag, solange Brave läuft. Zuletzt vor 2 Std.“ und „Zur Übersicht“. <br>• Filter ohne Treffer: „Keine Titel für „xyz““ und „Filter zurücksetzen“. <br>• Erste Nutzung: „Noch keine Titel“ und „Extension koppeln“. |
| **Laden** | <br>• Skelett in Cover-Form, statisch ohne Schimmern, erst nach etwa 300 ms. Unter 1 s zeigt man laut NN/g nichts. <br>• Umsetzung über `loading.tsx` je Route. |
| **Rückmeldung** | Toast unten bzw. Hinweis am Auslöser mit „Rückgängig“, verschwindet nach 4 s, `role="status"`. |
| **Symbole** | Etwa 20 Strich-Symbole, 20 px, Strich 1,75 (A) bzw. 1,9 (B): Regal, Glocke, Stift, Balken, Regler, Lupe, Neuer Tab, Plus, Minus, Haken, Zurück, Aufklappen, Ablage, Auge, Uhr, Rückgängig. <br>• Als React-Komponenten mit Inline-SVG, z. B. aus Lucide (ISC-Lizenz) oder selbst gezeichnet wie in den Mocks. <br>• Kein Icon-Font, kein externer Abruf. |

## 7. Bildschirme: konkrete Verbesserungen

**Übersicht (Regal)**

- Das Regal aus dem Entwurf bleibt die Grundlage, mit vier Änderungen:
  1. Ein Klick aufs Cover liest weiter, statt dass ein Knopf unter jedem Cover sitzt. Das spart 11 Hauptknöpfe.
  2. „Neu“ als Haftmarker bzw. goldene Zahl.
  3. Die Kachel ohne Bild trägt den ganzen Titel.
  4. Das Regalbrett gliedert die Reihen (A).
- Desktop: 5 Spalten (A) bzw. 6 (B). Handy: 3 (A) bzw. 2 (B).
- **Abschnitte nach Status als Regalböden:** „Lese 11“, „Abgeschlossen 1“. Der Status-Filter bleibt.
- Kopf: „12 Titel, bei 2 warten neue Kapitel.“ Daneben Reihenfolge und Regal/Liste.
- Zuordnungen: eine ruhige Zeile mit Ablage-Symbol und „Prüfen“, kein gelbes Banner. Gelb ist für „neu“ reserviert.
- Handy: Suche oben, dann Typ-Segmente und ein „Filter“-Knopf, der Status, Reihenfolge und die Chips sammelt. Auf dem Telefon gibt es keinen Hover-Zustand, Quelle und Zeit stehen erst auf der Detailseite.
- B zusätzlich: eine **Bühne** oben mit dem zuletzt gelesenen Werk, das neue Kapitel hat. Darin große Zahl „421 von 423“, „Kap. 422 lesen“ und daneben „Auch neu: Overgeared“.

**Updates**

- Nach dem Galerie-Entwurf, mit drei Änderungen:
  - „Neue Kapitel“ als große Karten mit Kapitel-Chips „346 347 348“ (wie MangaDex Updates), „Gelesen bis Kap. 345 auf demonicscans.org“, einem Knopf „Kap. 346 lesen“ und „Serienseite geprüft vor 3 Std.“.
  - „Auf dem Stand“ deutlich kleiner (7 bzw. 8 Spalten). Die Größe zeigt die Rangfolge.
  - „Nicht geprüft“ als gestrichelter Hinweis mit Grund statt als zugeklappter Abschnitt (Entscheidung 6).
- Kopf in einem Satz: „Bei 2 Werken warten 5 neue Kapitel. Die Extension hat die Serienseiten zuletzt vor 2 Std. geprüft.“
- Zähler „2“ in der Navigation (offene Frage O3 im Entwurf): Er kostet eine Zählabfrage pro Seitenaufruf, die das Layout ohnehin schon für die Zuordnungen macht.

**Detailseite**

- Kopf mit Cover, Titel, Typ und Status. Darunter:
  - der Stand groß,
  - eine **Kapitelleiste** (die letzten 12 Kapitel als Kästchen: gelesen in Petrol, neu in Gelb),
  - „Neuestes Kapitel laut asuracomic.net, geprüft vor 3 Std.“,
  - „Kap. 422 lesen ↗“ und der Stepper.
- Der Kopf bekommt einen zarten Schein in der Cover-Farbe (A 13 %, B kräftig).
- Quellen und Verlauf nebeneinander.
  - Verlauf als Zeitleiste mit relativen Zeiten, die absolute Zeit im Tooltip. Manuelle Einträge mit hohlem Punkt.
  - „Lösen“ als leiser roter Textknopf.
- „Bearbeiten“ als Liste aufklappbarer Zeilen (`<details>`) mit dem aktuellen Wert rechts: Titel und Typ, Status, Stand von Hand setzen, Bild, Zusammenführen (rot). Das funktioniert ohne JavaScript, wie es SPEC §4.2 verlangt.

**Eintragen (heute „Schnell-Update“, PWA-Startseite)**

- Karten mit Cover, Titel, „Light Novel, WebNovel, vor 3 Tagen“ und einem 56-px-Stepper über die ganze Breite.
- Nach dem Tippen: „Gespeichert, vorher Kap. 812, Rückgängig“.
- E-Book: große Prozentzahl, Schieberegler mit 28–34 px Griff und ± 1 % als Knöpfe für Feinarbeit.
- Der WebNovel-Hinweis „zuletzt vor 9 Tagen abgeglichen“ zieht von der Übersicht hierher. Hier ist er relevant.
- Umbenennung in „Eintragen“: kürzer, ein Verb, passt in die Handy-Leiste (Frage 2).

**Login**

- A: eine kleine Reihe Buchrücken auf einem Brett als Markenbild, darunter der Titel und „Melde dich an, um deinen Lesestand zu sehen.“, eine Karte mit zwei Feldern und „Anzeigen“ am Passwort.
- B: ein unscharfes Mosaik aus Cover-Farben hinter einer Glaskarte.
- Beide: Fußzeile „Es gibt genau ein Konto. Der Tracker läuft nur auf diesem Rechner.“ Fehler stehen am Feld, nicht nur unter dem Knopf. Setup sieht gleich aus.

**Statistik** (ohne Mock)

- Die Tabelle bleibt (SPEC §4.8). Sie bekommt Tokens, Kapitel in Petrol und Folgen in einer zweiten, ruhigen Farbe (nicht Gelb).
- Oben eine Zeile „Diese Woche 23 Kapitel, 4 Folgen“ in großer Zahl.
- Die aktuelle Woche wird hervorgehoben.

**Einstellungen, Seiten, Zuordnungen** (ohne Mock)

- Abschnitte als Flächen mit Kontur statt Linien.
- Gefährliches (Widerrufen, Lösen) als leise rote Textknöpfe.
- „Abmelden“ als eigener Abschnitt unten.
- Zuordnungen: Kandidaten als große Auswahlzeilen mit Ähnlichkeit als Balken. „Ignorieren“ wird zu einem leisen Knopf.

---

## 8. Priorisierte Liste

**Schnelle Gewinne**: unabhängig vom Regal-Umbau, ohne Schemaänderung, ohne neue Abhängigkeit.

| # | Was | Aufwand | Nutzen |
|---|---|---|---|
| Q1 | Semantische Tokens in `globals.css` (`@theme`, § 9.1) und die Komponenten schrittweise darauf umstellen | S (Tokens), M (alle Klassen) | Grundlage für alles Weitere, Dunkelmodus an einer Stelle |
| Q2 | Ein Hauptknopf pro Bereich: „Lösen“, „Widerrufen“ und „Ignorieren“ leise; Detail-Formulare als Sekundärknöpfe | S | Ruhe, Gefährliches nicht mehr am lautesten |
| Q3 | Detailkopf: Stand, „Kap. 422 lesen“ und Stepper nach oben; Bearbeiten in `<details>` | S | Wichtigste Handlung dort, wo man sie sucht |
| Q4 | Einheitliche Beschriftungen: „Kap. 422 lesen“, „Kap. 421 öffnen“ (zuletzt gelesen), „Bei Crunchyroll öffnen“; Typ „Light Novel“ statt „Novel“ | S | Klarheit, gleiche Wörter überall |
| Q5 | Handy-Ziele ≥ 44 px (Stepper, Navigation) und „Gespeichert“ mit Rückgängig | S | Bedienbarkeit unterwegs |
| Q6 | Symbole als Inline-SVG statt „→ ›“; ↗ nur für neuen Tab | S | Ruhiger, verständlicher |
| Q7 | Verlauf mit relativen Zeiten, absolute im `title` | S | Lesbarkeit |
| Q8 | Leere Zustände mit Grund und Handlung, Skelette über `loading.tsx` | S | Wirkt fertig, erklärt sich |
| Q9 | Gelb exklusiv für „neu“, „Kap. ?“ gestrichelt statt amber, Zuordnungs-Banner neutral | S | Farbe bedeutet wieder etwas |
| Q10 | Cover im Dunkelmodus auf 90 % Helligkeit | S | Bilder blenden nachts nicht |

**Größerer Umbau**

| # | Was | Aufwand | Freigabe nötig |
|---|---|---|---|
| U1 | Regal in der gewählten Richtung: Cover-Karte, Kachel mit ganzem Titel, Haftmarker, Regalböden nach Status, Filter-Knopf auf dem Handy. **Mit dem laufenden Regal-Umbau abstimmen** | M | nein |
| U2 | Updates in derselben Sprache: große Neu-Karten mit Kapitel-Chips, kleines „Auf dem Stand“. **Mit dem laufenden Updates-Umbau abstimmen** | M | nein |
| U3 | Handy-Navigation unten, Suche mit `/` im Kopf, Abmelden in die Einstellungen | M | nein |
| U4 | Farbe aus dem Cover: bestimmen, speichern, als Klasse anwenden (§ 5.3, § 9.3) | M (Browser-Weg) bis L (Server) | **ja**: Schema `work_covers.color`; bei `sharp` oder Color Thief neue Abhängigkeit (SPEC §16) |
| U5 | Selbst ausgelieferte Schrift (Literata bzw. Barlow, woff2, ein variabler Schnitt) | S–M | nein (CSP `font-src 'self'` passt), Lizenz OFL |
| U6 | Eintragen neu: große Stepper, Rückgängig, Slider mit ± 1 %, WebNovel-Hinweis | M | nein, Umbenennung nach Frage 2 |
| U7 | View Transition Cover → Detailseite | M | nein |
| U8 | Befehlspalette `Strg+K`: Titel springen, „+1 bei Eleceed“, „Updates öffnen“ (wie Raycast und Linear) | L | nein |
| U9 | Login und Setup neu | S | nein |
| U10 | Statistik, Einstellungen, Zuordnungen, Seiten auf Tokens und neue Komponenten | M | nein |

**Vorgeschlagene Reihenfolge:**

1. Q1–Q10 in einem Zug, etwa 2 Tage. Danach sieht die App schon deutlich ruhiger aus, auch ohne Stilwahl.
2. Nach der Stilwahl U5 und U1/U2, zusammen mit den Agenten, die Regal und Updates bauen.
3. Dann U3 und U6, danach U4, U7 und U8 nach Bedarf.

## 9. Umsetzung mit Tailwind v4 unter der strengen CSP

Die CSP erlaubt `style-src 'self' 'nonce-…'`, `font-src 'self'` und `img-src 'self' data:`. Daraus folgt:

### 9.1 Tokens in `globals.css`

```css
@import "tailwindcss";

/* Selbst ausgelieferte Schrift (public/fonts), erlaubt durch font-src 'self'. */
@font-face {
  font-family: "Literata";
  src: url("/fonts/literata-variable.woff2") format("woff2");
  font-weight: 200 900;
  font-display: swap;
}

/* Semantische Farben, wechseln mit dem System-Farbschema (wie heute). */
:root {
  color-scheme: light dark;
  --bg: #f2f4f5; --surface: #ffffff; --surface-2: #e7ebed;
  --line: #d3d9dd; --line-strong: #7d8a93;
  --ink: #15202b; --ink-2: #4a5763; --ink-3: #5d6a75;
  --accent: #0b5d66; --on-accent: #ffffff; --accent-soft: #dceeef; --accent-soft-ink: #084a52;
  --marker: #ffe15a; --on-marker: #2e2600; --danger: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #13181b; --surface: #1b2125; --surface-2: #242b30;
    --line: #313a40; --line-strong: #6f7c85;
    --ink: #e8edef; --ink-2: #a7b3ba; --ink-3: #8d99a1;
    --accent: #5fc4c4; --on-accent: #062528; --accent-soft: #143a3d; --accent-soft-ink: #a5e6e3;
    --marker: #f5d94e; --on-marker: #2b2200; --danger: #ff8f85;
  }
}

/* Utilities wie bg-surface, text-ink-2, bg-marker; "inline", weil sie auf Variablen zeigen. */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-accent-soft: var(--accent-soft);
  --color-accent-soft-ink: var(--accent-soft-ink);
  --color-marker: var(--marker);
  --color-on-marker: var(--on-marker);
  --color-danger: var(--danger);
}

@theme {
  --font-title: "Literata", Georgia, serif;
  --text-title-1: 2rem;
  --text-title-1--line-height: 1.15;
  --radius-book: 3px;
  --radius-control: 10px;
  --radius-card: 16px;
  --shadow-book: 0 1px 1px rgb(21 32 43 / 0.1), 0 14px 22px -14px rgb(21 32 43 / 0.6);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
  --animate-saved: saved 200ms var(--ease-standard);
  @keyframes saved {
    from { opacity: 0; transform: translateY(4px); }
  }
}
```

**Verwendung** z. B.:

```
bg-bg text-ink
rounded-card bg-surface shadow-[0_0_0_1px_var(--color-line)]
bg-accent text-on-accent
font-title text-title-1
motion-safe:animate-saved
```

- Ein manueller Hell/Dunkel-Schalter bräuchte `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` und ein Skript gegen das Aufflackern (mit Nonce). Apple rät von eigenen Darstellungs-Einstellungen ab. **Empfehlung: beim System bleiben.**
- `next/font/local` liefert die Schrift ebenfalls vom eigenen Origin. Der schlichte `@font-face` oben ist unter der CSP aber am leichtesten nachzuprüfen.

### 9.2 Keine Inline-Styles

- Breiten wie 43 % gehen über feste Stufen (`barWidthClass` der Statistik, z. B. in 5-%-Schritten), über `<progress>`/`<meter>` oder über SVG-Attribute.
- Beliebige Tailwind-Werte (`w-[43%]`) funktionieren nur, wenn der Klassenname im Quelltext steht. Für Werte aus der Datenbank taugen sie nicht.

### 9.3 Werte pro Werk ohne Inline-Styles

Für die Cover-Farbe und `view-transition-name` gibt es drei Wege. Empfohlen ist (1).

1. **Feste Klassen:** 24 Farbtöne × fester Helligkeit, z. B. `.cover-h07 { --cover: oklch(0.55 0.12 105) }` in `globals.css`. Der Server wählt die nächste Stufe, die Komponente setzt die Klasse. Damit bleiben die Kontraste garantiert und alles cachebar. Die Kachel-Töne von heute (`TONES` in `cover-thumb.tsx`) funktionieren schon so.
2. **Nonce-`<style>`:** Die Seite rendert `<style nonce={nonce}>` mit `.w-<id>{--cover:#8e3fb5}` für die sichtbaren Werke. Das ist erlaubt, weil `style-src` die Nonce enthält. Die Farbe vorher streng prüfen (`/^#[0-9a-f]{6}$/`).
3. **CSSOM:** Eine Client-Komponente setzt `ref.current.style.setProperty("--cover", color)`. MDN: Über die `style`-Eigenschaft gesetzte Werte blockiert die CSP nicht, nur `style`-Attribute im Markup. Das eignet sich auch für `view-transition-name` direkt vor dem Klick.

### 9.4 Weitere Punkte

- **Symbole** als Inline-SVG in React (`<svg aria-hidden="true">` mit `stroke="currentColor"`). SVG-Attribute sind keine Inline-Styles.
- **Bewegung:** `motion-safe:` und `motion-reduce:` von Tailwind; `@starting-style` für Toasts und Aufklapper (Baseline 2024).
- **Tests:** Die E2E-Prüfung „nur Requests an den eigenen Origin“ deckt auch Schriften ab. Für Kontraste reicht die Tabelle in § 5.2, solange Tokens zentral bleiben. Ein automatischer Prüfer wie axe wäre eine neue Abhängigkeit.
- **Nicht ändern:**
  - Die Detailseite bleibt eine eigene, verlinkbare Seite mit Formularen, die ohne JavaScript gehen.
  - Bilder kommen weiter nur von `/works/[id]/cover`.
  - Es gibt keine Favicons fremder Seiten.

## 10. Fragen an dich

1. **Stilrichtung:** A „Papier“, B „Kino“ oder A mit der großen Zahl und dem Cover-Schein aus B (Empfehlung)?
2. **Name:** „Schnell-Update“ in **„Eintragen“** umbenennen? Kürzer, ein Verb, passt in die Handy-Leiste.
3. **Klickmodell:** Soll ein Klick aufs Cover auch in der Übersicht weiterlesen, wie in Updates entschieden? Der Titel führt dann zu den Details.
4. **Schrift:** Literata (A) bzw. Barlow (B) selbst ausliefern, oder bei der Systemschrift bleiben?
5. **Farbe aus dem Cover:** Schemaänderung `work_covers.color` erlauben? Und bestimmt der Browser die Farbe (keine neue Abhängigkeit) oder der Server mit `sharp` (Freigabe nach §16)?
6. **Navigation:** Auf dem Handy eine Leiste unten? „Abmelden“ in die Einstellungen verschieben?
7. **Kachel ohne Bild:** ganzer Titel als Buchschild (A) bzw. Poster (B) statt zwei Initialen?
8. **Regalböden nach Status:** In der Übersicht „Lese“ und „Abgeschlossen“ als eigene Böden zeigen, wenn der Status-Filter auf „Alle“ steht?

## 11. Quellen

**Medien-Apps**

- [Apple Music API: Artwork (`bgColor`, `textColor1–4`)](https://developer.apple.com/tutorials/data/documentation/applemusicapi/artwork.json)
- [Plex: Finding your true colors](https://www.plex.tv/blog/finding-your-true-colors-with-plex/): Abruf blockiert, Inhalt laut Suchauszug. Spiegel der Plex-UltraBlur-API: [apis.io](https://apis.io/apis/plex/plex-ultrablur-api/)
- [AniList API: MediaCoverImage mit `color`](https://docs.anilist.co/reference/object/mediacoverimage): Abruf blockiert, laut Suchauszug
- [Mihon: FAQ Bibliothek (Badges, Kategorien)](https://mihon.app/docs/faq/library)
- [Apple TV: „Up Next“ bzw. „Continue Watching“](https://support.apple.com/en-gb/guide/tvapp-mac/watch-now-atv7bf64f99/1.0/mac) · [9to5Mac zu iOS 18.1](https://9to5mac.com/2024/09/24/apple-tv-app-adds-separate-watchlist-in-ios-18-1-beta/): beide laut Suchauszug
- Spotify: keine offizielle Quelle gefunden. Eine Analyse eines Dritten beschreibt die Farbwahl aus dem Cover mit Kontrastprüfung gegen den dunklen Grund: [blakecrosley.com](https://blakecrosley.com/guides/design/spotify)
- Letterboxd, Apple Books: keine offiziellen Gestaltungsseiten gefunden. Das Format 2:3 für Poster ist bei TMDb und TheTVDB üblich ([Plex-Forum](https://forums.plex.tv/t/choose-aspect-ratio-for-posters/711763.md))

**Produktivitäts-Apps**

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) (Themes in LCH aus 3 Eingaben: Grundfarbe, Akzent, Kontrast; Inter Display für Überschriften)
- [Linear: Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) („Structure should be felt not seen“, gedimmte Seitenleiste, weniger Linien) · [Changelog 12.03.2026](https://linear.app/changelog/2026-03-12-ui-refresh)
- [Things 3: Features](https://culturedcode.com/things/features/) (Magic Plus, Type Travel, aufgeräumte Detailansicht, Fortschrittskreise)
- [Raycast: A fresh look and feel](https://www.raycast.com/blog/a-fresh-look-and-feel) (Aktionsleiste mit Tastenkürzeln, Strichsymbole mit einheitlichen Regeln, Compact Mode)
- Arc: eigene Farben pro Space; nur über Dritte belegt ([computingforgeeks](https://computingforgeeks.com/install-arc-browser-macos-windows/))

**Design-Systeme und Barrierefreiheit**

- [Radix Colors: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) (Stufen 1–2 Grund, 3–5 Elemente, 6–8 Rahmen, 9–10 Vollfarbe, 11–12 Text) · [eigene Skalen](https://www.radix-ui.com/colors/custom)
- [shadcn/ui: Theming](https://ui.shadcn.com/docs/theming) (Token-Paare `background`/`foreground`, oklch, `@theme inline`)
- Apple HIG:
  - [Accessibility](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/accessibility.json) (44 × 44 pt, Reduce Motion)
  - [Typography](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/typography.json)
  - [Dark Mode](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/dark-mode.json) (erhöhte Flächen heller, Bilder dämpfen, keine eigene Darstellungs-Einstellung)
- Material 3 (Doku der Android-Komponenten):
  - [Typography](https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md)
  - [Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md) (Kurven, Dauern 50–1000 ms)
  - [Shape](https://github.com/material-components/material-components-android/blob/master/docs/theming/Shape.md)
  - [Color](https://github.com/material-components/material-components-android/blob/master/docs/theming/Color.md) (Farbe aus dem Bild, Tonal Surfaces)
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) (Quantisieren und Bewerten von Bildfarben, HCT)
- WCAG 2.2:
  - [1.4.3 Kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  - [1.4.11 Nicht-Text-Kontrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
  - [2.5.8 Zielgröße](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

**Technik**

- Tailwind CSS v4:
  - [Theme-Variablen](https://tailwindcss.com/docs/theme)
  - [Dark Mode](https://tailwindcss.com/docs/dark-mode)
  - [Farben](https://tailwindcss.com/docs/colors)
  - [Schriften](https://tailwindcss.com/docs/font-family)
- [Next.js: Fonts](https://nextjs.org/docs/app/getting-started/fonts) (selbst ausgeliefert, keine Requests an Google)
- [MDN: CSP `style-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src): `style`-Attribute werden blockiert, Werte über die `style`-Eigenschaft nicht
- [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) · [Chrome: View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions)
- [MDN: @starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style)
- [Color Thief v3](https://lokeshdhakar.com/projects/color-thief/) (MIT, OKLCH, Node über sharp) · [node-vibrant](https://github.com/Vibrant-Colors/node-vibrant)
- Schriften:
  - [Literata](https://github.com/googlefonts/literata) (OFL)
  - [Inter](https://rsms.me/inter/) (OFL, `tnum`, `cv07` für ß)
  - [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) (OFL)
  - [Source Serif 4](https://github.com/adobe-fonts/source-serif) (OFL)
  - Barlow (OFL): Lizenz aus eigener Kenntnis, nicht abgerufen
- NN/g:
  - [Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/)
  - [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/)
  - [Microinteractions](https://www.nngroup.com/articles/microinteractions/)

## 12. Hinweise zu den Mocks

- **Statisch.** Knöpfe und Filter tun nichts.
  - Die erste bzw. zweite Karte der Übersicht zeigt den Hover-Zustand, auf Touch-Geräten nicht.
  - In „Eintragen“ zeigt Lord of the Mysteries den Zustand nach einem Tipp (813, vorher 812).
- **Eigenständig.** Nur CSS in der Datei, keine Schriften, Bilder oder Skripte von außen; das Screenshot-Skript prüft jeden Request. Inline-`style`-Attribute kommen nur in den Token-Seiten vor. Die App selbst darf sie nicht nutzen (§ 9).
- **Cover** sind Farbverläufe als Platzhalter für echte Bilder. Arcane Sniper und Omniscient Reader's Viewpoint zeigen die Kachel ohne Bild.
- **Schriften:** lokal installierte Platzhalter. Sitka steht für Literata, Bahnschrift für Barlow, Segoe UI für die Systemschrift.
- **Beispieldaten:**
  - Eleceed Kap. 421 mit 2 neuen, Overgeared Kap. 345 mit 3 neuen, Nano Machine Kap. 332.
  - Omniscient Reader's Viewpoint Kap. ?, Solo Leveling abgeschlossen.
  - Shadow Slave (Light Novel) Kap. 1204, Project Hail Mary (E-Book) 43 %, Frieren S1 · F14.
  - Dazu Absolute Sword Sense, Return of the Mount Hua Sect, Lord of the Mysteries und Arcane Sniper.
- **Screenshots:**
  - Playwright aus dem Repo mit Chromium, Desktop 1280 px und Handy 375 px (`isMobile`, 2×), jeweils hell und dunkel.
  - Kein Bild scrollt seitlich (geprüft).
  - Die Bilder sind mit `sharp` aus `node_modules` auf Paletten-PNG verkleinert (23 MB → 7 MB).
- **Vorher-Bilder:** die echte App, lokal gebaut und mit einer Wegwerf-Datenbank im Temp-Ordner gestartet. Die echte Datenbank unter `~/.read-watch-tracker` blieb unberührt.
- **Entwurf-Bilder:** `docs/mocks/screenshots/01-regal-*` und `docs/feature-cover-galerie/mock-*`, unverändert kopiert.
