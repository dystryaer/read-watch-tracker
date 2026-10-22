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

- [x] **T12 API v1** · M · Abh. T07, T09, T10
  Akz.: `POST /events` (401/413/422-pro-Event/429), `GET /config` (ETag/304), `POST /pairing`, `POST /pairing/poll`, `POST /sources/enable` (neu, für Popup: neue Quelle oder Umzug); Body-Größenlimit · Prüfung: Route-Handler-Tests mit echten `Request`-Objekten

### Phase C – Web-UI

- [x] **T13 Core-Screen: Liste** · M · Abh. T05, T11
  Akz.: SPEC §4.1–4.2: Tabs, Status-Filter (Standard „Lese“), Sortierung, Suche (normalisiert), `Kap. ?`-Hervorhebung + Filter „Stand unbekannt“, Quelle als Buchstaben-Badge, „Weiterlesen“ (§4.4) über `safeHref`; mobil Karten · Prüfung: Unit-Tests der View-Model-Funktionen

- [x] **T14 Stepper + Status** · S · Abh. T13
  Akz.: −/+ entprellt 500 ms als `manual`-Event; Status setzen; Validierung serverseitig · Prüfung: Integrationstest der Actions

- [x] **T15 Detailansicht + Zusammenführen** · M · Abh. T14
  Akz.: umbenennen, Typ, Stand (auch rückwärts), Links lösen, letzte 50 Events, Merge (Links + Events übertragen, höherer Stand gewinnt) · Prüfung: Integrationstests

- [x] **T16 Zuordnungs-Inbox** · M · Abh. T08, T13
  Akz.: SPEC §4.5: Karten, Kandidat vorausgewählt, neues Werk mit Typ, Ignorieren, Sammelbestätigung ≥ 0.9 mit Vorschau; Banner auf dem Core-Screen

- [x] **T17 Einstellungen: Geräte** · S · Abh. T09, T11
  Akz.: Code eingeben + Gerätenamen bestätigen, Liste mit „zuletzt gesehen“, Widerruf

- [x] **T18 Einstellungen: Seiten, Regeln, Umzug** · M · Abh. T04, T11
  Akz.: Quellen-Liste, Tracking an/aus, Regel-Editor mit Live-Test (gleicher core-Code), Regex-Prüfung beim Speichern, Domain hinzufügen/umziehen

- [x] **T19 Excel-Import** · S · Abh. T07
  Akz.: SPEC §10.1; idempotent; `--dry-run`-Bericht; ungültige Zeilen werden gemeldet, nicht importiert · Prüfung: Test mit synthetischer xlsx; Dry-Run gegen deine Liste ergibt 136/73/63/2

### Phase D – Extension

- [x] **T20 WXT-Gerüst + Nachrichtenverträge** · S · Abh. T02
  Akz.: MV3-Manifest (optional host permissions, storage, alarms, scripting, optional history); typisierte, zod-validierte Messages; Build grün

- [x] **T21 Storage + Outbox** · M · Abh. T20
  Akz.: alles aus `chrome.storage` wird validiert (beschädigt → verwerfen + Warnung); Outbox mit UUID, Flush, Backoff bis 30 min, 401 → entkoppelt, Limit 5 000 · Prüfung: Unit-Tests mit Fake-Storage/-Fetch

- [x] **T22 Kopplung + Config-Sync in der Extension** · S · Abh. T21, T12
  Akz.: Optionsseite: Code anzeigen, pollen, Token speichern; `/config` mit ETag beim Start, alle 15 min und auf Anforderung; Antwort validiert

- [x] **T23 Lese-Engine (DOM) + Kapitelende** · M · Abh. T04, T21
  Akz.: SPEC §7.3–7.4: Titel-Selektor/Fallbacks, drei Ende-Signale, 12-h-Dedupe, URL-Wechsel ohne Reload · Prüfung: happy-dom-Tests mit synthetischem Reader-Korpus (Long-Strip, seitenweise, Next-Link)

