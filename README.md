# Read-Watch-Tracker

Persönlicher Tracker für Manga, Manhwa, Manhua, Light Novels, E-Books und Serien: zeigt bei jedem Titel, wo du stehst, und führt mit einem Klick zum nächsten Kapitel. Spezifikation: [SPEC.md](SPEC.md) · Plan: [tasks/plan.md](tasks/plan.md).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `apps/web` | Next.js-App: Übersicht, Zuordnungen, Einstellungen, Geräte-API `/api/v1/*` |
| `apps/extension` | Brave-Extension (WXT, Manifest V3) |
| `packages/core` | Gemeinsame Regeln: Event-Vertrag, Normalisierung, Kapitel-Erkennung, Fortschritt |
| `packages/db` | Drizzle-Schema, Migrationen, PGlite/Postgres-Factory, Sperre und Sicherungen der lokalen Datenbank |
| `packages/server` | Serverlogik ohne Framework: Ingest, Zuordnung, Kopplung, Import |
| `scripts/import-excel.ts` | Einmaliger Import der Excel-Liste |
| `tests/e2e` | Playwright-Tests für Web-App und Extension |

## Betrieb

Tracker und Datenbank laufen lokal auf deinem Rechner. Die Datenbank ist ein eingebettetes Postgres (PGlite) in `~/.read-watch-tracker/db`; nichts zu installieren, kein Docker, keine Cloud. Details: [docs/betrieb-lokal.md](docs/betrieb-lokal.md).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Secret eintragen
pnpm build
pnpm start                                     # http://localhost:3000, nur von diesem Rechner erreichbar
pnpm db:backup                                 # Sicherung (der laufende Tracker sichert zusätzlich täglich)
pnpm db:restore "<Sicherung>.tar.gz"           # Stand zurückspielen (Tracker vorher beenden)
```

Zum Entwickeln `pnpm dev` statt `pnpm start` (gleiche Datenbank, nicht beide gleichzeitig).

## Prüfen

```bash
pnpm typecheck
pnpm lint
pnpm test --coverage
pnpm test:e2e
# Shield-App (in apps/shield, Windows: gradlew.bat)
./gradlew test assembleDebug
```

## Anleitungen

- [Lokaler Betrieb: Starten, Daten, Sicherung](docs/betrieb-lokal.md)
- [Browser-Extension einrichten](docs/setup-extension.md)
- [Nvidia Shield einrichten](docs/setup-shield.md)
- [iPhone: Schnell-Update und Kurzbefehl „Lesestand“](docs/setup-iphone.md)
- [Umzug auf einen eigenen Server](docs/server-umzug.md)
- Spikes auf deinen Geräten: [S1 Shield](docs/spikes/s1-shield-metadata.md), [S2 WebNovel](docs/spikes/s2-webnovel.md), [S3 Kindle](docs/spikes/s3-kindle.md)
- Manuelle Abnahme: [Shield](docs/testing/shield-checkliste.md), [iPhone](docs/testing/iphone-checkliste.md)
