# Feature-Ideen für die Web-App

> Stand 2026-10-22 · Grundlage: [SPEC.md](../../SPEC.md) v0.4 und der Code auf `main` (T46)
> Recherche: andere Tracker sowie Apps außerhalb von Trackern, per Websuche und Seitenabruf, ohne Login. Die Quellen stehen unten mit Nummern (Q1 …).

**Nicht noch einmal vorgeschlagen,** weil schon vorhanden oder in Arbeit:
- vorhanden: Cover pro Werk, Statistik je Woche und Monat, Schnell-Update-PWA, Excel-Import, Verlaufs-Backfill, Seitenregeln, Domain-Umzug, tägliche Sicherungen
- in Arbeit: Cover-Regal, Seite „Updates“ mit Zähler, Recherche zu neuen Light-Novel-Kapiteln, Design-Überarbeitung

**Kennzeichnung:**
- **[eK]**: Die Angabe beruht nur auf eigener Kenntnis und ist durch keine Quelle belegt.
- **[Auszug]**: Die Angabe steht nur im Suchergebnis-Auszug, weil die Seite selbst den Abruf blockiert hat.
- Nutzen, Aufwand und Passung sind meine Einschätzung auf Basis von SPEC und Code. Sie sind deshalb nicht einzeln markiert.

---

## Kurzfazit: Top 5

| # | Idee | Aufwand | Spec | Warum oben |
|---|---|---|---|---|
| 1 | **Lücken schließen**: geführte Abfrage für Werke ohne Stand | S | kein Konflikt | Sie trifft das Kernproblem aus §1 („63 von 136 ohne Stand“). Der Backfill reicht nur 90 Tage zurück; der Rest braucht einen schnellen Weg zum Nachtragen. |
| 2 | **Kommandopalette** (Strg+K) und Tastaturkürzel | S–M | kein Konflikt | Der kürzeste Weg zu „Weiterlesen“: Titel tippen, Enter, und das nächste Kapitel ist offen. Das zahlt auch auf §4.7 ein („alles per Tastatur“). |
| 3 | **Pausieren und Sammeln** | M | Freigabe nach §16 | Der Filter „Lese“ zeigt dann nur Aktives. Ruhende Serien melden sich wieder, sobald genug neue Kapitel da sind. |
| 4 | **Seiten-Gesundheit**: „umgezogen oder tot?“ | S, dann M | Scheibe 1 ohne Konflikt | Seiten wechseln häufig (§2.7). Heute fällt ein Umzug erst beim Lesen auf. Die Daten für einen Frühhinweis liegen schon in der Datenbank. |
| 5 | **Notizen pro Werk** | S | kein Konflikt | Die Spalte `works.notes` steht seit M1 im Schema, wird aber nirgends angezeigt. Notizen sind sehr nützlich bei wechselnden Seiten („Kap. 80–85 auf Seite X gelesen“). |

**Warum diese fünf:**
- Alle fünf stärken das Kernversprechen der App: *wo stehe ich, wie komme ich weiter*.
- Drei davon kommen ohne Schemaänderung aus.

**Was nicht oben steht:**
- Die meisten Statistik- und Spielideen (Heatmap, Ziele, Serie, Jahresrückblick) kollidieren mit §18. Sie stehen in der Tabelle und sind gekennzeichnet.
- Knapp hinter den Top 5:
  - Nr. 6: Duplikate vorschlagen
  - Nr. 18: Lücken im Verlauf markieren
  - Nr. 19: Export als CSV/JSON
  - Alle drei sind klein und ohne Konflikt.

---

## Alle Ideen

**Legende:**
- **Nutzen** für genau diesen Nutzer: hoch, mittel oder niedrig.
- **Aufwand** wie in `tasks/todo.md`:
  - S = ein Task
  - M = zwei bis drei Tasks
  - L = in Scheiben, eigener Abschnitt
- **Spec-Konflikt:**
  - **nein**
  - **Freigabe §16**: steht unter „Erst fragen“ (Schemaänderung, neue Abhängigkeit, API, Berechtigung), ist aber kein Nicht-Ziel.
  - **JA §18**: widerspricht einem Nicht-Ziel; du müsstest es freigeben.