- [x] **T24 Popup + Seite freischalten + Umzug** · M · Abh. T22, T23
  Akz.: Status des Tabs (nur `textContent`), „Diese Seite tracken“ → Permission → Content-Script registrieren → `/sources/enable`; Umzug wählbar; „Serie ignorieren“

- [x] **T25 Verlaufs-Backfill** · S · Abh. T23, T24
  Akz.: `history` nur auf Klick; 90 Tage; nur freigeschaltete (auch alte) Domains; max. Kapitel pro Serie als `backfill`

- [x] **T26 E2E: Web** · M · Abh. T13–T18
  Akz.: Ersteinrichtung, Login, Kopplung, Ingest per API → Inbox → bestätigen → Liste; Weiterlesen-Link; Stepper; **XSS-Payload-Titel als Text dargestellt**; 375 px ohne horizontales Scrollen

- [x] **T27 E2E: Extension + Doku** · M · Abh. T24, T25
  Akz.: Fixture-Manga-Seite + Fake-API: Event erst am Kapitelende; nicht freigeschaltete Seite → 0 Requests; Offline-Queue ohne Duplikate; `docs/setup-extension.md`, `docs/deploy.md`, `docs/server-umzug.md`, `docker-compose.yml`, `Dockerfile`

### Abnahme M1
- [x] volle Testsuite · [x] Code-Review (5 Achsen) · [x] Security-Review (XSS, untrusted data) · [x] Befunde behoben
  Stand 2026-10-21: typecheck + lint sauber, 794 Unit/Integration-Tests, 19 E2E, Coverage 92,6 %.
  Offen zur Entscheidung: Domain-Umzüge, die ein Gerät meldet, gelten laut §7.2 sofort („ohne erneute Bestätigung“); der Security-Review empfiehlt eine Bestätigung in der Web-App. Bewusst nicht geändert, solange nicht entschieden. Hingenommen (Info): Live-Test der Regel ohne Worker-Timeout (durch Form-Prüfung + 512-Zeichen-Grenze entschärft), Rate-Limits pro Instanz im Speicher, 2 moderate Advisories nur in Dev-Werkzeugen, Docker-Images ohne Digest.

---

## M2 – Serien & Anime (`feat/m2-streaming`)

- [x] **T28 core: Folgen-Parser + Streaming-Schlüssel** · S
  Akz.: „S2 E5“, „Staffel 2 Folge 5“, „Season 2 Episode 5“, „E5“, „Folge 5“; Streaming-`externalKey` = normalisierter Serientitel ohne Dub/Sub

- [x] **T29 Extension: Desktop-Streaming** · M · Abh. T28
  Akz.: Media-Session + `<video>`; `watched` bei ≥ 85 % oder `ended`, einmal pro Folge; Parser für Prime, Crunchyroll, Netflix, Disney+ (unverifiziert, A10)

- [x] **T30 Extension: Verlaufsseiten-Sync** · M · Abh. T29
  Akz.: Crunchyroll, Prime, Netflix als `library_sync`-Batch; tolerant gegenüber DOM-Änderungen (unverifiziert, A10); Server verarbeitet `library_sync`

- [x] **T31 Android-SDK + Gradle-Gerüst** · M
  Akz.: SDK in `%LOCALAPPDATA%\Android\Sdk`, Lizenzen akzeptiert (Freigabe liegt vor); Gradle-Wrapper; Module `logic` (JVM) + `app` (Android); `gradlew test assembleDebug` grün

- [x] **T32 Shield-Logik (JVM)** · M · Abh. T31, T28
  Akz.: Paket-Mappings für 4 Dienste, Gesehen-Regel (85 %, Metadatenwechsel, einmal pro Folge), Payload + **Vertragstest gegen `event.schema.json`**, Datei-Outbox-Logik, validiertes Laden

- [x] **T33 Shield-App (Android)** · M · Abh. T32
  Akz.: `MediaWatcherService`, Kopplungs- und Statusscreen, Flush per WorkManager, Debug-Logger für Spike S1, „Nicht erkannt“-Liste; Build grün

- [x] **T34 Shield-Doku + Spike-S1-Anleitung** · S
  Akz.: `docs/setup-shield.md`, `docs/spikes/s1-shield-metadata.md`, `docs/testing/shield-checkliste.md`

