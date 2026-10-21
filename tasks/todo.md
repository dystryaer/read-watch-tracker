# Aufgaben

Format: **Akz.** = Akzeptanzkriterien · **Prüfung** = Verifikation · Größe XS/S/M/L · Abh. = Abhängigkeiten

Standard-Prüfung jeder Aufgabe (nicht wiederholt): `pnpm typecheck && pnpm lint && pnpm test` grün, Commit.

---

## M1 – Manga-Tracking + Excel-Import (`feat/m1-manga-tracking`)

### Phase A – core

- [x] **T01 Workspace + `normalizeTitle`** · S
  Akz.: SPEC §5.3 Normalisierung; Randfälle (Apostrophe, Striche, Tausender, Tags, Unicode, CJK) · Prüfung: 59 Tests, Coverage 100 %

- [x] **T02 Event-Vertrag (zod) + JSON Schema** · S · Abh. T01
  Akz.: `MediaType`, `Position`, `ProgressEvent`, `EventBatch` (1–100), `EventResult`; URLs nur http/https, ≤ 2048 Zeichen; Längenlimits für Titel/Schlüssel; `event.schema.json` generiert, Test prüft Aktualität · Dateien: `packages/core/src/event.ts`, `scripts/`, Test

- [x] **T03 Fortschrittsregeln** · S · Abh. T02
  Akz.: `comparePositions`, `shouldAdvance` (unbekannt → übernehmen; nur vorwärts; fehlende Staffel = aktuelle), `positionUnitFor(mediaType)`; Einheiten-Mismatch wirft · Dateien: `progress.ts` + Test

- [x] **T04 Serienschlüssel + URL-Erkennung + Seitenregeln** · M · Abh. T01
  Akz.: `normalizeSeriesKey` (Hash-Suffix weg); `SiteRule`-Schema (Pattern ≤ 200, Regex muss kompilieren); `detectChapterFromUrl(url, title, rule?)` generisch + mit Regel; Titelbereinigung („Chapter N“, Seitenname); URL > 2048 → keine Erkennung · Dateien: `series-key.ts`, `site-rule.ts`, `detect-url.ts` + Tests

- [x] **T05 „Weiterlesen“-URL + `safeHref`** · S · Abh. T04
  Akz.: Template → generisch (Kapitelnummer genau einmal im letzten Segment) → `last_url`; aktuelle Domain bei Umzug; `safeHref` lässt nur http/https durch · Dateien: `next-url.ts`, `safe-url.ts` + Tests

### Phase B – DB + Server

- [x] **T06 `packages/db`: Schema, Migrationen, Factory** · M · Abh. T02
  Akz.: alle Tabellen aus SPEC §5.1 inkl. `source_domains`, Seitenregel-Spalten, `pairing_codes` (ohne Chiffretext, A4); `pg_trgm` + GIN-Index; Check-Constraint Positionsspalten ↔ Typ; `createDb(url)` für `pglite:`/`postgres:`; `createTestDb()` · Prüfung: Migrationstest auf PGlite, Constraint-Test

- [x] **T07 Ingest-Pipeline** · M · Abh. T03, T06
  Akz.: SPEC §5.3 Schritte 1–7 (Idempotenz, Quelle über Key/Domain, Link, Wiedererkennung, ignoriert, Pending mit Trigram-Kandidaten, Fortschritt); Ergebnis pro Event · Dateien: `apps/web/src/server/ingest.ts` + Integrationstests (PGlite)

- [x] **T08 Zuordnungen auflösen + Replay** · S · Abh. T07
  Akz.: `linked` / `new_work` / `ignored`; wartende Events in Zeitreihenfolge anwenden; Sammelbestätigung ≥ 0.9 · Prüfung: Integrationstests

- [x] **T09 Geräte, Kopplung, Tokens** · S · Abh. T06
  Akz.: Pairing start/approve/poll (Token genau einmal, Ablauf 10 min, Hash-only); `authenticateDevice` (widerrufen → null); `revokeDevice` · Prüfung: Integrationstests

- [x] **T10 Next.js-Gerüst** · M · Abh. T06
  Akz.: `apps/web` mit App Router + Tailwind; DB-Singleton aus `DATABASE_URL`; `pnpm db:migrate`; Security-Header (CSP, nosniff, frame-ancestors, Referrer-Policy); `pnpm --filter @rwt/web build` grün

- [x] **T11 Auth (Better Auth, Single-User)** · M · Abh. T10
  Akz.: Ersteinrichtung nur, solange kein Nutzer existiert; Login/Logout; alle Seiten und Server Actions geschützt · Prüfung: Integrationstest „zweite Registrierung abgelehnt“, E2E in T26

- [ ] **T12 API v1** · M · Abh. T07, T09, T10
  Akz.: `POST /events` (401/413/422-pro-Event/429), `GET /config` (ETag/304), `POST /pairing`, `POST /pairing/poll`, `POST /sources/enable` (neu, für Popup: neue Quelle oder Umzug); Body-Größenlimit · Prüfung: Route-Handler-Tests mit echten `Request`-Objekten