| # | Idee | Vorbild | Nutzen | Aufwand | Architektur | Spec-Konflikt |
|---|---|---|---|---|---|---|
| 1 | **Lücken schließen**: Werke ohne Stand einzeln abfragen | Readwise Reader Triage (Q42), Sunsama Tagesplanung (Q74) | hoch | S | passt, nur Web | nein |
| 2 | **Kommandopalette** (Strg+K) und Tastaturkürzel (j/k, +/−, ?) | Linear (Q77), GitHub (Q78), Superhuman (Q79), Raycast (Q80), Miniflux (Q53) | hoch | S–M | passt, nur im Browser | nein, wenn selbst gebaut; mit Bibliothek: Freigabe §16 |
| 3 | **Pausieren und Sammeln**: „pausiert“, optional bis Datum oder bis N neue Kapitel | StoryGraph (Q25), AniList (Q7), MangaDex (Q10), Things (Q73), Feedly Mute (Q50), Trakt Hidden (Q20) | hoch | M | passt | Freigabe §16 (Schema, §6.1) |
| 4 | **Seiten-Gesundheit**: „umgezogen oder tot?“ | Raindrop Broken Links (Q45), Miniflux Fehlerlimit (Q52), Feedly Reads/Month (Q54) | hoch | S, dann M | Scheibe 1 nur Web; Scheibe 2 Extension und API | Scheibe 1 nein; Scheibe 2 Freigabe §16 |
| 5 | **Notizen pro Werk**, durchsuchbar | Mihon (Q4, Q5), AniList (Q7), MAL (Q19) | mittel–hoch | S | passt, Spalte existiert | nein |
| 6 | Mögliche Duplikate vorschlagen, Zusammenführen per Klick | Mihon Duplikat-Dialog (Q4), Raindrop (Q46), Feedly (Q51) | mittel | S–M | passt (`pg_trgm`) | nein, solange nur vorgeschlagen; „nie automatisch“ aus §16 bleibt |
| 7 | Status „geplant“ mit Rang; wird beim ersten Fortschritt zu „Lese“ | AniList Planning/priority (Q7), Trakt Watchlist (Q20), Kitsu Auto-Status (Q12) | mittel | S–M | passt | Freigabe §16 (Schema) |
| 8 | Leiste „Als Nächstes“: bis zu 5 angeheftete Werke plus On-Deck-Regel | StoryGraph Up Next (Q26), Sofa Shelf (Q31), Kavita On Deck (Q15), Komga (Q13) | mittel; überschneidet sich mit der Updates-Seite | S–M | passt | Anheften: Freigabe §16; nur Regel: nein |
| 9 | Suchoperatoren und gespeicherte Ansichten (`neu:>5 seite:asura ruhend:>30t`) | Mihon (Q5), Readwise Filtered Views (Q44), Raindrop (Q47), Kavita (Q16), Notion (Q56) | mittel | M | passt, im Browser | nein, wenn die Ansicht in der URL steht; in der DB gespeichert: Freigabe §16 |
| 10 | Ansicht „Liegengeblieben“ (30 Tage ohne Fortschritt), mit einem Klick pausieren oder abbrechen | TV Time (Q32), Kavita (Q15), Matter „Lindy“ (Q48), Habitica (Q39) | mittel | S | passt | nein (zusammen mit Nr. 3 besser) |
| 11 | Erscheinungsrhythmus: „nächstes Kapitel ca. am …“ | Mihon Smart Update (Q2), Miniflux (Q52), Monarch (Q72) | mittel | M–L | Extension und Server | Freigabe §16 (Historie der neuen Kapitel); höchstens eine Prüfung am Tag (§18) |
| 12 | Release-Kalender „Demnächst“ | Mihon Upcoming (Q3), Trakt Kalender (Q20) | niedrig–mittel | M, braucht Nr. 11 | passt | wie Nr. 11 |
| 13 | Kalender-Abo (`.ics`) für erwartete Kapitel | RFC 7986 (Q75), Apple Kalender (Q76) | niedrig | S | passt schlecht: Cloud-Kalender erreichen `127.0.0.1` nicht [eK] | **Grenzfall §18**: Erinnerungen im Kalender wären Benachrichtigungen |
| 14 | Bewertung, intern 0–100, angezeigt als Sterne | AniList Score-Formate (Q8), Letterboxd (Q21), Kitsu (Q12) | mittel | S–M | passt | Freigabe §16 (Schema) |
| 15 | Tags und eigene Listen | MAL Tags (Q19), AniList Custom Lists (Q7), Komga Read Lists (Q14), Notion Status-Gruppen (Q57) | mittel | M | passt | Freigabe §16 (Schema) |
| 16 | Abbrechen mit Grund und Endstand | StoryGraph DNF (Q29) | niedrig | S | passt | nein als Notiz (Nr. 5); als eigenes Feld: Freigabe §16 |
| 17 | Neu lesen oder neu schauen als eigener Durchgang | Trakt `reset_at` (Q20), Goodreads (Q23), Kavita (Q17), AniList Repeating (Q7) | niedrig–mittel | M–L | passt bedingt: ändert die Fortschrittsregel (§2.5, §5.3) | Freigabe §16 (Schema und Regel) |
| 18 | Lücken im Verlauf markieren („Kap. 121–124 übersprungen?“) | Mihon fehlende Kapitel (Q4) | mittel: zeigt verpasste Erfassungen | S | passt, aus `events` | nein |
| 19 | Export als CSV/JSON (Werke und Events) | Ink & Switch „The Long Now“ (Q83), Obsidian Bases (Q61) | mittel | S | passt | nein |
| 20 | Offline-Warteschlange in der Schnell-Update-PWA, mit Zähler „3 Änderungen warten“ | Linear Offline (Q84), Workbox (Q86), WebKit (Q87, Q88) | mittel, erst nach der Entscheidung zu §19 | M | passt bedingt: Das iPhone erreicht den Tracker heute nicht (§19) | nein |
| 21 | „Was lese ich?“: Zufall aus der eigenen Liste | Letterboxd Shuffle (Q22), Obsidian Random Note (Q60) | niedrig | S | passt | Grenzfall §18 „Empfehlungen“; da nur eigene Titel, eher nein |
| 22 | Wochen- oder Monatsziel mit Soll-Marke im Balken | Goodreads Challenge (Q24), StoryGraph, Copilot Tempo-Linie (Q70), YNAB Targets (Q68) | mittel | S–M | passt | **JA §18**: Statistik über §4.8 hinaus |
| 23 | Aufhol-Prognose pro Werk („23 Kapitel Rückstand, bei deinem Tempo ca. 9 Tage“) | YNAB Loan Planner (Q69), Linear Project Graph (Q71) | mittel | S | passt | **JA §18**, Grenzfall |
| 24 | Vergleich zur Vorperiode in `/stats` (Δ zur Vorwoche) | Last.fm Listening Report (Q64) | niedrig | S | passt | **JA §18**, minimal |
| 25 | Aktivitäts-Heatmap über das Jahr; ein Klick auf einen Tag zeigt dessen Events | GitHub (Q40), AniList (Q9) | mittel | S | passt (CSS-Grid) | **JA §18** |
| 26 | Lese-Serie (Streak) mit Pausentagen oder Gewohnheitsstärke | Duolingo (Q34, Q35), Loop (Q36), Streaks (Q37, Q38), StoryGraph (Q28) | niedrig | S | passt | **JA §18** |
| 27 | Jahresrückblick | Spotify Wrapped (Q62, Q63), MAL Wrap Up (Q18), Goodreads (Q24) | niedrig–mittel | M | passt | **JA §18**, dort ausdrücklich genannt |
| 28 | Lesezeit, Lese-Sessions, Tageszeit-Profil | Kavita Sessions (Q17), Last.fm Listening Clock (Q64) | niedrig | M | Die Extension müsste Zeit messen | **JA §18**, „Lesezeit“ dort ausdrücklich |
| 29 | „Heute vor einem Jahr“ als Kachel | Day One (Q66) | niedrig | S | passt | nein, nur Anzeige ohne Push |
| 30 | „Auf Seite suchen“ für Werke ohne Link | Raycast Fallback Commands (Q80) | mittel, zusammen mit Nr. 1 | S–M | passt | Freigabe §16 (neues Feld in der Seitenregel) |

