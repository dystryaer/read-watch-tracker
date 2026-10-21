# Spec: Read-Watch-Tracker

> Status: **Freigegeben v0.2** · 2026-10-21
> Grundlage: bestätigtes Intent-Statement aus dem Interview vom 2026-10-21
> v0.2: Antworten auf die offenen Fragen eingearbeitet (iPhone, wechselnde Manga-Seiten, Netflix/Disney+, Kindle in %, Stack bestätigt, Kapitel-Regel ohne Zeitlimit)

---

## 1. Ziel

**Was:** Ein persönlicher Tracker, der bei jedem Titel zeigt, *wo ich stehe* – egal auf welcher Website oder in welcher App ich gelesen oder geschaut habe – und mit einem Klick zum nächsten Kapitel bzw. zur nächsten Folge führt.

**Warum:** Manga, Manhwa und Manhua lese ich auf verschiedenen Websites. Den Stand pflege ich bisher von Hand in einer Excel-Liste. Bei 63 von 136 Titeln weiß ich nicht mehr, bei welchem Kapitel ich aufgehört habe.

**Für wen:** Nur für mich. Ein Nutzer, ein Login, kein Teilen.

**Erfolg:** Ich pflege keine Excel-Liste mehr. Ich öffne den Tracker, sehe meinen Stand und komme mit einem Klick weiter.

### User Stories

| # | Als Nutzer will ich … | damit … |
|---|---|---|
| U1 | dass ein gelesenes Manga-Kapitel in Brave automatisch erfasst wird | ich nichts eintragen muss |
| U2 | dass derselbe Titel auf verschiedenen Seiten nach *einer* Bestätigung zusammengeführt wird | mein Stand nicht über Seiten verstreut ist |
| U3 | einen „Weiterlesen“-Button pro Titel | ich direkt beim nächsten Kapitel lande |
| U4 | dass Folgen auf Crunchyroll/Prime (Desktop und Nvidia Shield) automatisch erfasst werden | ich auch bei Serien weiß, wo ich bin |
| U5 | Light Novels (WebNovel-App) und E-Books (Kindle) mit minimalem Aufwand aktualisieren | auch diese Quellen im selben Überblick sind |
| U6 | meine Excel-Liste einmalig importieren | ich nicht bei null anfange |
| U7 | fehlende Kapitelstände aus dem Brave-Verlauf rekonstruieren | möglichst viele „unbekannt“-Lücken verschwinden |

---

## 2. Annahmen und Entscheidungen

1. **Handy = iPhone.** Die halbautomatischen Pfade auf dem Handy laufen über die Web-App als PWA (über Safari „Zum Home-Bildschirm“) und einen **iOS-Kurzbefehl** im Teilen-Menü (§9). Ein Web-Share-Target gibt es auf iOS nicht.
2. **Tech-Stack bestätigt** (§11): TypeScript-Monorepo, Next.js, PostgreSQL, Kotlin für die Shield-App.
3. **Cloud = kostenlose Tarife** (Neon für Postgres, Vercel Hobby für die Web-App). Es werden keine anbieterspezifischen Features genutzt, damit der Umzug auf einen eigenen Server per `pg_dump` + Docker Compose möglich bleibt.
4. **„Stand“ = zuletzt gelesenes Kapitel** (wie die Spalte „Last Read Chapter“ in der Excel-Liste). „Weiterlesen“ heißt damit Kapitel *n+1*.
5. **Kein Rückschritt durch Automatik:** Wer ein älteres Kapitel nochmal liest, verändert den Stand nicht. Zurücksetzen geht nur manuell.
6. **Die Extension trackt nur Seiten, die ich aktiv freischalte.** Sie läuft also nicht pauschal auf allen Websites.
7. **Manga-Seiten wechseln häufig** (Domain, Layout, URL-Schema). Deshalb gibt es **keine fest einprogrammierten Adapter pro Manga-Seite**. Stattdessen:
   - eine generische Erkennung,
   - **Seitenregeln als Daten**, in der Web-App bearbeitbar und ohne neuen Extension-Build wirksam,
   - einen **Domain-Umzug**, bei dem bestehende Zuordnungen erhalten bleiben (§7.2).
   Code-Adapter gibt es nur für die großen, stabilen Dienste: Streaming und Bibliotheksseiten.
8. **Kapitel-Regel ohne Zeitlimit:** Kapitel sind unterschiedlich lang, deshalb gibt es keine feste Verweildauer. Ein Kapitel zählt als gelesen, sobald sein **Ende erreicht** ist (§7.4): ≥ 60 % gescrollt, letztes Kapitelbild sichtbar oder Wechsel zum nächsten Kapitel derselben Serie. Eine Folge zählt ab ≥ 85 % Laufzeit.
9. **Streamingdienste:** Prime Video, Crunchyroll, Netflix, Disney+.
10. **Kindle:** Fortschritt in Prozent reicht.

---

## 3. Systemüberblick

```
 ┌───────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Brave-Extension (MV3) │   │ Shield-App (Android  │   │ Handy: Web-App/PWA   │
 │ • Manga-Seiten        │   │ TV, Kotlin)          │   │ • Schnell-Update     │
 │ • Streaming-Dienste   │   │ • MediaSession-      │   │ • iOS-Kurzbefehl     │
 │ • Bibliotheks-Sync    │   │   Mitleser           │   │   (Teilen-Menü)      │
 │ • Verlaufs-Backfill   │   │                      │   │                      │
 └──────────┬────────────┘   └──────────┬───────────┘   └──────────┬───────────┘
            │  ProgressEvent[] (JSON, Geräte-Token)                │ Session-Cookie
            └──────────────────────┬───────────────────────────────┘
                                   ▼
                 ┌───────────────────────────────────┐
                 │ Web-App + API (Next.js)           │
                 │ /api/v1/events → Ingest-Pipeline: │
                 │  1. Token prüfen  2. validieren   │
                 │  3. Idempotenz    4. Zuordnung    │
                 │  5. Stand fortschreiben           │
                 └───────────────┬───────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │ PostgreSQL            │
                     │ (jetzt Neon, später   │
                     │  eigener Server)      │
                     └───────────────────────┘
```

**Kernprinzip:** Alle Clients sind „dumm“. Sie melden nur, *was* sie gesehen haben: Quelle, Titel, Kapitel bzw. Folge und URL. Die Zuordnung zu einem Werk, die Regeln für den Fortschritt und die Bestätigungsanfragen laufen ausschließlich auf dem Server. Neue Clients brauchen deshalb keine eigene Matching-Logik.

### 3.1 Capability-Map

| Modul-ID | Verantwortung | Hängt ab von |
|---|---|---|
| `core` | Gemeinsame Typen, Event-Schema, Titel-Normalisierung, Kapitel-/Folgen-Parser, Fortschrittsregeln | – |
| `backend` | DB-Schema, Ingest-API, Matching, Geräte-Kopplung, Auth | `core` |
| `web` | Core-Screen, Zuordnungs-Inbox, Detailansicht, Schnell-Update (PWA), Einstellungen | `backend` |
| `import` | Einmaliger Excel-Import | `backend` |
| `ext-reading` | Extension: generische Kapitel-Erkennung + Regel-Engine, Seiten-Freischaltung, Domain-Umzug, Outbox, Verlaufs-Backfill | `core`, `backend` |
| `ext-streaming` | Extension: Desktop-Streaming (Prime, Crunchyroll, Netflix, Disney+), Sync von Verlaufsseiten | `ext-reading` |
| `shield` | Android-TV-App: MediaSession-Mitleser | `backend` (Event-Vertrag) |
| `mobile-sync` | WebNovel und Kindle halbautomatisch: Bibliotheks-Adapter, Share-API + iOS-Kurzbefehl | `ext-streaming`, `web` |

### 3.2 Ausbaustufen

| Stufe | Inhalt | Ergebnis |
|---|---|---|
| **M1 (MVP)** | `core` → `backend` → `web` → `import` → `ext-reading` | Excel abgelöst, Manga werden automatisch getrackt |
| **M2** | Spike S1 → `shield` ∥ `ext-streaming` | Serien und Anime automatisch |
| **M3** | Spikes S2/S3 → `mobile-sync` | Light Novels und E-Books halbautomatisch |
| **M4 (optional)** | Hinweise auf neue Kapitel, Statistiken | – |

---

## 4. Core-Screen

Der einzige Hauptbildschirm. Er beantwortet die Frage: *Wo stehe ich, und wie komme ich weiter?*

### 4.1 Layout (Desktop)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Read-Watch-Tracker                                  [ Suche…            ]  [⚙] │
├────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ 3 neue Zuordnungen warten auf Bestätigung                         [Prüfen →] │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Alle] [Manga/Manhwa/Manhua] [Light Novels] [E-Books] [Serien/Anime]          │
│ Status: [Lese ▾]                                  Sortierung: [Zuletzt aktiv ▾]│
├────────────────────────────────────────────────────────────────────────────────┤
│ Swordmaster's Youngest Son  Manhwa   Kap. 216   ◉ asuracomic.net  vor 2 Std.  │
│                                       [−][+]                  [Weiterlesen ›] │
│ Frieren                     Anime    S1 · F14   ◉ Crunchyroll     gestern     │
│                                                               [Öffnen ›]      │
│ Overgeared                  Manhwa   Kap. 344   – keine Seite   Import        │
│                                       [−][+]                                   │
│ Ranker's Return             Manhwa   Kap. ?     – keine Seite   Import        │
│ Shadow Slave                Novel    Kap. 1204  ◉ WebNovel       vor 3 Tagen  │
│ Project Hail Mary           E-Book   43 %       ◉ Kindle         vor 5 Tagen  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Elemente und Verhalten