### Phase C – Web-UI

- [ ] **T13 Core-Screen: Liste** · M · Abh. T05, T11
  Akz.: SPEC §4.1–4.2: Tabs, Status-Filter (Standard „Lese“), Sortierung, Suche (normalisiert), `Kap. ?`-Hervorhebung + Filter „Stand unbekannt“, Quelle als Buchstaben-Badge, „Weiterlesen“ (§4.4) über `safeHref`; mobil Karten · Prüfung: Unit-Tests der View-Model-Funktionen

- [ ] **T14 Stepper + Status** · S · Abh. T13
  Akz.: −/+ entprellt 500 ms als `manual`-Event; Status setzen; Validierung serverseitig · Prüfung: Integrationstest der Actions

- [ ] **T15 Detailansicht + Zusammenführen** · M · Abh. T14
  Akz.: umbenennen, Typ, Stand (auch rückwärts), Links lösen, letzte 50 Events, Merge (Links + Events übertragen, höherer Stand gewinnt) · Prüfung: Integrationstests

- [ ] **T16 Zuordnungs-Inbox** · M · Abh. T08, T13
  Akz.: SPEC §4.5: Karten, Kandidat vorausgewählt, neues Werk mit Typ, Ignorieren, Sammelbestätigung ≥ 0.9 mit Vorschau; Banner auf dem Core-Screen

- [ ] **T17 Einstellungen: Geräte** · S · Abh. T09, T11
  Akz.: Code eingeben + Gerätenamen bestätigen, Liste mit „zuletzt gesehen“, Widerruf

- [ ] **T18 Einstellungen: Seiten, Regeln, Umzug** · M · Abh. T04, T11
  Akz.: Quellen-Liste, Tracking an/aus, Regel-Editor mit Live-Test (gleicher core-Code), Regex-Prüfung beim Speichern, Domain hinzufügen/umziehen

- [ ] **T19 Excel-Import** · S · Abh. T07
  Akz.: SPEC §10.1; idempotent; `--dry-run`-Bericht; ungültige Zeilen werden gemeldet, nicht importiert · Prüfung: Test mit synthetischer xlsx; Dry-Run gegen deine Liste ergibt 136/73/63/2

### Phase D – Extension

- [ ] **T20 WXT-Gerüst + Nachrichtenverträge** · S · Abh. T02
  Akz.: MV3-Manifest (optional host permissions, storage, alarms, scripting, optional history); typisierte, zod-validierte Messages; Build grün

- [ ] **T21 Storage + Outbox** · M · Abh. T20
  Akz.: alles aus `chrome.storage` wird validiert (beschädigt → verwerfen + Warnung); Outbox mit UUID, Flush, Backoff bis 30 min, 401 → entkoppelt, Limit 5 000 · Prüfung: Unit-Tests mit Fake-Storage/-Fetch

- [ ] **T22 Kopplung + Config-Sync in der Extension** · S · Abh. T21, T12
  Akz.: Optionsseite: Code anzeigen, pollen, Token speichern; `/config` mit ETag beim Start, alle 15 min und auf Anforderung; Antwort validiert

- [ ] **T23 Lese-Engine (DOM) + Kapitelende** · M · Abh. T04, T21
  Akz.: SPEC §7.3–7.4: Titel-Selektor/Fallbacks, drei Ende-Signale, 12-h-Dedupe, URL-Wechsel ohne Reload · Prüfung: happy-dom-Tests mit synthetischem Reader-Korpus (Long-Strip, seitenweise, Next-Link)

- [ ] **T24 Popup + Seite freischalten + Umzug** · M · Abh. T22, T23
  Akz.: Status des Tabs (nur `textContent`), „Diese Seite tracken“ → Permission → Content-Script registrieren → `/sources/enable`; Umzug wählbar; „Serie ignorieren“

- [ ] **T25 Verlaufs-Backfill** · S · Abh. T23, T24
  Akz.: `history` nur auf Klick; 90 Tage; nur freigeschaltete (auch alte) Domains; max. Kapitel pro Serie als `backfill`

- [ ] **T26 E2E: Web** · M · Abh. T13–T18
  Akz.: Ersteinrichtung, Login, Kopplung, Ingest per API → Inbox → bestätigen → Liste; Weiterlesen-Link; Stepper; **XSS-Payload-Titel als Text dargestellt**; 375 px ohne horizontales Scrollen

- [ ] **T27 E2E: Extension + Doku** · M · Abh. T24, T25
  Akz.: Fixture-Manga-Seite + Fake-API: Event erst am Kapitelende; nicht freigeschaltete Seite → 0 Requests; Offline-Queue ohne Duplikate; `docs/setup-extension.md`, `docs/deploy.md`, `docs/server-umzug.md`, `docker-compose.yml`, `Dockerfile`