---

## Die Top 5 im Detail

### 1. Lücken schließen

**Problem:**
- Beim Import hatten 63 von 136 Werken keinen Stand (§1, §10.1).
- Der Verlaufs-Backfill holt nur, was in den letzten 90 Tagen in Brave lief (§7.9).
- Der Filter „Stand unbekannt“ existiert (§4.7). Die Liste dahinter ist aber zum Durchgehen gebaut, nicht zum Nachtragen.

**Vorbilder:**
- **Readwise Reader:** Neue Dokumente landen in der Inbox. Man arbeitet sie einzeln ab, mit einer Taste je Ziel: `L` für Later, `E` für Archive, `Shift+E` zurück in die Inbox (Q42).
- **Sunsama:** führt jeden Morgen durch eine Abfolge fester Schritte, statt eine Liste hinzustellen (Q74).

**So sähe es aus:**
- Im Filter „Stand unbekannt“ und nach dem Backfill erscheint der Link „41 Titel ohne Stand – Lücken schließen ›“. Er führt auf eine eigene Seite, die eine Karte nach der anderen zeigt.
- Eine Karte zeigt Cover, Titel, Typ, die bekannten Quellen und „Serienseite öffnen ›“, falls eine `series_url` bekannt ist. Darunter steht das Feld „Zuletzt gelesenes Kapitel“, schon fokussiert.
- **Tasten:**
  - `Enter`: speichern, nächste Karte
  - `S`: überspringen
  - `A`: abgebrochen
  - `F`: abgeschlossen
  - Die Zeile „12 von 41“ zeigt den Fortschritt.
- **Reihenfolge:** zuerst Werke mit Serienseite (dort kann ich nachsehen), dann A–Z.
- Auf dem Handy dieselbe Karte, in der PWA bedienbar.

**Daten:**
- Die Werke liegen schon vor: alle Positionsspalten sind `null` (§5.1).
- Gespeichert wird als `manual`-Event über die bestehende Server-Action „Stand setzen“.
- Übersprungene Karten merkt sich nur die Sitzung (URL-Parameter). Ein neues Feld braucht es dafür nicht.
- Die Statistik bleibt korrekt: Das erste Event eines Werks zählt 1 (§4.8).

**Erste Scheibe:**
- Seite mit Karte, Eingabe, Speichern, Überspringen und Zähler.
- E2E-Test: drei Werke ohne Stand, zwei gespeichert, eins übersprungen.

**Später:**
- „Auf Seite suchen“ (Nr. 30) für Werke ohne jeden Link.
- Wenn Nr. 7 freigegeben wird, kommt eine Taste „geplant“ dazu.

### 2. Kommandopalette und Tastaturkürzel

**Vorbilder:**
- **Linear** (Q77): `Cmd/Ctrl+K` öffnet ein Menü, in dem man jede Aktion und jede Seite eintippen kann. `G` dann `I` springt in die Inbox, `?` zeigt alle Kürzel.
- **GitHub** (Q78):
  - Die Palette öffnet unter Windows mit `Ctrl+K`.
  - Mit `>` wechselt sie in den Befehlsmodus.
  - `#`, `@` und `/` filtern die Treffer.
- **Superhuman** (Q79):
  - Derselbe Shortcut öffnet und schließt die Palette.
  - Neben jedem Befehl steht sein Shortcut, so lernt man ihn nebenbei.
  - Die Suche verzeiht Tippfehler.
  - Das Ranking bevorzugt zuletzt Genutztes.
- **Raycast** (Q80): Gibt es keinen Treffer, bietet es Ersatz-Befehle an, etwa „im Web suchen“.
- **Miniflux** (Q53): `j`/`k` durch die Liste, `v` öffnet das Original, `/` sucht, `?` zeigt die Hilfe.

**So sähe es aus:**
- `Strg+K` öffnet auf jeder Seite einen Dialog. Tippen filtert Titel und Aliasse, mit derselben Normalisierung wie die Suche (§4.2).
- **Tasten im Dialog:**
  - `Enter`: **Weiterlesen** (neuer Tab)
  - `Umschalt+Enter`: Detailseite