| Element | Verhalten |
|---|---|
| **Zuordnungs-Banner** | Erscheint nur, wenn offene Zuordnungen existieren (§5.3). Führt zur Inbox. |
| **Typ-Tabs** | Filtern nach Medientyp. Manga, Manhwa und Manhua teilen sich einen Tab (der Typ steht als Label in der Zeile). |
| **Status-Filter** | `Lese` (Standard) · `Abgeschlossen` · `Abgebrochen` · `Alle` |
| **Sortierung** | `Zuletzt aktiv` (Standard; Titel ohne Aktivität stehen unten) · `Titel A–Z` |
| **Suche** | Clientseitige Volltextsuche über Titel und Aliasse, normalisiert (Groß-/Kleinschreibung, Apostrophe, Satzzeichen egal). |
| **Stand** | `Kap. 216`, `Kap. 105.5`, `S1 · F14`, `43 %`, oder `Kap. ?` (unbekannt, optisch hervorgehoben). |
| **Quelle** | Buchstaben-Badge + Domain bzw. Dienstname der *zuletzt genutzten* Quelle. Favicons werden bewusst nicht geladen, damit keine externen Requests entstehen. `– keine Seite` bei importierten Titeln ohne Sichtung. |
| **[−][+]** | Inline-Stepper für Kapitel und Folgen. Speichert entprellt (500 ms) als manuelle Änderung. |
| **Weiterlesen ›** | Öffnet das nächste Kapitel in einem neuen Tab (Regeln in §4.4). Fehlt, wenn keine URL bekannt ist. |
| **Titel anklicken** | Öffnet die Detailseite (§4.3). Eine eigene Seite statt eines Drawers: direkt verlinkbar, per Formular auch ohne JavaScript bedienbar. |

### 4.3 Detailseite (`/works/[id]`)

- Titel umbenennen, Typ ändern, Status setzen
- Stand manuell setzen (auch rückwärts)
- **Quellen-Links:** alle bestätigten Zuordnungen (Seite, externer Titel, Serien-URL), einzeln lösbar
- **Verlauf:** die letzten 50 Events mit Zeit, Gerät, Quelle und Ergebnis
- **Zusammenführen** mit einem anderen Werk (für versehentliche Duplikate). Dabei werden Links und Events übertragen, und der höhere Stand gewinnt.

### 4.4 „Weiterlesen“-Regeln

1. Die Seitenregel der Quelle hat eine `next_url_template` (z. B. `{seriesUrl}/chapter/{next}`) → daraus wird die URL gebaut.
2. Sonst greift die generische Regel: Kommt die Kapitelnummer im letzten Pfadsegment von `last_url` genau einmal vor (z. B. `…/chapter-216/`), wird sie durch `floor(n) + 1` ersetzt. Wurde der Stand von Hand geändert (Stand 217, `last_url` noch `…/chapter-216/`), wird die in `last_url` erkannte Kapitelnummer ersetzt; der Button öffnet also trotzdem Kapitel 218.
   Eine `www.`-Adresse der aktuellen Domain gilt nicht als Umzug und bleibt unverändert.
3. Sonst wird `last_url` geöffnet (das zuletzt gelesene Kapitel). Der Button heißt dann „Zuletzt gelesen ›“.
4. **Domain umgezogen:** Wurde die Domain von `last_url` per Domain-Umzug (§7.2) ersetzt, wird beim Bauen der URL die aktuelle Domain der Quelle eingesetzt.
5. Bei Streaming wird die Serienseite beim Anbieter geöffnet (Code-Adapter, `nextUrl`). Bei Titeln, die nur auf der Shield gesehen wurden, gibt es keinen Button.
6. Ob das nächste Kapitel tatsächlich existiert, wird **nicht** geprüft (Nicht-Ziel im MVP).

### 4.5 Zuordnungs-Inbox

Pro offener Zuordnung erscheint eine Karte:

```
„Swordmasters Youngest Son“ auf asuracomic.net · zuletzt Kap. 217 · 3 Events
  ◉ Swordmaster's Youngest Son (Manhwa)      Ähnlichkeit 0.96
  ○ Swordmaster's Youngest Son Remake        Ähnlichkeit 0.71
  ○ Neues Werk anlegen: Typ [Manhwa ▾]
                       [Zuordnen]  [Ignorieren – ist kein Werk]
```

- Der beste Kandidat ist vorausgewählt. Bestätigen kostet damit **einen Klick**.
- **„Alle mit Ähnlichkeit ≥ 0.9 bestätigen“** als Sammelaktion, gedacht nach dem Verlaufs-Backfill. Vor dem Ausführen wird die Liste zur Kontrolle angezeigt.
- Nach der Bestätigung werden alle wartenden Events dieser Zuordnung in zeitlicher Reihenfolge angewendet.

### 4.6 Mobil (≤ 640 px)

- Kartenliste statt Tabelle, gleiche Funktionen, keine horizontale Scrollleiste bei 375 px.
- Als PWA installierbar, auf dem iPhone über Safari → Teilen → „Zum Home-Bildschirm“. Die Startseite der PWA ist der **Schnell-Update-Screen** (§9.3).

### 4.7 Akzeptanzkriterien Core-Screen

- [ ] Der Core-Screen lädt mit 500 Werken in < 1,5 s (LCP, Desktop, Breitband).
- [ ] Filter, Suche und Sortierung reagieren in < 100 ms (clientseitig, ohne Server-Roundtrip).
- [ ] Ein Werk mit unbekanntem Stand ist optisch klar erkennbar und über einen Filter `Stand unbekannt` auffindbar.
- [ ] Das Banner verschwindet, sobald die Inbox leer ist.
- [ ] Alle Bedienelemente funktionieren per Tastatur. Die Kontraste erfüllen WCAG AA.

---

## 5. Datenmodell

PostgreSQL mit der Erweiterung `pg_trgm` für Ähnlichkeitssuche. Spaltennamen in `snake_case`. Alle Zeitstempel sind `timestamptz` in UTC.

### 5.1 Tabellen

```
media_type  = manga | manhwa | manhua | light_novel | ebook | anime | series | movie
work_status = reading | completed | dropped
source_kind = website | streaming | app
device_kind = extension | shield | phone
event_kind  = read | watched | library_sync | backfill | manual
outcome     = applied | no_change | pending | ignored | rejected
```

**`works`**: ein Werk, unabhängig von der Quelle

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | |
| `type` | media_type | |
| `title` | text | kanonischer Titel (aus Import oder erster Bestätigung) |
| `title_normalized` | text, generiert | `normalize(title)`, GIN-Trigram-Index |
| `status` | work_status | Standard `reading` |
| `chapter` | numeric(7,2) null | Manga, Manhwa, Manhua, Light Novel |
| `season` | int null | Anime, Serie |
| `episode` | int null | Anime, Serie |
| `percent` | numeric(5,2) null | E-Book |
| `last_source_id` | uuid FK → sources null | |
| `last_url` | text null | Grundlage für „Weiterlesen“ |
| `last_progress_at` | timestamptz null | Sortierung „Zuletzt aktiv“ |
| `notes` | text null | |
| `created_at`, `updated_at` | timestamptz | |

Check-Constraint: Nur die zum `type` passenden Positionsspalten dürfen gesetzt sein. Ein Film hat keine Position, nur den Status. **„Stand unbekannt“** heißt: Alle Positionsspalten sind `null`.

**`sources`**: eine Website, ein Dienst oder eine App, *unabhängig von ihrer aktuellen Domain*

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | |
| `key` | text unique | stabil, wird bei Domain-Wechseln nicht geändert. Beispiele: `site:asura` (beim Freischalten aus dem Namen vergeben), `crunchyroll`, `primevideo`, `netflix`, `disneyplus`, `webnovel`, `kindle` |
| `name` | text | Anzeigename, editierbar |
| `kind` | source_kind | |
| `tracking_enabled` | bool | in der Extension freigeschaltet |
| `default_media_type` | media_type null | Vorbelegung bei „Neues Werk anlegen“ |
| **Seitenregel** (alle optional, nur `website`; leer = generische Erkennung): | | |
| `rule_chapter_pattern` | text null | Regex mit einer Gruppe für die Kapitelnummer (auf den URL-Pfad) |
| `rule_series_pattern` | text null | Regex mit einer Gruppe für den Serienschlüssel (auf den URL-Pfad) |
| `rule_title_selector` | text null | CSS-Selektor für den Serientitel |
| `rule_end_selector` | text null | CSS-Selektor für „Kapitelende erreicht“ (z. B. letztes Bild, „Nächstes Kapitel“-Button) |
| `rule_next_url_template` | text null | z. B. `{seriesUrl}/chapter/{next}` oder `{origin}/{series}/chapter-{next}` |
| `rule_updated_at` | timestamptz null | Extension lädt Regeln per `/config` neu |

**`source_domains`**: Domains einer Quelle. Eine Seite kann mehrfach umziehen.

| Spalte | Typ | Hinweis |
|---|---|---|
| `domain` | text PK | z. B. `asuracomic.net` |
| `source_id` | uuid FK → sources | |
| `is_current` | bool | genau eine aktuelle Domain pro Quelle. Sie wird für „Weiterlesen“ und das Quellen-Badge verwendet. |
| `added_at` | timestamptz | |

**`work_links`**: das Gedächtnis für „einmal bestätigen, dann merken“

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | |
| `work_id` | uuid FK → works | |
| `source_id` | uuid FK → sources | |
| `external_key` | text | stabiler Serienschlüssel auf der Quelle (§5.2) |
| `external_title` | text | Titel, wie die Quelle ihn schreibt (auch Suchalias) |
| `series_url` | text null | |
| `confirmed_at` | timestamptz | |
| | | **unique (`source_id`, `external_key`)** |

