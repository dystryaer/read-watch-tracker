# Read-Watch-Tracker

Persönlicher Tracker für Manga, Manhwa, Manhua, Light Novels, E-Books und Serien: zeigt bei jedem Titel, wo du stehst, und führt mit einem Klick zum nächsten Kapitel. Spezifikation: [SPEC.md](SPEC.md) · Plan: [tasks/plan.md](tasks/plan.md).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `apps/web` | Next.js-App: Übersicht, Zuordnungen, Einstellungen, Geräte-API `/api/v1/*` |
| `apps/extension` | Brave-Extension (WXT, Manifest V3) |
| `packages/core` | Gemeinsame Regeln: Event-Vertrag, Normalisierung, Kapitel-Erkennung, Fortschritt |
| `packages/db` | Drizzle-Schema, Migrationen, PGlite/Postgres-Factory |
| `packages/server` | Serverlogik ohne Framework: Ingest, Zuordnung, Kopplung, Import |
| `scripts/import-excel.ts` | Einmaliger Import der Excel-Liste |
| `tests/e2e` | Playwright-Tests für Web-App und Extension |

## Lokal entwickeln

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Secret eintragen
pnpm dev                                       # http://localhost:3000, eingebettete Datenbank in apps/web/.data
```

Docker ist dafür nicht nötig: `DATABASE_URL=pglite:./.data/dev` nutzt ein eingebettetes Postgres.

## Prüfen

```bash
pnpm typecheck
pnpm lint
pnpm test --coverage
pnpm test:e2e
```

## Anleitungen

- [Deployment (Neon + Vercel)](docs/deploy.md)
- [Browser-Extension einrichten](docs/setup-extension.md)
- [Umzug auf einen eigenen Server](docs/server-umzug.md)
