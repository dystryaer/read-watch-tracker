# Lokaler Betrieb

Tracker und Datenbank laufen auf deinem Rechner, ohne Cloud und ohne Konto bei einem Anbieter. Die Datenbank ist ein eingebettetes Postgres (PGlite): Sie läuft im Prozess der Web-App, braucht keine Installation und liegt in einem Ordner in deinem Benutzerverzeichnis.

## 1. Einrichten (einmalig)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm build
```

In `apps/web/.env.local`:

| Name | Wert |
|---|---|
| `DATABASE_URL` | `pglite:~/.read-watch-tracker/db` – der Datenordner (`~` ist dein Benutzerordner) |
| `BACKUP_DIR` | `~/.read-watch-tracker/backups` – hier landen die täglichen Sicherungen |
| `BETTER_AUTH_SECRET` | 32+ zufällige Zeichen, z. B. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `SETUP_TOKEN` | nur für das erste Konto: 16+ zufällige Zeichen (gleicher Befehl). Ohne ihn bleibt `/setup` bei `pnpm start` gesperrt. |
| `APP_TIME_ZONE` | optional, Standard `Europe/Berlin` |

Die Web-App, `pnpm import:excel` und alle `pnpm db:*`-Befehle lesen diese Datei und arbeiten damit auf derselben Datenbank.

## 2. Starten

```bash
pnpm start
```

Der Tracker läuft auf <http://localhost:3000> und ist nur von diesem Rechner aus erreichbar. Beenden mit Strg+C.

- Beim allerersten Start `/setup` öffnen, den `SETUP_TOKEN` eingeben und **dein** Konto anlegen. Danach ist keine Registrierung mehr möglich.
- Läuft der Tracker nicht, sammelt die Extension gelesene Kapitel und schickt sie beim nächsten Start nach.
- Nach einem Update (`git pull`): `pnpm install`, `pnpm build`, dann wieder `pnpm start`. Neue Migrationen wendet der Tracker beim Start selbst an, nach der Sicherung des Tages.

## 3. Daten und Sicherung

| Was | Wo (Windows) |
|---|---|
| Datenbank | `C:\Users\<du>\.read-watch-tracker\db` |
| Sicherungen | `C:\Users\<du>\.read-watch-tracker\backups\tracker-<Datum>_<Uhrzeit>.tar.gz` |

- Der laufende Tracker legt **einmal am Tag** eine Sicherung an (beim Start und danach alle 6 Stunden geprüft). Die neuesten 14 bleiben, ältere werden gelöscht.
- **Sofort sichern:** Tracker beenden, dann `pnpm db:backup`.
- **Zurückspielen:** Tracker beenden, dann

  ```bash
  pnpm db:restore "C:\Users\<du>\.read-watch-tracker\backups\tracker-….tar.gz"
  ```

  Der bisherige Datenordner bleibt als `db.vor-<Zeit>` daneben liegen. Löschen, wenn alles passt.
- Die Sicherungen liegen auf derselben Festplatte wie die Datenbank. Gegen einen Festplattenschaden hilft nur eine Kopie des Ordners `backups` auf einem anderen Datenträger oder in deinem Cloud-Speicher.
- Eine Sicherung enthält alles, auch dein Konto (Passwort nur als Hash) und die Geräte-Kopplungen. Behandle sie wie ein Passwort: nicht teilen, nur in Speicher legen, auf die nur du Zugriff hast.

## 4. Nur ein Prozess pro Datenbank

Die eingebettete Datenbank darf immer nur ein Prozess geöffnet haben, sonst geht sie kaputt. Der Tracker sperrt sie deshalb mit der Datei `db.lock` neben dem Datenordner. Solange er läuft, brechen `pnpm import:excel`, `pnpm db:backup`, `pnpm db:restore` und ein zweites `pnpm start` oder `pnpm dev` mit einer Meldung ab.

Nach einem Absturz übernimmt der nächste Start die Sperre automatisch. Erscheint die Meldung, obwohl sicher nichts läuft: `C:\Users\<du>\.read-watch-tracker\db.lock` löschen.

## 5. Geräte verbinden

- **Browser-Extension:** [setup-extension.md](setup-extension.md), Tracker-Adresse `http://localhost:3000`.
- **Excel-Liste** (einmalig, Tracker beendet):

  ```bash
  pnpm import:excel "C:\Users\…\Reading List.xlsx" --dry-run
  pnpm import:excel "C:\Users\…\Reading List.xlsx"
  ```

- **Shield und iPhone** erreichen einen Tracker, der nur auf diesem Rechner läuft, nicht. Beide brauchen eine https-Adresse im Netz, damit Tokens nie unverschlüsselt übertragen werden. Das geht erst mit einem eigenen Server ([server-umzug.md](server-umzug.md)) oder einem HTTPS-Zugang zu diesem Rechner (SPEC §19, noch offen).

## Hinweise

- `pnpm dev` (Entwicklung) nutzt dieselbe Datenbank wie `pnpm start`. Beide gleichzeitig verhindert die Sperre.
- Die Rate-Limits (Login, API) zählen im Speicher des Tracker-Prozesses und beginnen nach einem Neustart von vorn.
