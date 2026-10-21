# Deployment in der Cloud (Neon + Vercel)

Beide Dienste haben kostenlose Tarife. Accounts und Secrets legst du selbst an; nichts davon gehört ins Repository.

## 1. Datenbank bei Neon

1. Bei [neon.tech](https://neon.tech) ein Projekt anlegen (Region z. B. Frankfurt).
2. Die **Connection String** kopieren. Für Vercel die Variante mit Connection-Pooling verwenden (`…-pooler…`); sie endet auf `?sslmode=require`.
3. Migrationen einmal von deinem Rechner aus anwenden:

   ```bash
   DATABASE_URL="postgres://…?sslmode=require" pnpm db:migrate
   ```

   Das wiederholst du nach jedem Update, das neue Migrationen mitbringt (Ordner `packages/db/migrations`).

## 2. Web-App bei Vercel

1. Repository bei [vercel.com](https://vercel.com) importieren.
2. **Root Directory:** `apps/web`. Framework wird als Next.js erkannt, pnpm über `packageManager` in der `package.json`.
3. **Environment Variables** (Production):

   | Name | Wert |
   |---|---|
   | `DATABASE_URL` | Connection String von Neon (Pooling) |
   | `BETTER_AUTH_SECRET` | 32+ zufällige Zeichen, z. B. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `BETTER_AUTH_URL` | die öffentliche Adresse, z. B. `https://dein-tracker.vercel.app` |
   | `SETUP_TOKEN` | 16+ zufällige Zeichen (gleicher Befehl). Ohne ihn ist `/setup` in Production gesperrt, damit niemand vor dir das Konto anlegt. Nach der Einrichtung darf er bleiben oder gelöscht werden. |
   | `APP_TIME_ZONE` | optional, Standard `Europe/Berlin` |
   | `TRUSTED_PROXY_HOPS` | optional, Standard `1` (richtig für Vercel). Wie viele Proxys vor der App `X-Forwarded-For` ergänzen; nur für Rate-Limits. |

4. Deployen. Danach `https://…/setup` öffnen, den `SETUP_TOKEN` als Einrichtungs-Code eingeben und **dein** Konto anlegen. Ab dann ist keine Registrierung mehr möglich.

## 3. Geräte verbinden

- Browser-Extension: siehe [setup-extension.md](setup-extension.md).
- Excel-Liste importieren (einmalig, von deinem Rechner):

  ```bash
  DATABASE_URL="postgres://…?sslmode=require" pnpm import:excel "C:\Users\…\Reading List.xlsx" --dry-run
  DATABASE_URL="postgres://…?sslmode=require" pnpm import:excel "C:\Users\…\Reading List.xlsx"
  ```

## Hinweise

- **Rate-Limits** (Login, API) zählen pro Server-Instanz im Speicher. Auf Vercel kann es mehrere Instanzen geben; für einen einzelnen Nutzer reicht das (Planentscheidung A12).
- Neon pausiert bei Inaktivität und wacht beim nächsten Zugriff automatisch auf; der erste Aufruf danach dauert etwas länger.
- Für den späteren Umzug auf einen eigenen Server: [server-umzug.md](server-umzug.md).