- **Ranking:** zuerst zuletzt aktive Werke, dann Werke mit neuen Kapiteln.
- **Befehle nach `>`:**
  - „Kap. +1: Overgeared“
  - „Status: abgeschlossen“
  - „Gehe zu Statistik / Zuordnungen / Einstellungen“
  - „Seitenregel bearbeiten: Asura“
- **In der Übersicht:**
  - `j`/`k`: Zeile wählen
  - `Enter`: Weiterlesen
  - `+`/`−`: Stepper
  - `/`: Suche
  - `?`: Hilfe
  - `g` dann `s`: Statistik

**Daten und Architektur:**
- Es braucht keine neuen Daten. Die Übersicht hat die Werke ohnehin im Browser (§4.7).
- Auf anderen Seiten lädt die Palette beim ersten Öffnen eine schlanke Liste mit ID, Titel, Aliassen und Weiterlesen-URL.
- Gebaut mit dem nativen `<dialog>` und dem ARIA-Combobox-Muster [eK].
- Eine Bibliothek wie `cmdk` wäre eine neue Abhängigkeit (Freigabe §16) und ist nicht nötig.

**Erste Scheibe:**
- `Strg+K`, Titelsuche, `Enter` für Weiterlesen, `Umschalt+Enter` für die Detailseite, Hilfe mit `?`.
- Befehle mit `>` und `j`/`k` folgen in der zweiten Scheibe.

**Risiko:**
- Brave belegt `Strg+K` selbst (Suche in der Adressleiste). Die Seite bekommt die Taste nur, solange sie den Fokus hat [eK].
- GitHub nutzt dieselbe Taste unter Windows (Q78).

### 3. Pausieren und Sammeln

**Problem:**
- Der Status kennt nur Lese, Abgeschlossen und Abgebrochen (§4.2, §5.1).
- Serien, die ich bewusst ruhen lasse, stehen unter „Lese“ zwischen den aktiven. Das betrifft etwa Serien in Pause oder solche, bei denen ich auf mehr Kapitel warte.
- Das Badge „3 neu“ meldet sich bei ihnen trotzdem täglich.

**Vorbilder:**
- **StoryGraph:**
  - Den Status „pausiert“ gibt es nur für Bücher, die man gerade liest.
  - Pausierte Bücher wandern in einen eingeklappten Bereich.
  - Die Pause lässt sich rückdatieren und mit einer privaten Notiz versehen.
  - Pausenzeiten zählen nicht in die durchschnittliche Lesedauer.
  - Quelle: Q25.
- **Weitere Tracker mit eigenem Status:**
  - AniList: `PAUSED` (Q7)
  - MangaDex: „On Hold“ (Q10)
  - Hardcover: „Paused“ (Q30)
- **Things:** Ein künftiges Startdatum hält ein To-do aus „Heute“ heraus, bis der Tag erreicht ist (Q73).
- **Feedly:** schaltet einen Begriff für 1 Tag, 1 Woche, 1 Monat oder für immer stumm (Q50).
- **Trakt:** blendet Serien getrennt aus dem Fortschritt und aus dem Kalender aus (Q20).
- **Kitsu:** Neuer Fortschritt setzt den Status wieder auf „current“ (Q12).

**So sähe es aus:**
- Auf der Detailseite und in der Palette gibt es „Pausieren …“, mit drei Möglichkeiten:
  - ohne Bedingung
  - bis Datum
  - bis N neue Kapitel, z. B. 10
- In der Übersicht zeigt der Filter „Lese“ keine pausierten Werke.
- Am Ende steht der eingeklappte Abschnitt „Pausiert (12) · 3 bereit“.
- **Wann „bereit“:** sobald das Datum erreicht ist oder `floor(latest) − floor(chapter) ≥ N` gilt.
- Die Updates-Seite (in Arbeit) zeigt pausierte Werke erst, wenn sie bereit sind.
- Meldet die Extension ein gelesenes Kapitel eines pausierten Werks, wird es automatisch wieder „Lese“.

**Daten:**
- `work_status` bekommt den Wert `paused`.
- Neue Spalten in `works`: `paused_at`, `resume_on` (date, null) und `resume_after_new` (int, null).
- `/series-watch` muss pausierte Werke mitliefern, sonst wächst ihr Zähler nicht (§6.1).
- Die Statistik bleibt unverändert.

**Erste Scheibe:**
- Status „pausiert“ ohne Bedingung: Enum, Filter, eingeklappter Abschnitt, automatische Rückkehr bei Fortschritt, `/series-watch`.
- Die Bedingungen (Datum, N neue Kapitel) folgen in der zweiten Scheibe.

**Spec:**
- Freigabe nach §16, weil das Schema über die Spec hinausgeht. §4.2, §5.1 und §6.1 werden angepasst.
- Kein Konflikt mit §18: Es gibt keine Benachrichtigung, und die Prüfung bleibt bei einmal am Tag.

### 4. Seiten-Gesundheit: „umgezogen oder tot?“

**Problem:**
- Manga-Seiten wechseln häufig Domain und Layout (§2.7).
- Heute merke ich einen Umzug erst, wenn ich lese und nichts gezählt wird.
- Die Kapitelprüfung (§7.11) sieht Fehler: Status ≠ 200, Weiterleitung, Challenge-Seite. Sie legt die Serie dann aber nur still für 7 Tage zurück (`apps/extension/src/lib/new-chapters.ts`).