**`events`**: append-only Protokoll aller Meldungen. Events werden nie gelöscht.

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | **vom Client erzeugt**, sorgt für Idempotenz |
| `device_id` | uuid FK → devices null | `null` bei Änderungen in der Web-UI |
| `source_id` | uuid FK → sources | |
| `kind` | event_kind | |
| `external_key`, `raw_title`, `url` | text | Rohdaten |
| `chapter`, `season`, `episode`, `percent` | wie `works` | gemeldete Position |
| `occurred_at` | timestamptz | Zeitpunkt auf dem Client |
| `received_at` | timestamptz | |
| `work_id` | uuid FK null | gesetzt, sobald zugeordnet |
| `outcome` | outcome | |

**`pending_matches`**: offene Zuordnungen für die Inbox

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | |
| `source_id`, `external_key` | | unique, solange unerledigt |
| `raw_title` | text | |
| `media_type_hint` | media_type null | |
| `candidates` | jsonb | `[{ "workId": "…", "score": 0.96 }]`, Top 3, Score ≥ 0.3 |
| `event_count`, `first_seen_at`, `last_seen_at` | | |
| `resolved_at` | timestamptz null | |
| `resolution` | `linked` \| `new_work` \| `ignored` null | `ignored` verwirft künftige Events dieses Schlüssels |

**`devices`** und **`pairing_codes`**: Geräte-Kopplung (§6.2)

| Spalte (`devices`) | Typ | Hinweis |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | z. B. „Brave Desktop“, „Shield Wohnzimmer“ |
| `kind` | device_kind | |
| `token_hash` | text | SHA-256 des Tokens. Der Klartext wird nie gespeichert. |
| `created_at`, `last_seen_at`, `revoked_at` | timestamptz | |

`pairing_codes`: `code` (6 Zeichen, ohne verwechselbare Zeichen), `poll_secret_hash`, `device_kind`, `device_name`, `expires_at` (10 min), `approved_device_id` null, `token_issued_at` null. Das Token wird erst beim ersten Poll nach der Freigabe erzeugt; gespeichert wird nur sein Hash am Gerät. Ein zweiter Poll bekommt kein Token mehr.

Die Auth-Tabellen kommen von der Auth-Bibliothek (§11).

### 5.2 Externe Schlüssel

| Quelle | `external_key` |
|---|---|
| Manga-Seiten | Serien-Slug aus der URL (`rule_series_pattern` bzw. generisch), normalisiert. Angehängte Zufalls- oder Hash-Suffixe (z. B. `-7d3f2a1b`, typisch bei Redesigns) werden entfernt. Fallback: normalisierter Titel. |
| Streaming (Desktop **und** Shield) | **normalisierter Serientitel** ohne Sprach- und Fassungs-Tags wie „(German Dub)“, „[Sub]“, „(OmU)“, „(Uncut)“ (`core/episode.ts`, `streamingSeriesKey`). Die Shield kennt keine Anbieter-IDs, deshalb nutzen beide Clients den Titel. Der Server leitet den Schlüssel für Streaming-Quellen selbst aus dem gesendeten Schlüssel ab, sodass Desktop und Shield nie auseinanderlaufen. Eine einzige Bestätigung deckt so Desktop und TV ab. Staffel und Folge liest `parseEpisode`; die Testfälle in `packages/core/fixtures/episodes.json` gelten auch für die Kotlin-Logik der Shield. |
| WebNovel | Book-ID aus der URL bzw. der Bibliothek |
| Kindle | ASIN |

### 5.3 Regeln

**Titel-Normalisierung** (`core/normalize.ts`, `normalizeTitle`), in dieser Reihenfolge:
1. Apostrophe ersatzlos entfernen (`'`, `’`, `‘`, `´`, `` ` ``, `ʼ`, `＇`): `Swordmaster’s` → `swordmasters`. Das passiert vor Schritt 2, weil NFKD `´` sonst in Leerzeichen plus Akzent zerlegt.
2. Unicode-Kompatibilitätszerlegung (NFKD), lateinische Diakritika entfernen (`Tōkyō` → `Tokyo`), wieder zusammensetzen (NFKC). Vollbreite Zeichen und Ligaturen werden dabei zu normalen Zeichen.
3. Unsichtbare Formatzeichen entfernen (Zero-Width-Space, weiches Trennzeichen, BOM).
4. Kleinschreibung.
5. Rausch-Suffixe am Ende entfernen, auch mehrere hintereinander: `(manga)`, `(manhwa)`, `(manhua)`, `(webtoon)`, `(official)`, `(remastered)`, `(german dub)`, `(english dub)`, `(dub)`, jeweils auch in `[…]`. Bliebe danach nichts übrig, bleibt das Suffix stehen.
6. Tausendertrenner zwischen Ziffern entfernen: `10,000` und `10.000` → `10000`.
7. Alle übrigen Satz- und Sonderzeichen (Bindestriche, Gedankenstriche, Doppelpunkte, Klammern …) werden zu Leerzeichen; Leerraum zusammenfassen und trimmen.

Nicht-lateinische Schriften (Hangul, Kana, Hanzi) bleiben unverändert erhalten. Die Funktion ist idempotent.

**Zuordnung beim Ingest** (pro Event, in einer Transaktion):
1. `events.id` existiert schon → `no_change` (Duplikat, nichts tun).
2. Quelle per `key` holen bzw. anlegen. Die Domain wird über `source_domains` aufgelöst, sodass alte und neue Domain dieselbe Quelle ergeben.
3. `work_links` (Quelle, Schlüssel) vorhanden → Werk gefunden → weiter mit Fortschritt.
4. **Wiedererkennung bei geändertem Schlüssel:** Kein Link für den Schlüssel, aber der normalisierte `raw_title` stimmt **exakt** mit `external_title` eines bestehenden Links *derselben Quelle* überein. Das passiert, wenn eine Seite ihr URL-Schema ändert. Dann wird ein zusätzlicher Link mit dem neuen Schlüssel angelegt (Hinweis im Event-Verlauf), und es geht weiter mit Fortschritt. Das ist kein Ähnlichkeits-Matching, sondern die Wiedererkennung einer bereits bestätigten Zuordnung.
5. Existiert eine erledigte `pending_matches`-Zeile mit `ignored` → `ignored`.
6. Sonst `pending_matches` anlegen oder aktualisieren. Die Kandidaten kommen aus der Trigram-Ähnlichkeit gegen `works.title_normalized` und `work_links.external_title`. Ergebnis: `pending`.
7. **Es wird nie automatisch aufgrund von Ähnlichkeit zugeordnet.** Automatisch laufen nur der exakte Treffer in `work_links` (Schritt 3) und die exakte Wiedererkennung (Schritt 4).

**Fortschritt** (`core/progress.ts`, reine Funktion):
- Stand unbekannt → jede gemeldete Position wird übernommen.
- Sonst wird nur übernommen, wenn die neue Position **größer** ist. Kapitel und Prozent werden numerisch verglichen, Folgen als `(season, episode)`. Fehlt die Staffel auf einer der beiden Seiten (z. B. beim Event von der Shield), werden nur die Folgen verglichen.
- `watched` bei `movie` setzt den Status `completed`.
- Manuelle Änderungen aus der Web-UI (`kind = manual`) dürfen den Stand auch verringern.
- Bei `applied` werden `last_source_id`, `last_url` und `last_progress_at` aktualisiert, ebenso `work_links.series_url`, falls sie mitgeliefert wurde.

---

## 6. API

Basis-Pfad `/api/v1`. Alle Bodies sind JSON und werden mit zod validiert (Schemas in `packages/core`).

### 6.1 Endpunkte

| Methode + Pfad | Auth | Zweck |
|---|---|---|
| `POST /events` | Geräte-Token (`Authorization: Bearer …`) | Batch von 1–100 `ProgressEvent`s. Antwort: `{ results: [{ id, outcome, reason? }] }`. Ungültige Events werden einzeln `rejected`; der Rest wird verarbeitet. |
| `GET /config` | Geräte-Token | Freigeschaltete Quellen mit Domains und Seitenregeln, dazu die Scroll- und die Folgen-Schwelle. Extension und Shield teilen sich so eine Konfiguration. Unterstützt `ETag`, damit die Extension nur geänderte Regeln lädt. |
| `POST /pairing` | – | `{ kind, name }` → `{ code, pollSecret, expiresAt }` |
| `POST /pairing/poll` | – (`pollSecret`) | `{ status: pending \| approved \| expired, deviceToken? }`. Das Token wird genau einmal ausgeliefert. |
| `POST /share` | Geräte-Token (`phone`) | Für den iOS-Kurzbefehl: `{ url?, text? }` → Server erkennt Quelle und Werk → `{ shareId, title?, unit?, current?, suggested?, needsMatch }` |
| `POST /share/confirm` | Geräte-Token (`phone`) | `{ shareId, chapter? \| percent? }` (Zahl auch als Text mit Dezimalkomma) → der Server erzeugt das Event (inkl. UUID, weil Kurzbefehle keine erzeugen können) → `{ outcome, title, message }`. `message` ist die fertige Mitteilung für den Kurzbefehl. Ein Teilen gilt 15 min, einmal und nur für das Gerät, das es gestartet hat. Fehler der beiden Share-Endpunkte tragen ebenfalls ein `message` (z. B. bei widerrufenem Token). |

Interne Aktionen der Web-UI (Kopplung bestätigen, Zuordnung auflösen, Stand ändern, Werk zusammenführen, Gerät widerrufen, Seitenregeln bearbeiten, Domain-Umzug) laufen als Server Actions mit Session-Auth.

**Antwortcodes:** `200` bei verarbeitetem Batch (auch wenn einzelne Events `pending`/`rejected` sind) · `401` bei ungültigem oder widerrufenem Token · `413` bei mehr als 100 Events · `429` bei mehr als 60 Requests/min pro Gerät.

### 6.2 Geräte-Kopplung

Funktioniert wie der OAuth-Device-Flow und ist für TV-Fernbedienungen gemacht, auf denen man keine Tokens eintippen will:

1. Der Client ruft `POST /pairing` auf und zeigt den Code groß an (z. B. `K7P-3QX`), dazu einen QR-Code auf `<APP_URL>/pair?code=K7P3QX`.
2. Ich öffne die Web-App (eingeloggt) und gebe den Code ein. Die Web-App zeigt zuerst, was gekoppelt werden will (Art, Name, wie lange die Anfrage her ist), mit dem Hinweis, nur ein Gerät zu bestätigen, das ich vor mir habe. Erst „Koppeln bestätigen“ koppelt; der Name lässt sich dabei ändern. Auch der QR-Code führt nur zu dieser Bestätigung.
3. Der Client fragt alle 3 s `POST /pairing/poll` ab und erhält das Token. Gespeichert wird es lokal: in der Extension unter `chrome.storage.local`, auf der Shield in privaten SharedPreferences.

**iPhone-Kurzbefehl:** Ein Kurzbefehl kann den Poll-Ablauf nicht sinnvoll abbilden. Unter „Einstellungen → Geräte → iPhone-Kurzbefehl hinzufügen“ erzeugt die Web-App deshalb direkt ein `phone`-Token und zeigt es einmalig an. Beim Hinzufügen des vorbereiteten Kurzbefehls fragt iOS das Token ab (Import-Frage). Anleitung: `docs/setup-iphone.md`.

Token: 32 zufällige Bytes, base64url. Es wird beim ersten erfolgreichen Poll atomar vergeben, sodass zwei gleichzeitige Polls nie beide ein Token bekommen. Fehlgeschlagene Token-Prüfungen sind pro Client-Adresse begrenzt (30/min). Widerruf in den Einstellungen setzt `revoked_at`; ab dann liefert die API `401`.

### 6.3 Event-Vertrag

```ts
// packages/core/src/event.ts
export const Position = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("chapter"), chapter: z.number().nonnegative() }),
  z.object({
    unit: z.literal("episode"),
    season: z.number().int().positive().nullable(),
    episode: z.number().int().positive(),
  }),
  z.object({ unit: z.literal("percent"), percent: z.number().min(0).max(100) }),
  z.object({ unit: z.literal("none") }), // Film gesehen, Bibliothekseintrag ohne Stand
]);