### Abnahme M1
- [ ] volle Testsuite · [ ] Code-Review (5 Achsen) · [ ] Security-Review (XSS, untrusted data) · [ ] Befunde behoben

---

## M2 – Serien & Anime (`feat/m2-streaming`)

- [ ] **T28 core: Folgen-Parser + Streaming-Schlüssel** · S
  Akz.: „S2 E5“, „Staffel 2 Folge 5“, „Season 2 Episode 5“, „E5“, „Folge 5“; Streaming-`externalKey` = normalisierter Serientitel ohne Dub/Sub

- [ ] **T29 Extension: Desktop-Streaming** · M · Abh. T28
  Akz.: Media-Session + `<video>`; `watched` bei ≥ 85 % oder `ended`, einmal pro Folge; Parser für Prime, Crunchyroll, Netflix, Disney+ (unverifiziert, A10)

- [ ] **T30 Extension: Verlaufsseiten-Sync** · M · Abh. T29
  Akz.: Crunchyroll, Prime, Netflix als `library_sync`-Batch; tolerant gegenüber DOM-Änderungen (unverifiziert, A10); Server verarbeitet `library_sync`

- [ ] **T31 Android-SDK + Gradle-Gerüst** · M
  Akz.: SDK in `%LOCALAPPDATA%\Android\Sdk`, Lizenzen akzeptiert (Freigabe liegt vor); Gradle-Wrapper; Module `logic` (JVM) + `app` (Android); `gradlew test assembleDebug` grün

- [ ] **T32 Shield-Logik (JVM)** · M · Abh. T31, T28
  Akz.: Paket-Mappings für 4 Dienste, Gesehen-Regel (85 %, Metadatenwechsel, einmal pro Folge), Payload + **Vertragstest gegen `event.schema.json`**, Datei-Outbox-Logik, validiertes Laden

- [ ] **T33 Shield-App (Android)** · M · Abh. T32
  Akz.: `MediaWatcherService`, Kopplungs- und Statusscreen, Flush per WorkManager, Debug-Logger für Spike S1, „Nicht erkannt“-Liste; Build grün

- [ ] **T34 Shield-Doku + Spike-S1-Anleitung** · S
  Akz.: `docs/setup-shield.md`, `docs/spikes/s1-shield-metadata.md`, `docs/testing/shield-checkliste.md`

- [ ] **T35 Web: Streaming-Darstellung** · S
  Akz.: `S1 · F14`, Öffnen-Link zur Serienseite, Film = gesehen

### Abnahme M2
- [ ] volle Testsuite inkl. Gradle · [ ] Code-Review · [ ] Security-Review · [ ] Befunde behoben

---

## M3 – Light Novels & E-Books (`feat/m3-mobile`)

- [ ] **T36 core: WebNovel- und Amazon-Parser** · S
  Akz.: Book-ID aus WebNovel-URLs, ASIN aus Amazon-/Kindle-Links; ungültige Eingaben → null

- [ ] **T37 Share-API + iPhone-Token** · M · Abh. T36
  Akz.: `POST /share`, `/share/confirm` (Server erzeugt UUID); unbekannter Titel → Pending; Einstellungen: „iPhone-Kurzbefehl hinzufügen“ zeigt Token einmalig

- [ ] **T38 Schnell-Update-PWA** · M
  Akz.: Manifest, Icons, iOS-Meta; 8 zuletzt aktive LN/E-Books; Stepper/Prozent; ≤ 2 Taps

- [ ] **T39 Extension: WebNovel- und Kindle-Bibliothek** · M · Abh. T36
  Akz.: `library_sync` aus Bibliotheksseiten (unverifiziert, A10)

- [ ] **T40 WebNovel-Erinnerung** · XS
  Akz.: Hinweis auf dem Core-Screen, wenn der letzte WebNovel-Sync älter als 7 Tage ist

- [ ] **T41 Doku iPhone + Spikes S2/S3** · S
  Akz.: `docs/setup-iphone.md` (Kurzbefehl Schritt für Schritt), `docs/spikes/s2-webnovel.md`, `s3-kindle.md`, `docs/testing/iphone-checkliste.md`

### Abnahme M3
- [ ] volle Testsuite · [ ] Code-Review · [ ] Security-Review · [ ] Befunde behoben

---

## M4 – optional (`feat/m4-extras`)

- [ ] **T42 Statistiken** · S
  Akz.: Kapitel/Folgen pro Woche und Monat aus `events`; ohne Chart-Bibliothek

- [ ] **T43 Neue Kapitel erkennen** · M
  Akz.: Extension prüft Serienseiten freigeschalteter Domains höchstens 1× pro Tag, nur bei laufendem Browser; kein Umgehen von Bot-Schutz; `latest_chapter` am Werk

- [ ] **T44 Hinweis „neue Kapitel“** · S · Abh. T43
  Akz.: Badge „3 neu“ in der Liste, Filter „Neue Kapitel“

### Abnahme M4
- [ ] volle Testsuite · [ ] Code-Review · [ ] Security-Review · [ ] Befunde behoben