- [x] **T35 Web: Streaming-Darstellung** · S
  Akz.: `S1 · F14`, Öffnen-Link zur Serienseite, Film = gesehen; URLs von Streaming-Quellen nur auf den bekannten Domains des Dienstes übernehmen (wie bei Websites, Security-Review M1)

### Abnahme M2
- [x] volle Testsuite inkl. Gradle · [x] Code-Review · [x] Security-Review · [x] Befunde behoben
  Stand 2026-10-21: typecheck + lint sauber, 955 Unit/Integration-Tests (Coverage 92,8 %), 22 E2E, 110 JUnit-Tests, Debug-/Release-APK, Android-Lint.
  Hingenommen: Adapter und Shield-Mappings gegen synthetische Seiten/Metadaten (A10, Spikes S1–S3 offen); Token im Klartext in privaten Preferences (Backups ausgeschlossen); `chrome.storage.local` für Content-Scripts lesbar (galt schon für den Reader); Gradle-Wrapper-JAR ohne CI-Prüfung (kein CI vorhanden); deutsche UI ohne Android-String-Ressourcen; targetSdk 36.

---

## M3 – Light Novels & E-Books (`feat/m3-mobile`)

- [x] **T36 core: WebNovel- und Amazon-Parser** · S
  Akz.: Book-ID aus WebNovel-URLs, ASIN aus Amazon-/Kindle-Links; ungültige Eingaben → null

- [x] **T37 Share-API + iPhone-Token** · M · Abh. T36
  Akz.: `POST /share`, `/share/confirm` (Server erzeugt UUID); unbekannter Titel → Pending; Einstellungen: „iPhone-Kurzbefehl hinzufügen“ zeigt Token einmalig

- [x] **T38 Schnell-Update-PWA** · M
  Akz.: Manifest, Icons, iOS-Meta; 8 zuletzt aktive LN/E-Books; Stepper/Prozent; ≤ 2 Taps

- [x] **T39 Extension: WebNovel- und Kindle-Bibliothek** · M · Abh. T36
  Akz.: `library_sync` aus Bibliotheksseiten (unverifiziert, A10)

- [x] **T40 WebNovel-Erinnerung** · XS
  Akz.: Hinweis auf dem Core-Screen, wenn der letzte WebNovel-Sync älter als 7 Tage ist

- [x] **T41 Doku iPhone + Spikes S2/S3** · S
  Akz.: `docs/setup-iphone.md` (Kurzbefehl Schritt für Schritt), `docs/spikes/s2-webnovel.md`, `s3-kindle.md`, `docs/testing/iphone-checkliste.md`

### Abnahme M3
- [x] volle Testsuite inkl. Gradle · [x] Code-Review · [x] Security-Review · [x] Befunde behoben
  Stand 2026-10-21: typecheck + lint sauber, 1108 Unit/Integration-Tests (Coverage 92,9 %, core 98,6 %), 26 E2E, 110 JUnit-Tests, Debug-/Release-APK, Android-Lint.
  Behoben: Login-Limiter reserviert vor der Passwortprüfung; Share-Zahlen streng geprüft, Prüfung vor dem Verbrauchen; Phone-Token nur für `/share…`; jede Share-Antwort mit Meldung; Titel aus Anführungszeichen/Slug, wartende Karte behält ihren Titel; Einheit des verknüpften Werks; `409 share_used`; WebNovel-Hinweis über `sources.last_library_sync_at` und nur für WebNovel-Leser; Listen springen nicht mehr unter dem Finger, ausstehende Speicherungen werden beim Verlassen gesendet, Schritte von veralteten Bildschirmen abgelehnt; Bibliotheks-Karten enthalten genau ein Buch, Einträge einzeln geprüft.
  Hingenommen: Bibliotheks- und Share-Adapter gegen synthetische Seiten (A10, Spikes S2/S3 offen, inkl. „Latest: Chapter N“-Frage); Telefon-Token im Klartext im Kurzbefehl (Doku warnt, Token nur fürs Teilen); erneutes Bestätigen nennt nicht das erste Ergebnis (nur „Schon gespeichert“); `ShareResponse`/`ShareConfirmResponse` nur als Vertragsdoku.