export const ProgressEvent = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  kind: z.enum(["read", "watched", "library_sync", "backfill"]),
  source: z.object({
    key: z.string().min(1),
    externalKey: z.string().min(1),
    rawTitle: z.string().min(1),
    url: z.string().url().optional(),
    seriesUrl: z.string().url().optional(),
  }),
  position: Position,
  mediaTypeHint: MediaType.optional(),
});
```

Aus diesem Schema wird `packages/core/event.schema.json` generiert (zod → JSON Schema). Die Shield-App validiert ihre Payloads in Tests dagegen (Vertragstest, §15).

---

## 7. Browser-Extension (Brave)

Eine Manifest-V3-Extension für Chromium, gebaut mit WXT. In Brave wird sie entpackt geladen; ein Web-Store-Eintrag ist nicht nötig.

### 7.1 Aufbau

```
entrypoints/
  background.ts      Service Worker: Outbox, Sync-Alarm, Regel-Cache, Registrierung der Content-Scripts
  content.ts         läuft nur auf freigeschalteten Origins und festen Dienst-Domains
  popup/             Status des aktuellen Tabs, „Diese Seite tracken“, Domain-Umzug
  options/           Kopplung, freigeschaltete Seiten, Verlaufs-Backfill
reading/
  engine.ts          DOM-Teil der Kapitel-Erkennung (Titel-Selektor, Fallbacks), gesteuert durch eine optionale SiteRule
  end-detector.ts    „Kapitelende erreicht“ (§7.4)
                     (Der URL-Teil, also Kapitel- und Serien-Pattern, liegt in packages/core.
                      Regel-Editor und Extension rechnen so mit demselben Code.)
adapters/            Code-Adapter nur für große, stabile Dienste
  crunchyroll.ts, primevideo.ts, netflix.ts, disneyplus.ts   (ext-streaming)
  webnovel-library.ts, kindle-library.ts                     (mobile-sync)
```

```ts
// Manga-Seiten: keine eigenen Code-Adapter, sondern Daten aus /config
export interface SiteRule {
  sourceKey: string;
  domains: string[];                 // alle bekannten Domains, inkl. alter
  chapterPattern?: string;           // Regex, Gruppe 1 = Kapitelnummer
  seriesPattern?: string;            // Regex, Gruppe 1 = Serienschlüssel
  titleSelector?: string;
  endSelector?: string;
  nextUrlTemplate?: string;
}
export function detectChapter(doc: Document, url: URL, rule?: SiteRule): Detection | null;
export function detectChapterFromUrl(url: URL, title: string, rule?: SiteRule): Detection | null; // Backfill