**Vorbilder:**
- **Raindrop:**
  - prüft Lesezeichen regelmäßig, in den Stufen Basic (404/410), Default (plus nicht auflösbare Domains) und Strict (plus langsam, 5xx, zu viele Weiterleitungen)
  - markiert Treffer mit einem Geist-Symbol und bietet einen eigenen Filter
  - Quelle: Q45
- **Miniflux:** ruft einen Feed nach 3 Fehlern nicht mehr ab, bis man ihn von Hand anstößt (Q52).
- **Feedly:** zeigt pro Quelle „Reads/Month“ (Q54).

**So sähe es aus (Scheibe 1):**
- Unter „Einstellungen → Seiten“ bekommt jede Quelle zwei Spalten: „zuletzt gelesen“ und „zuletzt erfolgreich geprüft“.
- Eine Ampel bewertet die Prüfung:
  - **grün:** die letzte erfolgreiche Prüfung ist höchstens 2 Tage alt
  - **gelb:** seit 3–7 Tagen nichts, obwohl Serien dieser Quelle beobachtet werden
  - **rot:** seit mehr als 7 Tagen nichts
- Bei Gelb oder Rot erscheint auf dem Core-Screen ein dezenter Hinweis, wie die WebNovel-Erinnerung (§9.1): „Asura liefert seit 9 Tagen nichts – umgezogen? [Domain-Umzug eintragen]“.

**Daten (Scheibe 1):**
- Alles ist schon vorhanden.
- `works.latest_chapter_at` wird bei jeder erfolgreichen Meldung gesetzt, auch wenn sich die Zahl nicht ändert (`packages/server/src/latest.ts`). Gruppiert wird über die Quelle, deren Serienseite beobachtet wird (`last_source_id`).
- Dazu kommt `events.received_at` je Quelle.

**Scheibe 2:**
- Die Extension meldet pro Prüfung das Ergebnis: ok, weitergeleitet, Fehlerstatus, Challenge oder kein Kapitel gefunden.
- Viele „weitergeleitet“ auf derselben Seite sind ein starkes Signal für einen Umzug.
- Die Ziel-Domain kann die Extension nicht nennen: Mit `redirect: "manual"` ist die Antwort laut Fetch-Standard von einem Netzwerkfehler nicht zu unterscheiden (Q89). Sie zu lesen hieße, Weiterleitungen zu folgen oder eine neue Berechtigung anzufordern. Beides lasse ich bewusst weg.
- **Daten:** neue Felder je Quelle (`last_check_ok_at`, `last_check_problem`, `problem_count`). `POST /latest-chapters` wird um Fehlermeldungen erweitert.

**Spec:**
- Scheibe 1 hat keinen Konflikt.
- Scheibe 2 braucht eine Freigabe nach §16 (Schema und API).
- Neue Manifest-Berechtigungen braucht keine der beiden.

### 5. Notizen pro Werk

**Ausgangslage:** `works.notes` steht in §5.1 und in `packages/db/src/schema.ts`. Die Web-App liest und schreibt das Feld nirgends.

**Vorbilder:**
- **Mihon:**
  - Notizen pro Werk gibt es seit 0.19, ohne Zeichenlimit seit 0.20 (Q4).
  - Die Bibliothekssuche findet sie mit `notes:` (Q5).
- **AniList:** private `notes` an jedem Listeneintrag (Q7).
- **MAL:** `comments` pro Eintrag (Q19).
- **StoryGraph:** eine Notiz zu jedem Fortschritts-Update (Q27).
- **Sofa:** Notizen sind auf dem Cover lesbar, ohne den Eintrag zu öffnen (Q31).

**So sähe es aus:**
- Auf der Detailseite gibt es das Feld „Notiz“. Es wird per Formular gespeichert und funktioniert auch ohne JavaScript (§4.2).
- In der Übersicht steht ein kleines Notiz-Symbol in der Zeile, der Text erscheint als Tooltip.
- Die Suche findet auch Notizen.
- **Beispiele:**
  - „Staffel 2 ab Kap. 120 auf anderer Seite“
  - „Kap. 80–85 fehlen auf Asura – auf Flame gelesen“
  - „warte auf Ende von Arc 3“

**Daten:**
- Die Spalte ist vorhanden.
- Neu ist nur eine Längengrenze, z. B. 2 000 Zeichen, geprüft mit zod an der Server-Action.
- Ausgegeben wird nur als Text.

**Erste Scheibe:** Textfeld, Symbol in der Übersicht, Suche über Notizen.

**Später:**
- Notizen an einzelnen Events, als Lese-Journal (Q27). Das braucht eine Schemaänderung, also Freigabe nach §16.
- Ein vorbelegter Abbruch-Grund (Nr. 16).

---

## Ideen mit Konflikt zu §18

Diese Ideen habe ich nicht verworfen, nur gekennzeichnet. Die Tabelle zeigt, was du jeweils freigeben müsstest.