---

## M4 – optional (`feat/m4-extras`)

- [x] **T42 Statistiken** · M
  - T42a core: `stepGain` + `bucketProgress` (Woche Mo–So, Monat, `Europe/Berlin`), TDD
  - T42b server: `progressStats(db, now)` über `lag()` je Werk; web: `/stats` (Tabelle + CSS-Balken), Navigation, E2E
  Akz.: Kapitel/Folgen pro Woche (12) und Monat (12) aus `events`; Fortschritt statt Event-Zahl; erstes Event zählt 1; ohne Chart-Bibliothek (SPEC §4.8)

- [x] **T43 Neue Kapitel erkennen** · L → in Scheiben
  - T43a db+server: `works.latest_chapter`, `latest_chapter_at` (Migration 0006); `seriesToWatch(db)`, `recordLatestChapters(db, items)`; `GET /series-watch`, `POST /latest-chapters` (nur `extension`)
  - T43b core: `latestChapterIn(html, seriesUrl, externalKey, rule?)` und `looksLikeChallenge(html)`, TDD
  - T43c extension: Planung (Alarm stündlich, 1×/Tag je Serie, ≤ 10 pro Lauf, 3 s Abstand, 7 Tage Pause nach Fehler), Abruf ohne Cookies mit Grenzen, Meldung an den Server, Option „Neue Kapitel prüfen“; E2E mit Fixture-Serienseite
  Akz.: nur freigeschaltete Seiten, nur bei laufendem Browser, kein Umgehen von Bot-Schutz; `latest_chapter` am Werk (SPEC §7.11)

- [x] **T44 Hinweis „neue Kapitel“** · S · Abh. T43
  Akz.: Badge „3 neu“ in der Liste, Filter „Neue Kapitel“, Detailseite nennt das neueste Kapitel (SPEC §4.2)

### Abnahme M4
- [x] volle Testsuite inkl. Gradle · [x] Code-Review · [x] Security-Review · [x] Befunde behoben
  Stand 2026-10-21: typecheck + lint sauber, 1210 Unit/Integration-Tests (Coverage 93,3 %, core 98,3 %), 29 E2E, 110 JUnit-Tests, Debug-/Release-APK, Android-Lint.
  Behoben (Code-Review): Alarme werden nur angelegt, wenn sie fehlen (sonst feuerte „new-chapters“ nie); Serie vor dem Abruf belegen, 20-s-Timeout; unzugestellte Ergebnisse merken statt Seiten neu abrufen; offline ohne Strafe; eine Serienseite pro Werk (zuletzt genutzte Quelle); Statistik gegen den bisher höchsten Stand (keine Aufblähung durch Zusammenführen), Berliner Tag aus der DB; Teil-Listen nicht melden; nie geprüfte Serien zuerst; Back-off an die URL gebunden.
  Behoben (Security-Review): Weiterleitungen werden nicht verfolgt (kein Abruf beliebiger Hosts, auch nicht im Heimnetz), nur https; höchstens 3 Abrufe pro Host und Lauf; Parser mit Vorfilter und 1-s-Budget; `/latest-chapters` prüft Einträge einzeln und schreibt nur an Werke, die `/series-watch` liefern würde; kein Cookie, Referer oder Origin (E2E).
  Hingenommen: Seitenregel-Muster mit mehreren unbeschränkten Quantoren bleiben erlaubt (vom Besitzer geschrieben; ein einzelnes `exec` lässt sich nicht unterbrechen); Serienseiten, die per JavaScript laden oder `<base href>`/Links ohne Anführungszeichen nutzen, liefern nichts; Prüfung ist voreingestellt an (Doku + Option); ein Extension-Token kann die Liste der gelesenen Serien lesen.

---

## Lokaler Betrieb (`feat/lokaler-betrieb`)