// Streaming und Bibliotheken: Code-Adapter
export interface ServiceAdapter {
  key: string;                       // = sources.key
  matches(url: URL): boolean;
  detect(doc: Document, url: URL): Detection | null;
  nextUrl?(lastUrl: URL, position: Position): string | null;
}
// Detection = { externalKey, rawTitle, position, seriesUrl?, mediaTypeHint? }
```

### 7.2 Seiten freischalten (Datenschutz)

- Das Manifest deklariert nur `optional_host_permissions: ["https://*/*"]`. Fest eingetragen sind lediglich die API-Domain und die Dienst-Domains (`primevideo.com`, `amazon.de`, `crunchyroll.com`, `netflix.com`, `disneyplus.com`, `webnovel.com`, `read.amazon.com`).
- Im Popup auf einer unbekannten Seite: **[Diese Seite tracken]** → `chrome.permissions.request({ origins: [origin + "/*"] })` → `chrome.scripting.registerContentScripts` für diesen Origin → Quelle per Server Action als `tracking_enabled` markieren.
- Beim Freischalten wähle ich: **○ Neue Quelle** (Name vorbelegt aus der Domain) oder **○ Umzug von: [Asura (asuracomic.net) ▾]**.
- **Domain-Umzug:** Die neue Domain wird der bestehenden Quelle in `source_domains` zugeordnet und als aktuell markiert. Alle bisherigen Zuordnungen, Seitenregeln und „Weiterlesen“-Links gelten sofort weiter, ohne erneute Bestätigung. Den Umzug kann ich auch nachträglich in der Web-App unter „Einstellungen → Seiten“ eintragen.
- Auf nicht freigeschalteten Seiten läuft **kein** Content-Script. Von dort verlassen keine Daten den Browser.

### 7.3 Kapitel-Erkennung

Ein Feld der Seitenregel überschreibt jeweils nur den entsprechenden generischen Schritt. Eine leere Regel heißt: rein generisch.

| Schritt | Seitenregel (falls gesetzt) | generischer Standard |
|---|---|---|
| Kapitelnummer | `chapterPattern` auf den Pfad | `/(?:chapter\|chap\|ch\|episode\|ep)[-_/ ]?(\d+(?:[.-]\d+)?)/i` auf den Pfad, Fallback auf `document.title` |
| Serienschlüssel | `seriesPattern` auf den Pfad | Pfadsegment vor dem Kapitelsegment, ohne Hash-Suffix (§5.2) |
| Titel | `titleSelector` | `og:title` → `h1` → `document.title`; „Chapter N“, Seitenname und Trenner werden entfernt |

- Liefert die Erkennung nichts, zeigt das Popup „Kein Kapitel erkannt – [Regel bearbeiten]“ und es wird nichts gesendet. Der Link öffnet die Seitenregel in der Web-App, vorbelegt mit der aktuellen URL als Testfall.
- **Regel-Editor in der Web-App:** Felder wie oben, dazu ein Live-Test. Ich füge eine oder mehrere Beispiel-URLs ein, und der Editor zeigt, welche Kapitelnummer und welcher Serienschlüssel erkannt werden. Regex-Felder werden beim Speichern auf gültige Syntax geprüft.
- Geänderte Regeln greifen ohne neuen Extension-Build: Die Extension lädt `/config` beim Start, alle 15 min und sofort nach einer Änderung im Popup.

### 7.4 Wann zählt ein Kapitel als gelesen?

Es gibt **keine feste Verweildauer**, weil Kapitel unterschiedlich lang sind. Ein Kapitel zählt, sobald die Erkennung stabil ist (gleiche Detection für ≥ 2 s) **und** eines dieser Signale für „Ende erreicht“ eintritt:

1. **Scrolltiefe ≥ 60 %** der Kapitelseite (Long-Strip-Reader; Schwelle per `/config` einstellbar).
2. **Ende sichtbar:** Das Element aus `endSelector` erscheint im Viewport (IntersectionObserver). Ohne Regel gilt generisch das letzte große Bild im Reader-Bereich (nur auf scrollbaren Seiten). Generisch, auch ohne Regel und auf seitenweisen Readern, zählt außerdem ein **Klick** auf einen Link bzw. Button „Next chapter“/„Nächstes Kapitel“ (auch „next chap“, „Next episode“). Sichtbarkeit allein genügt dafür nicht, weil viele Reader diesen Button schon oben auf der Seite zeigen; ein bloßes „Next“ zählt nicht, weil es bei seitenweisen Readern oft nur umblättert.
3. **Weiter zum nächsten Kapitel:** Öffne ich im selben Tab ein höheres Kapitel derselben Serie, zählt das vorherige als gelesen, auch wenn Signal 1 oder 2 nicht ausgelöst hat. Der Stand pro Tab liegt dafür in `chrome.storage.session`, weil MV3 den Service Worker nach etwa 30 s Leerlauf beendet.

Pro (Serie, Kapitel) wird höchstens 1 Event in 12 h gesendet.

### 7.5 Desktop-Streaming (`ext-streaming`)

- Adapter für Prime Video, Crunchyroll, Netflix und Disney+ beobachten das `<video>`-Element (Content-Script mit festen Matches auf den Dienst-Domains, `apps/extension/src/streaming/`).
- Metadaten kommen bevorzugt aus `navigator.mediaSession.metadata`, sonst aus dem DOM bzw. dem Seitentitel. Daraus entstehen Serientitel, Staffel und Folge. Ein Film wird nur erkannt, wo der Dienst für Filme kein Folgen-Label zeigt; ein unlesbares Label heißt „unbekannt“, nicht „Film“.
- Gesendet wird `watched`, sobald `currentTime / duration ≥ 0.85` oder `ended` eintritt, einmal pro Folge. Videos unter 60 s (Werbung, Trailer, Vorschauen) zählen nie; lädt der Player die nächste Folge ins selbe Element (Autoplay), beginnt die Zählung neu.
- Spielt der Player in einem Frame (Crunchyroll), meldet der Frame den Fortschritt und die Seite den Titel; der Background führt beides pro Tab zusammen (`chrome.storage.session`). Titel werden nur vom Hauptframe angenommen, und nur von der Dienst-Domain, die der Browser als Absender meldet.
- Die Adapter sind gegen synthetische Seiten gebaut (A10) und gelten bis zu echten Seitenproben als unverifiziert.

### 7.6 Sync über Verlaufs- und Bibliotheksseiten (`ext-streaming`, `mobile-sync`)

Öffne ich in Brave eine dieser Seiten, liest der zugehörige Adapter die sichtbaren Einträge und sendet sie als `library_sync`-Batch:

| Seite | liefert | dient als |
|---|---|---|
| Crunchyroll-Verlauf | Serie, Folge | Fallback für Shield-Lücken |
| Prime-Video-Wiedergabeverlauf | Serie, Folge | Fallback für Shield-Lücken |
| Netflix-Aktivitätenverlauf (`netflix.com/viewingactivity`) | Serie, Folge | Fallback für Shield-Lücken |
| Disney+ | offen: Disney+ hat ggf. keine Verlaufsseite → Spike S1 | ggf. kein Fallback, dann nur Shield bzw. Desktop |
| WebNovel-Bibliothek | Buch, gelesenes Kapitel | halbautomatischer Pfad für Light Novels (§9) |
| Kindle-Bibliothek (`read.amazon.com`) | Buch (ASIN), ggf. Fortschritt | halbautomatischer Pfad für E-Books (§9) |

Gelesen wird nur, was die Seite mir eingeloggt ohnehin anzeigt. Zugangsdaten werden weder gespeichert noch serverseitig verwendet.

Umsetzung (M2, `apps/extension/src/streaming/history.ts`): Die Adapter lesen Karten nach Inhalt statt nach Klassennamen (erstes Folgen-Label, davor der Serientitel, Datumsangaben übersprungen), mit generischen Karten-Selektoren als Rückfall, falls eine Seite ihr Markup ändert. Pro Serie geht nur die weiteste Folge als `library_sync` an den Server, mit deterministischer Event-ID; ein erneutes Öffnen der Seite zählt also nichts doppelt. Einträge ohne Folgennummer werden übersprungen. Achtung: Der Netflix-Aktivitätenverlauf nennt meist nur den Folgentitel („Dark: Staffel 2: „Lügen““), daher liefert er voraussichtlich nur selten Positionen; das klärt Spike S1. Alle Verlaufs-Adapter gelten bis zu echten Seitenproben als unverifiziert (A10).

### 7.7 Outbox und Zuverlässigkeit

- Jedes Event bekommt beim Erzeugen eine UUID und landet in der Outbox in `chrome.storage.local`.
- Geleert wird die Outbox sofort nach dem Einreihen und zusätzlich jede Minute per `chrome.alarms`. Bei Fehlern gilt exponentieller Backoff bis 30 min. Da der Server idempotent ist, kann ein Event mehrfach gesendet werden, ohne dass es doppelt zählt.
- Maximal 5 000 Events in der Outbox. Wird es mehr, fallen die ältesten heraus, und das Popup zeigt eine Warnung.

### 7.8 Popup

```
Overgeared · Kap. 345 erkannt
Wird gezählt, sobald das Kapitelende erreicht ist … ✓ gezählt
──────────────────────────────
Quelle: Asura (asuracomic.net)   [Deaktivieren]
Outbox: 0 · zuletzt synchronisiert vor 1 min
[Tracker öffnen]  [Regel bearbeiten]  [Falsch erkannt? Serie ignorieren]
```

### 7.9 Verlaufs-Backfill (U7)

- Ein Button in den Optionen fordert die optionale Berechtigung `history` an (nur in diesem Moment).
- `chrome.history.search` über die letzten 90 Tage (so lange hält Brave den Verlauf standardmäßig vor). Ausgewertet werden nur URLs auf **freigeschalteten** Domains, über `detectChapterFromUrl`, einschließlich alter Domains aus Umzügen. Verlaufseinträge einer Seite vor ihrem Umzug werden so der richtigen Quelle zugeordnet.
- Pro `externalKey` wird das höchste Kapitel als `backfill`-Event gesendet. Die Events durchlaufen die normale Zuordnung, ich bestätige also in der Inbox, gern per Sammelaktion.
- Reihenfolge für mich: zuerst die Manga-Seiten freischalten, dann den Backfill starten.

### 7.10 Akzeptanzkriterien Extension

- [ ] Auf einer freigeschalteten Seite steht ein gelesenes Kapitel ≤ 10 s nach Erreichen des Kapitelendes in der Web-App. Geprüft wird das für alle drei Signale aus §7.4.
- [ ] Ein kurzes und ein sehr langes Kapitel werden gleichermaßen erst am Ende gezählt, nicht nach einer festen Zeit.
- [ ] Auf einer nicht freigeschalteten Seite wird nachweislich kein Request an die API gesendet (E2E-Test).
- [ ] **Domain-Umzug:** Nach „Umzug von Asura“ auf einer neuen Domain wird das nächste Kapitel einer bereits zugeordneten Serie ohne Inbox-Karte übernommen.
- [ ] **Regel ändern:** Eine in der Web-App geänderte Seitenregel greift in der laufenden Extension ohne Neuinstallation.
- [ ] Ändert eine Seite nur das Hash-Suffix ihrer Serien-URLs, entsteht keine neue Inbox-Karte.
- [ ] 20 offline gelesene Kapitel werden nach der Wiederverbindung vollständig und ohne Duplikate übertragen.
- [ ] Ein erneutes Lesen von Kapitel 100 bei Stand 150 ändert nichts.
- [ ] Der Backfill fordert `history` erst beim Klick an und wertet nur freigeschaltete Origins aus.

---

## 8. Nvidia Shield: automatisches Tracking

### 8.1 Ansatz

Eine kleine Android-TV-App (Kotlin), per adb sideloaded. Sie liest über die offizielle Android-API mit, was gerade abgespielt wird:

- Ein `NotificationListenerService` (`MediaWatcherService`) berechtigt die App zu `MediaSessionManager.getActiveSessions(componentName)`.
- `addOnActiveSessionsChangedListener` plus ein `MediaController.Callback` pro Session liefern `onMetadataChanged` und `onPlaybackStateChanged`.
- Ausgewertet werden die `MediaMetadata`-Felder `TITLE`, `DISPLAY_TITLE`, `DISPLAY_SUBTITLE`, `ARTIST`, `ALBUM` und `DURATION` sowie der `PlaybackState` (Position, Geschwindigkeit, letzter Update-Zeitpunkt).
- Es gibt keinen Eingriff in andere Apps, kein Screen-Scraping und keine Umgehung von DRM.

### 8.2 Einrichtung (einmalig, als Anleitung in `docs/setup-shield.md`)

1. Auf der Shield die Entwickleroptionen und das Netzwerk-Debugging aktivieren.
2. `adb connect <shield-ip>:5555`
3. `adb install -r app-release.apk`
4. `adb shell cmd notification allow_listener app.rwt.shield/app.rwt.shield.MediaWatcherService`. Nötig, weil Android TV dafür keinen Einstellungsdialog anbietet.
5. Die App öffnen. Sie zeigt den Kopplungscode und einen QR-Code (§6.2); ich bestätige am Handy oder Desktop.

### 8.3 Erkennungslogik

- **Allowlist pro App:** Nur Pakete mit hinterlegtem `PackageMapping` werden ausgewertet: Prime Video (`com.amazon.amazonvideo.livingroom`), Crunchyroll, Netflix (`com.netflix.ninja`), Disney+. Die Paketnamen werden im Spike S1 verifiziert. YouTube, Musik und alle übrigen Apps werden ignoriert.
- **Mapping:** Jedes `PackageMapping` ist eine reine Funktion `MediaMetadata-Snapshot → (seriesTitle, season?, episode)?`, etwa per Regex auf `DISPLAY_SUBTITLE` wie `S2 E5 – Titel`.
- **Gesehen-Regel:** Bei gleichbleibenden Metadaten gilt eine Folge als gesehen, wenn die berechnete Position / `DURATION` ≥ 0.85 erreicht. Geprüft wird bei jedem State-Wechsel und alle 30 s während der Wiedergabe. Wechseln die Metadaten (Autoplay der nächsten Folge), wird die vorherige Folge noch einmal final bewertet. Pro (Paket, Serie, Staffel, Folge) entsteht ein Event.
- **Nicht auswertbar:** Lässt sich keine Folgennummer bestimmen, wird nichts gesendet. Der Snapshot landet stattdessen in der lokalen Liste „Nicht erkannt“, die im Statusscreen sichtbar ist. Fallback für diese Folgen ist der Verlaufs-Sync am Desktop (§7.6).
- **Event:** `kind: "watched"`, `source.key` = Dienst (z. B. `crunchyroll`, identisch zum Desktop), `externalKey` = normalisierter Serientitel (§5.2).

### 8.4 Zuverlässigkeit

- Android bindet den Listener nach einem Neustart automatisch. Bei `onListenerDisconnected` ruft die App `requestRebind` auf.
- Die Outbox ist eine Datei-Queue im privaten App-Speicher (Logik im JVM-Modul `apps/shield/logic`, testbar ohne Android). Geleert wird sie per WorkManager (Constraint: Netzwerk verbunden) mit Backoff.
- Das Geräte-Token liegt in privaten SharedPreferences. EncryptedSharedPreferences ist abgekündigt; der App-Sandbox-Schutz reicht für ein widerrufbares Token.
- Der Statusscreen zeigt: gekoppelt ✓/✗ · Listener-Berechtigung ✓/✗ · letzte 10 Events · Outbox-Größe · „Nicht erkannt“-Liste.

### 8.5 Spike S1 (vor dem Bau, Timebox 1 Tag)

Ein Debug-Build loggt alle Metadaten-Keys und PlaybackStates als JSON. Damit schaue ich je eine Folge in Prime Video, Crunchyroll, Netflix und Disney+. Zusätzlich wird geprüft, ob Disney+ im Web eine auslesbare Verlaufsseite hat (Fallback, §7.6).

- Die Samples werden als Fixtures unter `apps/shield/logic/src/test/resources/fixtures/<paket>/` gespeichert. Anleitung: `docs/spikes/s1-shield-metadata.md`; der Logger steckt nur im Debug-Build (`SpikeLogger`).
- **Entscheidung pro Dienst:** Liefern die Metadaten Serie und Folge, wird ein Mapping gebaut. Liefern sie das nicht, wird der Dienst auf der Shield ignoriert und der Verlaufs-Sync am Desktop ist der offizielle Pfad. Das Ergebnis wird in `docs/spikes/s1-shield-metadata.md` dokumentiert.

### 8.6 Akzeptanzkriterien Shield

- [ ] Eine Folge, die auf der Shield in einem gemappten Dienst zu ≥ 85 % gesehen wurde, steht ≤ 2 min später in der Web-App.
- [ ] Desktop und Shield schreiben bei derselben Serie auf **dasselbe** Werk, nach nur einer Bestätigung.
- [ ] Musik- und YouTube-Wiedergabe erzeugt keine Events.
- [ ] Nach einem Neustart der Shield funktioniert das Tracking ohne mein Zutun weiter.

---

## 9. Handy: halbautomatisch (WebNovel und Kindle)

Vollautomatik ist hier ausdrücklich nicht nötig. Ziel ist: **Aktualisieren mit ≤ 2 Taps oder ganz nebenbei.**

### 9.1 WebNovel (Light Novels)

| Pfad | Wie | Aufwand |
|---|---|---|
| **A: Bibliotheks-Sync** (bevorzugt) | WebNovel synchronisiert den Lesefortschritt zwischen App und Website (Spike S2). Öffne ich `webnovel.com` → Bibliothek in Brave, sendet der Adapter für alle Bücher Book-ID, Titel und Kapitel. | 1 Seitenaufruf, z. B. wöchentlich |
| **B: Schnell-Update** | Web-App als PWA auf dem iPhone, Kapitel `[+]` (§9.3) | 2 Taps |
| **C: iOS-Kurzbefehl** | In der WebNovel-App „Teilen“ → Kurzbefehl „Lesestand“ (§9.4) | 3 Taps |

**Erinnerung:** Ist der letzte WebNovel-Sync älter als 7 Tage, zeigt der Core-Screen einen dezenten Hinweis mit Link zur WebNovel-Bibliothek.

### 9.2 Kindle (E-Books)

| Pfad | Wie | Aufwand |
|---|---|---|
| **A: Bibliotheks-Sync** | Adapter für `read.amazon.com` (Kindle-Bibliothek): Bücher (ASIN, Titel, Autor), dazu der Fortschritt in %, falls die Seite ihn anzeigt (Spike S3) | 1 Seitenaufruf |
| **B: Schnell-Update** | Prozent-Regler bzw. Eingabe in der PWA | 2 Taps |
| **C: iOS-Kurzbefehl** (falls S3 positiv) | In der Kindle-App „Teilen“ → Kurzbefehl „Lesestand“. Ein Amazon-Link mit ASIN identifiziert das Buch, danach frage ich nach dem Prozentwert. | 3 Taps |
| **D: Amazon-Datenexport** (optional, später) | ZIP aus Amazons Datenexport in der Web-App hochladen; die Kindle-Lesesitzungen werden pro ASIN ausgewertet (Spike S3 prüft Format und Inhalt) | selten, manuell |

### 9.3 Schnell-Update-Screen (PWA-Startseite)

```
┌───────────────────────────────┐
│ Schnell-Update                │
├───────────────────────────────┤
│ Shadow Slave        Novel     │
│      [−]  Kap. 1204  [+]      │
│ Project Hail Mary   E-Book    │
│      [────●─────] 43 %        │
│ Lord of Mysteries   Novel     │
│      [−]  Kap. 812   [+]      │
├───────────────────────────────┤
│ [Alle Titel →]                │
└───────────────────────────────┘
```

- Oben stehen die 8 zuletzt aktiven Werke der Typen `light_novel` und `ebook`.
- `[+]` speichert sofort (entprellt 500 ms, optimistische UI). Das Event hat `kind: manual`.

### 9.4 iOS-Kurzbefehl „Lesestand“

Ein vorbereiteter Kurzbefehl, der im Teilen-Menü erscheint. Er wird mit der Anleitung in `docs/setup-iphone.md` als Datei bzw. iCloud-Link bereitgestellt.

1. **Eingabe:** URL bzw. Text aus dem Teilen-Menü (WebNovel- oder Kindle-App).
2. `POST /api/v1/share` mit dem `phone`-Token (§6.1). Der Server erkennt Quelle (WebNovel-Book-ID bzw. ASIN) und Werk und antwortet mit Titel, aktuellem Stand und Vorschlag (*n+1* bzw. letzter Prozentwert).
3. **„Nach Zahl fragen“**, vorbelegt mit dem Vorschlag, z. B. „Shadow Slave – Kapitel?“ [1205].
4. `POST /api/v1/share/confirm` → Mitteilung „Shadow Slave → Kap. 1205 gespeichert“.
5. **Unbekannter Titel** (`needsMatch`): Die Zahl wird trotzdem gespeichert, als wartendes Event an einer Inbox-Karte. Die Mitteilung lautet „Neuer Titel – bitte im Tracker zuordnen“.

### 9.5 Spikes S2/S3 (vor `mobile-sync`, Timebox je ½ Tag)

- **S2:** Zeigt die WebNovel-Bibliothek auf der Website den in der App erreichten Kapitelstand? Welche Struktur hat sie (DOM oder JSON)? Was genau landet beim „Teilen“ aus der WebNovel-App auf dem iPhone im Kurzbefehl (Buch-Link, Kapitel-Link, Text)?
- **S3:** Zeigt `read.amazon.com` den Fortschritt pro Buch an? Liefert „Teilen“ aus der Kindle-App einen Link mit ASIN? Welche Dateien bzw. Felder enthält der Amazon-Datenexport zu Kindle-Lesesitzungen?
- Fällt ein Spike negativ aus, bleibt für diese Quelle Pfad B (Schnell-Update). Dokumentiert wird das in `docs/spikes/`.

### 9.6 Akzeptanzkriterien Handy

- [ ] Vom Homescreen-Icon bis zum gespeicherten Kapitel +1 sind es ≤ 2 Taps (iPhone, PWA).
- [ ] Nach dem Öffnen der WebNovel-Bibliothek in Brave sind alle dort gelisteten Bücher aktualisiert (sofern S2 positiv ist).
- [ ] Ein über den Kurzbefehl geteilter WebNovel-Link führt zum richtigen Werk mit vorgeschlagenem Kapitel *n+1*; das Speichern dauert ≤ 3 Taps.
- [ ] Ein widerrufenes `phone`-Token führt im Kurzbefehl zu einer verständlichen Fehlermeldung.

---

## 10. Startbestand

### 10.1 Excel-Import

`pnpm import:excel "<Pfad>" [--dry-run]` liest `Reading List.xlsx`:

| Excel | → | Tracker |
|---|---|---|
| Blatt `Manga` / `Manhwa` / `Manhua` | → | `type` = manga / manhwa / manhua (unbekanntes Blatt → Abbruch mit Fehlermeldung) |
| Spalte A `Name` | → | `title` (getrimmt; typografische Apostrophe und Gedankenstriche bleiben im Anzeigetitel erhalten und werden nur im normalisierten Titel vereinheitlicht) |
| Spalte B `Last Read Chapter` | → | `chapter`; leer → Stand unbekannt |
| Spalte C `Complete` (Groß-/Kleinschreibung egal) | → | `status = completed`, sonst `reading` |
| leere Zeilen | → | übersprungen |

- **Idempotent:** Abgeglichen wird über (`type`, `title_normalized`). Ein zweiter Lauf ändert nichts. Ist ein Kapitel inzwischen höher, gewinnt der höhere Wert.
- Importierte Werke haben keine Quelle. Die erste Sichtung auf einer Seite erzeugt eine Inbox-Karte, in der das importierte Werk der Top-Kandidat ist.
- **Erwartetes Ergebnis für die aktuelle Datei:** 136 Werke (2 Manga, 126 Manhwa, 8 Manhua), davon 73 mit Kapitel, 63 mit unbekanntem Stand, 2 abgeschlossen, 0 Duplikate.

### 10.2 Verlaufs-Backfill

Siehe §7.9. Der Backfill füllt einen Teil der 63 Lücken für alles, was in den letzten 90 Tagen in Brave gelesen wurde.

---

## 11. Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript 6.0 (strict), Node ≥ 22 LTS, pnpm-Workspaces | ein Typensystem für Web, API, Extension und Core. TypeScript 7 erst, wenn typescript-eslint es unterstützt (aktuell `<6.1`). |
| Web + API | Next.js (App Router), Tailwind CSS | Web-App und API in einem Deploy; läuft auf Vercel und in Docker |
| DB | PostgreSQL 16+, Drizzle ORM + drizzle-kit, `pg_trgm` | Standard-Postgres → `pg_dump`-portabel; typsichere Migrationen |
| Cloud (jetzt) | Neon (Postgres, Free Tier), Vercel Hobby | 0 €/Monat; Neon pausiert bei Inaktivität und wacht automatisch auf |
| Server (später) | `docker-compose.yml` (web + postgres), ab Tag 1 im Repo | Umzug = Dump einspielen + `DATABASE_URL` umstellen |
| Auth | Better Auth (E-Mail + Passwort; Registrierung nach dem ersten Account gesperrt) | keine selbstgebaute Auth |
| Validierung | zod (+ zod → JSON Schema für den Shield-Vertrag) | eine Quelle der Wahrheit für das Event-Schema |
| Extension | WXT, Manifest V3, Chromium (Brave) | MV3-Boilerplate, HMR, Playwright-tauglich |
| Shield | Kotlin, minSdk 30 (Android 11), Room, WorkManager, kotlinx.serialization, OkHttp | Android-TV-Standard; Shield läuft auf Android 11 |
| Excel | exceljs | nur für den Import-Script |
| Tests | Vitest, PGlite (Postgres in-process, inkl. `pg_trgm`), Playwright, JUnit | siehe §15 |

Konfiguration ausschließlich über Umgebungsvariablen: `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `TOKEN_ENCRYPTION_KEY`.