| # | Idee | Konflikt | Was du freigeben müsstest |
|---|---|---|---|
| 22 | Wochen- oder Monatsziel | §18 „Statistiken über §4.8 hinaus“ | §18 lockern („Ziele in Kapiteln/Folgen erlaubt“) und §4.8 erweitern; dazu eine Zieltabelle (§16, Schema) |
| 23 | Aufhol-Prognose pro Werk | wie Nr. 22; Grenzfall, weil es eine Prognose ist, keine Rückschau | §4.3 um „Rückstand und Tempo“ ergänzen |
| 24 | Vergleich zur Vorperiode | wie Nr. 22 | §4.8 um eine Spalte Δ ergänzen |
| 25 | Aktivitäts-Heatmap | wie Nr. 22 | §4.8 um ein Jahresraster ohne Chart-Bibliothek ergänzen |
| 26 | Lese-Serie (Streak) | wie Nr. 22 | §18 lockern. Zusätzlich entscheiden, ob du so eine Spielmechanik überhaupt willst: GitHub hat seinen Streak-Zähler 2016 entfernt, damit die Oberfläche die Arbeit zeigt statt die Dauer (Q41). |
| 27 | Jahresrückblick | §18 nennt „Jahresrückblick“ ausdrücklich | den Punkt aus §18 streichen |
| 28 | Lesezeit, Sessions, Tageszeit | §18 nennt „Lesezeit“ ausdrücklich; die Extension müsste die Verweildauer messen (neues Signal, §16) | den Punkt aus §18 streichen und die Messung in §7.4 festlegen |
| 13 | Kalender-Abo (`.ics`) | §18 „Benachrichtigungen“, weil Kalender-Alarme Pushs durch die Hintertür wären; außerdem lauscht der lokale Betrieb nur auf `127.0.0.1` (§2.3) | in §18 klarstellen, ob Termine ohne Alarm in Ordnung sind; der Zugang aus §19 (eigener Server oder HTTPS im Heimnetz) |
| 21 | Zufall aus der eigenen Liste | §18 „Empfehlungen“, Grenzfall | klarstellen, dass „Empfehlung“ nur neue Titel meint |

**Freigabe nach §16** (erst fragen, kein Nicht-Ziel) brauchen:
- Nr. 3 und Nr. 4, Scheibe 2
- Nr. 7, Nr. 8 (Anheften), Nr. 9 (in der DB gespeichert), Nr. 11, Nr. 12, Nr. 14, Nr. 15, Nr. 17 und Nr. 30
- Nr. 2 nur, falls doch eine Bibliothek genutzt wird

---

## Bewusst nicht aufgenommen

**Nicht-Ziele aus §18:**
- Sync mit AniList, MAL oder Trakt
- Social-Funktionen, Buddy-Reads und öffentliche Profile
- Empfehlungen neuer Titel
- Push- und E-Mail-Benachrichtigungen bei neuen Kapiteln

Die Recherche hat dazu nichts Neues ergeben.

**Verbote aus §16:**
- Kapitel herunterladen oder offline lesen (Mihon). Das Herunterladen von Kapitelinhalten ist dort verboten.

**Aus anderen Gründen weggelassen:**
- **Check-in für TV-Folgen** (Trakt, Q20): Die Shield erfasst Folgen schon automatisch (§8).
- **Advanced Scores, Content-Warnungen, Mood und Pace** (AniList Q7, StoryGraph): Für einen einzigen Nutzer ist das zu viel. Falls gewünscht, lässt es sich als Tags abbilden (Nr. 15).
- **Spoiler-Sperre an Kapitel gebunden** (StoryGraph): Ohne Social-Funktionen bringt sie kaum etwas.

---

## Fragen an dich

1. **Sammeln:** Wartest du bei Manhwa bewusst, bis mehrere Kapitel da sind? Wenn ja, ab wie vielen? Davon hängt ab, ob sich die zweite Scheibe von Nr. 3 lohnt.
2. **Status:** Gibst du die Schemaänderung für „pausiert“ frei? Willst du zusätzlich „geplant“ (Nr. 7)?
3. **§18 Statistik:** Soll der Punkt „Statistiken über §4.8 hinaus“ gelockert werden? Wenn ja, für welche Ideen: Heatmap, Aufhol-Prognose, Wochenziel, Jahresrückblick?
4. **Seiten-Gesundheit:** Darf die Extension Fehlschläge der Kapitelprüfung an den Tracker melden (Nr. 4, Scheibe 2: API- und Schemaänderung)?
5. **Palette:** Soll sie ohne neue Abhängigkeit selbst gebaut werden (mein Vorschlag), oder lieber mit einer Bibliothek wie `cmdk`?
6. **§19:** Wie soll das iPhone den Tracker erreichen? Davon hängt ab, ob sich die Offline-Warteschlange für die PWA lohnt (Nr. 20).

---

## Quellen

**Wie die Quellen gelesen wurden:**
- Einige offizielle Seiten haben den Abruf blockiert:
  - docs.anilist.co
  - help.myanimelist.net
  - letterboxd.com (Teile)
  - die Hilfe von Duolingo, Monarch und Superhuman
- Dort stammt der Inhalt aus dem Suchindex [Auszug] oder aus Ersatzquellen: AniList-Doku-Export, Quellcode auf GitHub, Hersteller-Blogs.
- „Drittquelle“ heißt: Doku eines fremden API-Clients, nicht des Herstellers.

### Manga- und Anime-Tracker

