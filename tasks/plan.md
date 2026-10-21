# Implementation Plan: Read-Watch-Tracker

> Grundlage: [SPEC.md](../SPEC.md) v0.2 · Aufgabenliste: [todo.md](todo.md)

## Überblick

Umsetzung in vier Meilensteinen (SPEC §3.2). Jeder Meilenstein endet mit derselben Abnahme:

1. volle Testsuite (`pnpm typecheck && pnpm lint && pnpm test --coverage && pnpm test:e2e`, ab M2 zusätzlich `gradlew test`)
2. Code-Review über alle fünf Achsen (Korrektheit, Lesbarkeit, Architektur, Sicherheit, Performance)
3. Security-Review mit Fokus auf:
   - XSS-sichere Darstellung von Namen aus Nutzer- oder Fremdquellen (Titel, Seiten-, Gerätenamen)
   - Validierung aller geladenen Daten, die manipuliert oder beschädigt sein können (API-Eingänge, `chrome.storage`, `/config`-Antworten, Excel-Zeilen, Shield-Dateien)
4. Befunde beheben und committen, dann folgt der nächste Meilenstein

Jeder Meilenstein liegt auf einem eigenen Branch. Die Branches bauen aufeinander auf: `feat/m1-manga-tracking` → `feat/m2-streaming` → `feat/m3-mobile` → `feat/m4-extras`.

## Architekturentscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | Die **Serverlogik ist framework-frei** in einem eigenen Paket `packages/server` und bekommt die DB als Parameter. Next.js-Route-Handler, Server Actions und der Excel-Import sind dünne Adapter darauf. | testbar ohne Next.js; Web-App und Import-Skript teilen dieselbe Logik |
| A2 | **DB-Factory:** `DATABASE_URL=pglite:<pfad>` → PGlite (lokal, Tests, E2E), `postgres://…` → node-postgres (Neon, später eigener Server). Gleiches Drizzle-Schema, gleiche Migrationen. | lokale Entwicklung ohne Docker (nicht installiert), echtes Postgres inkl. `pg_trgm` in Tests |
| A3 | `works.title_normalized` wird **in der Anwendung** per `normalizeTitle` gesetzt, nicht als SQL-generierte Spalte. | Die Normalisierung (Unicode, Tags) ist TypeScript; eine SQL-Kopie würde auseinanderlaufen |
| A4 | **Kopplung ohne gespeicherten Token-Chiffretext:** Das Token wird beim ersten erfolgreichen Poll nach der Freigabe erzeugt; gespeichert wird nur sein SHA-256-Hash. | einfacher und sicherer als `token_ciphertext` (SPEC §5.1 wird angepasst) |
| A5 | **URLs nur `http:`/`https:`** – geprüft beim Ingest (zod) und noch einmal beim Rendern (`safeHref`). | verhindert `javascript:`-XSS über `last_url` und `series_url` |
| A6 | **Keine Favicons von Drittanbietern:** Statt eines Favicons zeigt die Quelle ein Buchstaben-Badge. | keine externen Requests, keine Weitergabe der Domains (SPEC §4.2 wird angepasst) |
| A7 | **Die Extension-UI ist Vanilla-TS**, Texte nur über `textContent`, kein `innerHTML`. | XSS-sicher bei Titeln aus fremden Seiten, keine UI-Abhängigkeit |
| A8 | **Kein CORS auf der API.** Die Extension ruft mit `host_permissions` auf, der Kurzbefehl und die Shield sind keine Browser. | kleinere Angriffsfläche |
| A9 | **Die Shield-Logik ist ein reines Kotlin/JVM-Modul** (`apps/shield/logic`); die Android-App ist eine dünne Hülle. Die Outbox ist eine Datei-Queue statt Room, Tokens liegen in privaten SharedPreferences, weil EncryptedSharedPreferences abgekündigt ist. | schnelle JVM-Tests, weniger Abhängigkeiten (SPEC §8.4 wird angepasst) |
| A10 | **Adapter für Streaming- und Bibliotheksseiten werden gegen synthetische Fixtures gebaut** und sind als „unverifiziert“ markiert, bis echte Seitenproben vorliegen (Spikes). | Diese Seiten erfordern deine Logins; ich rufe sie nicht auf |
| A11 | Für **Manga-Seiten-Fixtures** gibt es nur synthetische Reader-Layouts, keine Kopien echter Scanlation-Seiten. Echte Fixtures kommen über `docs/testing/fixtures.md` von dir. | keine Inhalte urheberrechtlich fragwürdiger Seiten abrufen |
| A12 | **Rate-Limit in-memory** (60/min pro Gerät). | Single-User; auf Vercel pro Instanz, dokumentiert |
| A13 | **Statistik ohne eigene Tabelle:** Fortschritts-Deltas per SQL-Fensterfunktion (`lag` je Werk) aus `events`, Wochen/Monate in `Europe/Berlin` als reine Core-Funktion. | Event-Protokoll ist die Wahrheit; testbar ohne DB; keine Chart-Bibliothek (SPEC §4.8) |
| A14 | **Neue Kapitel ohne DOM:** Der Service Worker liest `href`s per Regex aus dem HTML und prüft sie mit `detectChapterFromUrl`. Kein Offscreen-Dokument, keine neuen Berechtigungen, Planung (1×/Tag je Serie, 10 pro Stunde) in `chrome.storage.local`. | MV3-Service-Worker haben kein `DOMParser`; Offscreen wäre eine neue Berechtigung (SPEC §16 „erst fragen“) |