---

## 12. Commands

```bash
pnpm install                                   # Abhängigkeiten installieren
pnpm dev                                       # Web-App + API lokal auf http://localhost:3000
pnpm --filter @rwt/extension dev               # Extension im Dev-Modus (WXT)
pnpm --filter @rwt/extension build             # Build → apps/extension/.output/chrome-mv3 (in Brave entpackt laden)
pnpm test                                      # Unit- + Integrationstests (Vitest)
pnpm test --coverage                           # mit Coverage-Report (core: Schwelle 90 %)
pnpm test:e2e                                  # Playwright: Web-App + Extension gegen Fixture-Seiten
pnpm lint                                      # ESLint
pnpm typecheck                                 # tsc --noEmit in allen Paketen
pnpm db:generate                               # Migration aus Drizzle-Schema erzeugen
pnpm db:migrate                                # Migrationen gegen $DATABASE_URL ausführen
pnpm import:excel "C:\Users\hasse\Downloads\Reading List.xlsx" --dry-run
docker compose up -d                           # lokale Postgres + Web wie auf späterem Server

# Shield (in apps/shield; unter Windows gradlew.bat)
./gradlew test assembleDebug                   # JUnit (Logik, geteilte Folgen-Fixtures, Vertragstest gegen event.schema.json) + Debug-APK
./gradlew assembleRelease                      # APK bauen
adb connect <shield-ip>:5555
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell cmd notification allow_listener app.rwt.shield/app.rwt.shield.MediaWatcherService
```