| Nr. | Quelle |
|---|---|
| Q1 | Mihon – Library FAQ (Update-Ausnahmen): https://mihon.app/docs/faq/library |
| Q2 | Mihon – Smart Updates (Rhythmus-Schätzung, übersprungene Werke): https://mihon.app/docs/faq/updates/smart |
| Q3 | Mihon – Upcoming: https://mihon.app/docs/faq/updates/upcoming |
| Q4 | Mihon – Changelogs (Notizen, Duplikat-Dialog, fehlende Kapitel): https://mihon.app/changelogs |
| Q5 | Mihon v0.20.2 – Suche mit Operatoren und `notes:`: https://newreleases.io/project/github/mihonapp/mihon/release/v0.20.2 |
| Q6 | Mihon – Quellen-Migration: https://mihon.app/docs/guides/source-migration |
| Q7 | AniList API – MediaList (Status, `notes`, `priority`, `repeat`, Custom Lists): https://docs.anilist.co/reference/object/medialist [Auszug] · Doku-Export: https://anilist.gitbook.io/anilist-apiv2-docs/llms-full.txt |
| Q8 | AniList – ScoreFormat: https://docs.anilist.co/reference/enum/scoreformat [Auszug] |
| Q9 | AniList – UserActivityHistory (Heatmap): https://docs.anilist.co/reference/object/useractivityhistory [Auszug] |
| Q10 | MangaDex API – Lesestatus und Follows: https://api.mangadex.org/docs/03-manga/mdlist/ |
| Q11 | MangaDex API – Kapitel-Feed: https://api.mangadex.org/docs/04-chapter/feed/ |
| Q12 | Kitsu – `library_entry.rb` (automatischer Status, Datumslogik): https://raw.githubusercontent.com/hummingbird-me/kitsu-server/the-future/app/models/library_entry.rb |
| Q13 | Komga – Read Progress / On Deck: https://komga.org/docs/guides/read-progress |
| Q14 | Komga – Read Lists: https://komga.org/docs/guides/readlists |
| Q15 | Kavita – On-Deck-Regel im Quellcode: https://raw.githubusercontent.com/Kareadita/Kavita/main/API/Data/Repositories/SeriesRepository.cs |
| Q16 | Kavita – gespeicherte Filter: https://wiki.kavitareader.com/guides/features/filtering/ |
| Q17 | Kavita v0.8.9 – Lese-Sessions, Rückfrage beim erneuten Lesen: https://github.com/Kareadita/Kavita/releases/tag/v0.8.9 |
| Q18 | MAL – Daten für Wrap Up: https://help.myanimelist.net/hc/en-us/articles/53898537361177-What-data-is-used-for-my-Wrap-Up [Auszug] |
| Q19 | MAL-API-Client (Tags, Kommentar, Priorität, Rewatch): https://mal-api-client-upgraded.readthedocs.io/en/latest/API_Reference.html (Drittquelle) |

### Film-, Serien- und Buch-Tracker

| Nr. | Quelle |
|---|---|
| Q20 | Trakt API (Up Next, Hidden Items, Watchlist-Rang, `reset_at`, Check-in, Kalender): https://jsapi.apiary.io/apis/trakt.apib |
| Q21 | Letterboxd – FAQ (Log-Dialog, Bewertung): https://letterboxd.com/about/faq/ |
| Q22 | Letterboxd – Sortieren und Shuffle: https://letterboxd.com/journal/sorting/ |
| Q23 | Goodreads – Rereading: https://www.goodreads.com/blog/show/817-rereading-is-here-let-s-say-it-again-rereading-is-here |
| Q24 | Goodreads – Year in Books / Challenge: https://www.goodreads.com/blog/show/3064 |
| Q25 | StoryGraph – Pausiert: https://roadmap.thestorygraph.com/changelog/mark-books-as-paused- |
| Q26 | StoryGraph – Up Next: https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions |
| Q27 | StoryGraph – Notizen zum Fortschritt: https://roadmap.thestorygraph.com/changelog/page-tracking-and-progress-notes |
| Q28 | StoryGraph – Streaks: https://roadmap.thestorygraph.com/changelog/streaks- |
| Q29 | StoryGraph – DNF mit Grund: https://roadmap.thestorygraph.com/requests-ideas/posts/rating-explanation-for-dnf-books |
| Q30 | Hardcover – Feldbeschreibungen (Status „Paused“, Durchgänge): https://raw.githubusercontent.com/hardcoverapp/hardcover-docs/main/field-descriptions.json |
| Q31 | Sofa 3.0 (MacStories): https://www.macstories.net/reviews/sofa-3-0-adds-new-ways-to-manage-your-media-lists-along-with-a-new-business-model/ |
| Q32 | TV Time (Wikipedia): https://en.wikipedia.org/wiki/TV_Time |
| Q33 | Serializd (App Store): https://apps.apple.com/us/app/-/id1581244120 |

### Gewohnheiten und Streaks

| Nr. | Quelle |
|---|---|
| Q34 | Duolingo – Streak und Streak Freeze: https://blog.duolingo.com/how-duolingo-streak-builds-habit/ |
| Q35 | Duolingo – Improving the streak: https://blog.duolingo.com/improving-the-streak/ |
| Q36 | Loop Habit Tracker – Score-Formel: https://raw.githubusercontent.com/iSoron/uhabits/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Score.kt |
| Q37 | Streaks – 2-Tage-Regel: https://streaks.app/help/n-day-rule/ |
| Q38 | Streaks – Urlaubsmodus: https://streaks.app/help/vacation-mode/ |
| Q39 | Habitica – FAQ (Farben, Pause): https://raw.githubusercontent.com/HabitRPG/habitica/develop/website/common/locales/en/faq.json |
| Q40 | GitHub – Contribution-Kalender: https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile |
| Q41 | The Next Web – GitHub entfernt Streaks: https://thenextweb.com/news/github-streaks-dead-thank-the-sun-god |

### Später lesen, RSS, Notizen