- [x] **T45 Datenbank lokal wie die Web-App** · M
  Akz.: `DATABASE_URL=pglite:~/.read-watch-tracker/db` (Home-Ordner, gleicher Pfad für Web-App und CLI; CLI-Skripte lesen `apps/web/.env.local`); Sperrdatei `<ordner>.lock` gegen einen zweiten Prozess, Sperren beendeter Prozesse werden übernommen; mit `BACKUP_DIR` eine Sicherung pro Tag (beim Start vor den Migrationen, dann alle 6 h geprüft, 14 bleiben); `pnpm db:backup`, `pnpm db:restore` (alter Ordner bleibt daneben, defekte Sicherung stellt ihn wieder her); `pnpm start` nur auf `127.0.0.1`; Doku und SPEC v0.3 ohne Neon/Vercel (`docs/betrieb-lokal.md`); bestehende Daten aus `apps/web/.data/dev` übernommen
  Offen: Shield und iPhone erreichen den lokalen Tracker nicht (SPEC §19)

- [x] **T46 Bilder pro Werk + Feinschliff der Web-App** · M
  Akz.: Extension liest `og:image` (nur https) und sendet `source.coverUrl`; `work_links`/`pending_matches.cover_url`, Tabelle `work_covers` (Migration 0007); Server lädt Seitenbilder nach Events und Bestätigungen (geschützter Download, Logo-Erkennung, Fehler 7 Tage gemerkt); Detailseite: Datei, Ziehen, Strg+V, Bildadresse, entfernen, Bild der Seite; `/works/[id]/cover` nur mit Sitzung, versioniert und ein Jahr cachebar; Kacheln mit Initialen; Übersicht als Karte mit Bildern, Kopfzeile mit Marke und aktiver Navigation, Titel auf dem Handy zweizeilig; Bilder auch in Schnell-Update und Zuordnungen (Kachel)
  Geprüft: 1296 Unit/Integration-Tests, 30 E2E (neu: Upload, `og:image` im Event), Brave-Lauf mit demonicscans: Solo Leveling bekommt sein Cover nach dem Zuordnen

---

## Updates-Seite (`feat/updates-seite`)

- [x] **T47 Seite „Updates“: wo neue Kapitel warten** · M · Abh. T43, T44, T46 · Entwurf und Entscheidungen: `docs/feature-updates/README.md`
  - T47a SPEC: §4.9, U8, Satz in §4, §6.1, §7.11 (abgeschlossene und abgebrochene Werke)
  - T47b server: `seriesToWatch`/`recordLatestChapters` auch für abgeschlossene und abgebrochene Werke, Lese-Werke zuerst; Integration (PGlite)
  - T47c server: `countWorksWithNewChapters`, `lastSeriesCheck`; Integration (PGlite)
  - T47d web: `lib/updates.ts` (Auswahl, Reihenfolge, Klickziel, Beschriftungen) und `lib/updates-page.ts` (Name, Pfad), TDD
  - T47e web: `/updates` mit `UpdatesScreen`, `UpdateCard`, `UpdateCover` (2:3, lazy, nur eigener Server)
  - T47f web: Navigationseintrag „Updates“ mit Zahl der Werke mit neuen Kapiteln
  - T47g E2E: Klickziele, graue Karte ohne Lese-Seite, „Nur neue“, Reihenfolge, abgebrochenes Werk mit neuen Kapiteln, Zähler, nur eigener Origin, 375 px ohne Querscrollen; Screenshots hell/dunkel/Handy
  Akz.: Manga/Manhwa/Manhua mit bekanntem Stand, neue Kapitel oben mit Ring und „+N“; abgeschlossen/abgebrochen/Light Novel nur mit neuen Kapiteln; nie `Kap. ?`; Bild öffnet *n+1* (wie „Weiterlesen“) bzw. ohne Neues das zuletzt gelesene Kapitel im neuen Tab, Titel → Detailseite; ohne Lese-Seite grau, kein Link, „keine Seite bekannt“; „Zuletzt gelesen“/„Meiste neue“, „Alle | Nur neue“; „Updates N“ in der Navigation (SPEC §4.9)
  Offen: LCP/CLS mit 500 Werken messen; Brave-Lauf mit echter Extension für ein abgeschlossenes Werk