---

## 13. Projektstruktur

```
read-watch-tracker/
├─ SPEC.md
├─ apps/
│  ├─ web/                   Next.js: Core-Screen, Inbox, Schnell-Update (PWA), /api/v1/*
│  │  ├─ src/app/            Routen und Seiten
│  │  ├─ src/server/         Ingest-Pipeline, Matching, Kopplung (möglichst framework-frei)
│  │  └─ test/               Integrationstests (PGlite)
│  ├─ extension/             WXT/MV3 für Brave
│  │  ├─ src/entrypoints/    background, content, popup, options
│  │  ├─ src/reading/        generische Kapitel-Erkennung, Regel-Engine, Kapitelende
│  │  ├─ src/adapters/       Code-Adapter für Streaming- und Bibliotheksseiten
│  │  └─ test/fixtures/      gespeicherte HTML-Seiten (Manga-Korpus + Dienste)
│  └─ shield/                Android-TV-App (Kotlin/Gradle)
│     └─ app/src/test/resources/fixtures/   MediaSession-Samples aus Spike S1
├─ packages/
│  ├─ core/                  Event-Schema, Typen, normalize, URL-Erkennung + SiteRule, progress, nextUrl
│  └─ db/                    Drizzle-Schema + Migrationen
├─ scripts/import-excel.ts
├─ tests/e2e/                Playwright: web/, extension/, fixture-sites/
├─ docs/                     setup-shield.md, setup-extension.md, setup-iphone.md (+ Kurzbefehl), server-umzug.md, spikes/, testing/
├─ docker-compose.yml
└─ Dockerfile
```

---

## 14. Code-Style

```ts
// packages/core/src/progress.ts
import type { Position } from "./event";

/** Liefert true, wenn `incoming` den gespeicherten Stand nach vorn bewegt. */
export function shouldAdvance(current: Position | null, incoming: Position): boolean {
  if (current === null) return true; // Stand unbekannt → jede Information ist besser
  return comparePositions(incoming, current) > 0; // nur vorwärts; Rereads setzen nicht zurück
}

export function comparePositions(a: Position, b: Position): number {
  if (a.unit === "chapter" && b.unit === "chapter") return a.chapter - b.chapter;
  if (a.unit === "percent" && b.unit === "percent") return a.percent - b.percent;
  if (a.unit === "episode" && b.unit === "episode") {
    // A side without a season (e.g. the Shield) is assumed to be in the other side's season.
    const seasonDelta = a.season !== null && b.season !== null ? a.season - b.season : 0;
    return seasonDelta || a.episode - b.episode;
  }
  if (a.unit === "none" && b.unit === "none") return 0;
  throw new PositionUnitMismatchError(a.unit, b.unit);
}
```

- **TypeScript strict**, kein `any`, kein `as` – Unions werden über Typprüfungen verengt wie oben.
- **Reine Funktionen in `core`**, keine I/O. Seiteneffekte stehen nur in `apps/*/server` bzw. den Entrypoints.
- **zod an jeder Systemgrenze** (API-Eingang, Storage-Lesen in der Extension, Excel-Zeilen).
- Benennung: Dateien `kebab-case.ts`, Typen `PascalCase`, Funktionen `camelCase`, DB `snake_case`. Nur Named Exports.
- **UI-Texte auf Deutsch, Code und Bezeichner auf Englisch.** Kommentare erklären das *Warum*.
- Kotlin: offizielle Kotlin-Coding-Conventions, ktlint. Mappings sind reine Funktionen ohne Android-Abhängigkeit, damit sie per JUnit testbar sind.

---

## 15. Teststrategie

### 15.1 Testebenen

| Was | Ebene | Werkzeug | Ort |
|---|---|---|---|
| Normalisierung (inkl. Hash-Suffix im Slug), Kapitel-/Folgen-Parser, `shouldAdvance`, `nextUrl`-Templates | Unit, tabellengetrieben, **TDD** | Vitest | `packages/core/test/` |
| Generische Kapitel-Erkennung | **Korpus-Tests:** gespeicherte echte Kapitelseiten verschiedener Manga-Seiten und Layouts (Long-Strip, seitenweise), jeweils mit erwarteter Detection. Jede neue oder umgezogene Seite, die ich nutze, kommt als Fixture dazu. | Vitest + happy-dom | `apps/extension/test/reading/` |
| Seitenregeln | Unit: Regel-Felder überschreiben genau ihren Schritt; ungültige Regex wird abgelehnt; Live-Test im Editor liefert dieselbe Detection wie die Extension (gleicher Code aus `core`) | Vitest | `packages/core/test/`, `apps/extension/test/` |
| Kapitelende (§7.4) | Unit/DOM: Scrolltiefe, `endSelector` im Viewport, Wechsel zu Kapitel *n+1*; kurzes und langes Kapitel | Vitest + happy-dom | `apps/extension/test/reading/` |
| Streaming-, Bibliotheks- und Verlaufs-Adapter | Fixture-Tests (gespeichertes HTML/JSON aus den Spikes) | Vitest | `apps/extension/test/adapters/` |
| Ingest-Pipeline: Token, Idempotenz, Zuordnung inkl. Wiedererkennung (§5.3 Schritt 4), Pending → Replay, Ignorieren, Fortschrittsregeln | Integration gegen echtes Postgres | Vitest + PGlite | `apps/web/test/integration/` |
| Domain-Umzug: alte und neue Domain → dieselbe Quelle, Links bleiben, „Weiterlesen“ nutzt die neue Domain | Integration | Vitest + PGlite | `apps/web/test/integration/` |
| Share-API für den Kurzbefehl (`/share`, `/share/confirm`, unbekannter Titel, widerrufenes Token) | Integration | Vitest + PGlite | `apps/web/test/integration/` |
| Geräte-Kopplung inkl. Ablauf und Einmal-Abholung | Integration | Vitest + PGlite | `apps/web/test/integration/` |
| Excel-Import | Integration mit synthetischer Fixture-Datei (inkl. `’`, leerer Kapitel, „Complete“) + Dry-Run gegen die echte Liste | Vitest | `scripts/test/` |
| Core-Screen, Inbox, Schnell-Update, Weiterlesen | E2E | Playwright | `tests/e2e/web/` |
| Extension Ende-zu-Ende | E2E: Playwright startet Chromium mit entpackter Extension gegen lokale **Fixture-Manga-Seiten** (Long-Strip, seitenweise, unbekanntes Layout) | Playwright | `tests/e2e/extension/` |
| Shield-Mapping und Gesehen-Regel | Unit mit echten MediaSession-Samples aus Spike S1 | JUnit | `apps/shield/app/src/test/` |
| Event-Vertrag Shield ↔ API | Vertragstest: Kotlin-Payloads gegen `event.schema.json` | JUnit + JSON-Schema-Validator | `apps/shield/app/src/test/` |
| Shield auf echtem Gerät | manuelle Abnahme-Checkliste | – | `docs/testing/shield-checkliste.md` |
| iOS-Kurzbefehl auf echtem iPhone | manuelle Abnahme-Checkliste (WebNovel- und Kindle-Teilen, unbekannter Titel, Offline-Fehler) | – | `docs/testing/iphone-checkliste.md` |
| Portabilität | Dump aus Neon → `docker compose` lokal → Smoke-Test | Skript + manuell, einmal vor Go-live | `docs/server-umzug.md` |