## Abhängigkeiten

```
core (Schema, Regeln, Erkennung) ──┬── db (Schema, Migrationen, Factory)
                                   │        │
                                   │        └── server (Ingest, Zuordnung, Kopplung)
                                   │                 │
                                   │                 ├── API-Routen ──┬── Extension (Outbox, Config, Lesen)
                                   │                 │                ├── Shield-App (M2)
                                   │                 │                └── Kurzbefehl (M3)
                                   │                 └── Web-UI (Liste, Inbox, Einstellungen)
                                   └── Extension-Erkennung (URL-Teil aus core)
Excel-Import ── server
```

## Meilensteine

| Meilenstein | Tasks | Ergebnis |
|---|---|---|
| **M1** Manga + Import | T01–T27 | Excel abgelöst, Manga in Brave automatisch getrackt |
| **M2** Serien & Anime | T28–T35 | Streaming am Desktop und auf der Shield |
| **M3** Light Novels & E-Books | T36–T41 | Bibliotheks-Sync, Schnell-Update-PWA, iOS-Kurzbefehl |
| **M4** optional | T42–T44 | Statistiken (`/stats`), neue Kapitel erkennen (Extension, 1×/Tag), Badge „3 neu“ + Filter |

## Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Streaming-Apps auf der Shield liefern keine Serien-/Folgen-Metadaten | Hoch (M2) | Debug-Logger für Spike S1 wird mitgeliefert; Fallback ist der Verlaufs-Sync am Desktop |
| DOM der Streaming- und Bibliotheksseiten unbekannt | Mittel | Media-Session-API zuerst; Adapter tolerant und als unverifiziert markiert |
| Manga-Seiten ändern sich häufig | Mittel | Seitenregeln als Daten, Domain-Umzug, generische Erkennung (Spec §7) |
| Nutzerregex (Seitenregeln) mit katastrophalem Backtracking | Niedrig | Längenlimits für Pattern (200) und URL (2048); Fehler werden abgefangen |
| Better-Auth-/Next.js-API-Änderungen | Niedrig | Versionen beim Setup fixiert, Lockfile |
| Kein Docker lokal → Portabilitätstest (Spec §17.11) nicht lokal prüfbar | Mittel | `docker-compose.yml` + Anleitung; der Test läuft auf einer Maschine mit Docker bzw. auf dem späteren Server |
| Deployment (Neon, Vercel) braucht deine Accounts | – | Anleitung `docs/deploy.md`; Accounts und Secrets legst du an |
| Serienseiten laden die Kapitelliste per JavaScript oder stecken hinter Bot-Schutz (M4) | Mittel | Dann kein Badge für diese Serie; überspringen, 7 Tage warten, nie umgehen (SPEC §7.11) |

## Offene Punkte (brauchen dich, blockieren aber nicht)

- Spikes S1–S3 auf deinen Geräten bzw. mit deinen Accounts (Anleitungen kommen mit M2/M3)
- Echte Kapitelseiten deiner Manga-Seiten als Fixtures (optional, verbessert die generische Erkennung)
- Deployment-Accounts (Neon, Vercel)