| Nr. | Quelle |
|---|---|
| Q42 | Readwise Reader – Triage: https://docs.readwise.io/reader/guides/workflows/library-configuration |
| Q43 | Readwise Reader – Standardansichten: https://docs.readwise.io/reader/guides/filtering/default-views |
| Q44 | Readwise Reader – gefilterte Ansichten: https://docs.readwise.io/reader/docs/faqs/filtered-views |
| Q45 | Raindrop – Broken Links: https://help.raindrop.io/broken-links |
| Q46 | Raindrop – Duplikate: https://help.raindrop.io/duplicates |
| Q47 | Raindrop – Filter: https://help.raindrop.io/filters |
| Q48 | Matter (MacStories): https://www.macstories.net/reviews/matter-a-fresh-take-on-read-later-apps/ |
| Q49 | NetNewsWire – Smart Feeds: https://netnewswire.com/help/mac/5.1/en/smart-feeds.html |
| Q50 | Feedly – Mute-Filter: https://docs.feedly.com/article/109-how-can-i-add-create-a-mute-filter |
| Q51 | Feedly – Deduplizierung: https://docs.feedly.com/article/218-how-does-deduplication-work |
| Q52 | Miniflux – Konfiguration (Fehlerlimit, `entry_frequency`): https://miniflux.app/docs/configuration.html |
| Q53 | Miniflux – Tastaturkürzel: https://miniflux.app/docs/keyboard_shortcuts.html |
| Q54 | Feedly – Reads/Month: https://docs.feedly.com/article/649-how-is-reads-month-calculated-on-the-organize-page |
| Q55 | Inoreader – Regeln und Automationen: https://www.inoreader.com/blog/2026/01/save-time-with-automations.html |
| Q56 | Notion – Ansichten, Filter, Sortierung: https://www.notion.com/help/views-filters-and-sorts |
| Q57 | Notion – Status-Gruppen: https://www.notion.com/help/guides/status-property-gives-clarity-on-tasks |
| Q58 | Obsidian – Daily Notes: https://obsidian.md/help/Plugins/Daily+notes |
| Q59 | Obsidian – Aliasse: https://obsidian.md/help/aliases |
| Q60 | Obsidian – Random Note: https://obsidian.md/help/Plugins/Random+note |
| Q61 | Obsidian – Bases (Ansichten, CSV-Export): https://obsidian.md/help/bases |

### Rückblicke, Finanzen, Planung

| Nr. | Quelle |
|---|---|
| Q62 | Spotify – Wrapped 2025: https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/ |
| Q63 | Spotify Engineering – Listening Personality: https://engineering.atspotify.com/2023/1/whats-a-listening-personality |
| Q64 | Last.fm – Wochenbericht (nur der Aufbau ausgewertet): https://www.last.fm/user/RJ/listening-report/week · Pro-Funktionen: https://www.last.fm/pro |
| Q65 | Apple Music Replay: https://support.apple.com/en-us/109356 |
| Q66 | Day One – On This Day: https://dayoneapp.com/guides/tips-and-tutorials/on-this-day-view/ |
| Q67 | YNAB – Age of Money: https://support.ynab.com/en_us/age-of-money-H1ZS84W1s |
| Q68 | YNAB – Targets: https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC |
| Q69 | YNAB – Loan Planner: https://www.ynab.com/blog/ynab-loan-planner |
| Q70 | Copilot Money – Dashboard (Tempo-Linie): https://help.copilot.money/en/articles/6045480-dashboard-tab-overview |
| Q71 | Linear – Project Graph (Prognose aus Tempo): https://linear.app/docs/project-graph |
| Q72 | Monarch – wiederkehrende Posten erkennen: https://www.monarch.com/blog/track-recurring-bills-and-subscriptions |
| Q73 | Things – Startdatum, Heute, Demnächst: https://culturedcode.com/things/support/articles/4001304/ |
| Q74 | Sunsama – Tagesplanung: https://help.sunsama.com/docs/daily-planning |
| Q75 | RFC 7986 – iCalendar-Erweiterungen: https://www.rfc-editor.org/rfc/rfc7986.html |
| Q76 | Apple – Kalender abonnieren: https://support.apple.com/102301 |

### Kommandopaletten, Offline-first

| Nr. | Quelle |
|---|---|
| Q77 | Linear – Navigation und Kürzel: https://linear.app/enablement/guide/navigating-linear |
| Q78 | GitHub – Command Palette: https://docs.github.com/en/get-started/accessibility/github-command-palette |
| Q79 | Superhuman – Command Palette bauen: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ |
| Q80 | Raycast – Fallback Commands: https://manual.raycast.com/v1/fallback-commands |
| Q81 | Raycast – Aliasse und Hotkeys: https://manual.raycast.com/command-aliases-and-hotkeys |
| Q82 | Vimium (Link-Hints): https://github.com/philc/vimium |
| Q83 | Ink & Switch – Local-first Software: https://www.inkandswitch.com/essay/local-first/ |
| Q84 | Linear – Offline-Modus: https://linear.app/docs/offline-mode [Auszug] |
| Q85 | caniuse – Background Sync (nicht in Safari): https://caniuse.com/background-sync |
| Q86 | Workbox – Background Sync mit Rückfall beim Start: https://developer.chrome.com/docs/workbox/modules/workbox-background-sync |
| Q87 | WebKit – Speicherrichtlinie (Safari 17): https://webkit.org/blog/14403/updates-to-storage-policy/ |
| Q88 | WebKit – 7-Tage-Grenze für Skript-Speicher: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ |
| Q89 | Fetch Standard – `redirect: "manual"` liefert eine „opaque-redirect“-Antwort: https://fetch.spec.whatwg.org/ |