### 15.2 Regeln

- **Coverage:** `packages/core` ≥ 90 % Lines und Branches (CI-Gate). Für den Rest gibt es keine Prozentvorgabe; stattdessen gilt jede Regel aus §5.3 als durch mindestens einen Integrationstest abgedeckt.
- **TDD für `core` und die Ingest-Pipeline:** zuerst der fehlschlagende Test, dann der Code.
- **Seite geändert (Redesign, Domain-Wechsel):** Zuerst wird geprüft, ob eine Seitenregel bzw. ein Domain-Umzug reicht, ohne Code-Änderung. Muss die generische Erkennung angepasst werden, gilt: neues HTML als Fixture speichern → fehlschlagender Test → Fix. Alte Fixtures bleiben erhalten, damit andere Seiten nicht brechen.
- **Jeder Bugfix bekommt einen Regressionstest.**
- Keine echten Drittseiten in automatisierten Tests. E2E läuft ausschließlich gegen lokale Fixture-Seiten.
- Vor jedem Commit: `pnpm typecheck && pnpm lint && pnpm test`.

---

## 16. Grenzen

**Immer:**
- `pnpm typecheck && pnpm lint && pnpm test` vor jedem Commit
- Jedes eingehende Event mit zod validieren; Fehler pro Event melden statt den ganzen Batch zu verwerfen
- Änderungen an der generischen Erkennung und neue Code-Adapter nur mit Fixture-Tests
- Seitenspezifisches Verhalten für Manga-Seiten als **Seitenregel (Daten)** lösen, nicht als Code
- Code anbieterneutral halten: Standard-Postgres, Konfiguration über Umgebungsvariablen, keine Neon- oder Vercel-spezifischen APIs
- UI-Texte auf Deutsch

**Erst fragen:**
- Neue Abhängigkeiten
- Schemaänderungen, die über diese Spec hinausgehen
- Neue Streamingdienste oder neue Code-Adapter. Neue Manga-Seiten schalte ich selbst über das Popup frei, dafür braucht es keine Rückfrage.
- Neue Berechtigungen im Extension-Manifest
- Änderungen an Standardschwellen (60 % Scrolltiefe, 85 % Laufzeit) oder neue „Ende erreicht“-Signale
- Jede Nutzung inoffizieller APIs von Drittanbietern

**Nie:**
- Secrets, Tokens oder `.env` committen
- Geräte-Tokens im Klartext speichern
- Daten von nicht freigeschalteten Seiten erfassen oder senden
- Werke aufgrund von Ähnlichkeit automatisch zusammenführen
- Zugangsdaten zu Amazon, Crunchyroll, WebNovel o. Ä. speichern oder sich serverseitig dort einloggen
- DRM, Paywalls oder Bot-Schutz umgehen; Kapitelinhalte herunterladen
- Events löschen (das Protokoll ist append-only)

---

## 17. Erfolgskriterien

1. **Import:** `pnpm import:excel` legt genau 136 Werke an (2 Manga, 126 Manhwa, 8 Manhua): 73 mit Kapitel, 63 mit unbekanntem Stand, 2 abgeschlossen. Ein zweiter Lauf ändert nichts.
2. **Manga automatisch:** Ein Kapitel auf einer freigeschalteten Seite steht ≤ 10 s nach Erreichen des Kapitelendes im Core-Screen, unabhängig von der Länge des Kapitels.
3. **Einmal bestätigen:** Die erste Sichtung einer Serie auf einer neuen Seite erzeugt genau eine Inbox-Karte. Nach der Bestätigung werden weitere Kapitel ohne Rückfrage übernommen.
4. **Kein Rückschritt:** Das erneute Lesen eines älteren Kapitels ändert den Stand nicht.
5. **Offline-fest:** Offline erfasste Events kommen vollständig und ohne Duplikate an.
6. **Weiterlesen:** Bei Seiten mit erkennbarem URL-Muster öffnet der Button Kapitel *n+1*, sonst das zuletzt gelesene Kapitel.
7. **Streaming Desktop:** Eine zu ≥ 85 % gesehene Folge auf Prime Video, Crunchyroll, Netflix oder Disney+ im Browser steht ≤ 10 s später im Tracker.
8. **Shield:** Eine Folge in einem gemappten Dienst steht ≤ 2 min später im Tracker, auf demselben Werk wie am Desktop. Für nicht mappbare Dienste ist der Verlaufs-Sync dokumentiert und funktioniert.
9. **iPhone:** Kapitel +1 braucht ≤ 2 Taps ab dem Homescreen-Icon der PWA, der Kurzbefehl aus dem Teilen-Menü ≤ 3 Taps. Der WebNovel- und Kindle-Bibliotheks-Sync funktioniert, sofern die Spikes positiv ausfallen; andernfalls ist das Schnell-Update der dokumentierte Pfad.
10. **Performance:** Der Core-Screen lädt mit 500 Werken in < 1,5 s und ist bei 375 px Breite ohne horizontales Scrollen bedienbar.
11. **Portabilität:** Ein Dump aus der Cloud-DB läuft lokal per `docker compose up` unverändert mit denselben Daten.
12. **Kosten:** 0 € pro Monat.
13. **Datenschutz:** Ein E2E-Test belegt, dass von nicht freigeschalteten Seiten keine Requests ausgehen.
14. **Wechselnde Seiten:** Nach einem Domain-Umzug oder einer Änderung des URL-Schemas einer Manga-Seite funktioniert das Tracking über einen Domain-Umzug im Popup bzw. eine angepasste Seitenregel in der Web-App weiter. Es braucht keinen neuen Extension-Build und keine erneute Bestätigung bereits zugeordneter Serien.

---

## 18. Nicht-Ziele (explizit)

- **Statistiken und Dashboards** (Lesezeit, Kapitel pro Monat, Jahresrückblick). Frühestens M4.
- **Mehrbenutzerbetrieb**, Teilen, Social-Funktionen, öffentliche Profile.
- **Sync mit AniList, MyAnimeList, Trakt, Goodreads** o. Ä.
- **Firefox, Safari und andere Nicht-Chromium-Browser.** Unterstützt wird nur Brave bzw. Chromium.
- **Native Handy-App** für iOS oder Android. Auf dem iPhone gibt es nur die Web-App/PWA und den Kurzbefehl.
- **Fest einprogrammierte Adapter pro Manga-Seite.** Seiten wechseln zu häufig; seitenspezifisches Verhalten läuft ausschließlich über Seitenregeln (Daten).
- **Feste Lesezeit** als Kriterium für „Kapitel gelesen“.
- **Vollautomatisches Tracking von Kindle und WebNovel.** Halbautomatisch ist ausdrücklich ausreichend.
- **Import bestehender Serien- und Anime-Historie.** Kommt später als eigene Erweiterung.
- **Hinweise auf neue Kapitel** und die Prüfung, ob das nächste Kapitel existiert. Nicht im MVP, frühestens M4.
- **Inhalte lesen, hosten oder herunterladen.** Der Tracker speichert nur Metadaten und Fortschritt.
- **Empfehlungen** und Entdecken neuer Titel.
- **YouTube, Musik, Podcasts** und andere Medien außerhalb der genannten Typen.
- **Eigenen Server jetzt betreiben.** Der Umzug ist vorbereitet, aber nicht Teil der ersten Stufen.
- **Serverseitiges Einloggen bei Drittanbietern** oder inoffizielle Anbieter-APIs mit gespeicherten Zugangsdaten.
- **Automatisches Zusammenführen** per Ähnlichkeit, ohne meine Bestätigung.

---

## 19. Offene Fragen

### Geklärt (v0.2)

| Frage | Antwort | Auswirkung |
|---|---|---|
| Handy-Betriebssystem | iPhone | Share-Target ersetzt durch iOS-Kurzbefehl + Share-API (§6.1, §9.4) |
| Häufigste Manga-Seiten | wechseln häufig | Keine Seiten-Adapter im Code; generische Erkennung + Seitenregeln + Domain-Umzug (§2.7, §7.2, §7.3) |
| Weitere Streamingdienste | Netflix, Disney+ | Desktop-Adapter und Shield-Allowlist für 4 Dienste (§7.5, §8.3) |
| Kindle-Granularität | Prozent reicht | unverändert |
| Stack | passt | unverändert (§11) |
| Schwellen | 60 % Scrollen passt; feste Zeit ungeeignet, weil Kapitel unterschiedlich lang sind | Zeitregel gestrichen, stattdessen Signale für „Kapitelende erreicht“ (§7.4) |
| Wiedererkennung bei geändertem Schlüssel | ohne Rückfrage | §5.3 Schritt 4 wie beschrieben |

### Noch offen

1. **Spikes S1–S3:** Die Ergebnisse können §7.6, §8 und §9 noch verändern; die Spec wird danach aktualisiert. Insbesondere offen: ob Disney+ eine auslesbare Verlaufsseite hat und was WebNovel bzw. Kindle beim Teilen auf dem iPhone übergeben.
