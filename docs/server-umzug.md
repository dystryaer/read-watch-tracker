# Umzug auf einen eigenen Server

Der Tracker nutzt nur Standard-Postgres und Umgebungsvariablen. Ein Umzug heißt deshalb: Datenbank-Dump einspielen und `DATABASE_URL` umstellen.

> **Stand der Prüfung:** Das Docker-Image selbst konnte bei der Entwicklung nicht gebaut werden, weil auf dem Entwicklungsrechner kein Docker installiert ist. Geprüft wurde der Inhalt des Images: Der Standalone-Build von Next.js (`NEXT_OUTPUT=standalone`) startet, wendet die Migrationen an und beantwortet Seiten und API. Bitte den Ablauf unten einmal auf dem Server durchspielen, bevor du die Cloud abschaltest (SPEC §17.11).

## 1. Server vorbereiten

Voraussetzung: Docker mit Compose-Plugin.

```bash
git clone <dein-repo> read-watch-tracker
cd read-watch-tracker
```

Datei `.env` neben `docker-compose.yml` anlegen (nicht committen):

```dotenv
POSTGRES_PASSWORD=<langes zufälliges Passwort>
BETTER_AUTH_SECRET=<32+ zufällige Zeichen>
BETTER_AUTH_URL=https://tracker.example
# Nur für ein neues Konto nötig (bei übernommenen Daten existiert es schon):
# SETUP_TOKEN=<16+ zufällige Zeichen>
# Proxys vor der App, die X-Forwarded-For ergänzen (ein Caddy/Traefik: 1):
# TRUSTED_PROXY_HOPS=1
```

## 2. Starten

```bash
docker compose up -d --build
```

- `db`: Postgres 17 mit Volume `db-data`
- `migrate`: wendet die Migrationen an und beendet sich
- `web`: die App auf `127.0.0.1:3000` (nur lokal erreichbar)

Davor gehört ein Reverse-Proxy mit HTTPS (z. B. Caddy oder Traefik), der auf `127.0.0.1:3000` weiterleitet. Die App setzt `upgrade-insecure-requests` und sichere Cookies nur über HTTPS.

## 3. Daten aus der Cloud übernehmen

```bash
# Dump aus Neon (auf deinem Rechner oder dem Server)
pg_dump --no-owner --no-acl --format=custom "postgres://…neon…?sslmode=require" > tracker.dump

# In die frische Datenbank einspielen (Migrationen sind durch den migrate-Service schon angewendet)
docker compose cp tracker.dump db:/tmp/tracker.dump
docker compose exec db pg_restore --clean --if-exists --no-owner -U tracker -d tracker /tmp/tracker.dump
```

## 4. Umstellen

1. `BETTER_AUTH_URL` in `.env` auf die neue Adresse setzen, `docker compose up -d`.
2. Mit dem bestehenden Konto anmelden (es kommt mit dem Dump mit).
3. In der Browser-Extension die neue Tracker-Adresse eintragen und **neu koppeln**. Gekoppelte Geräte behalten ihre Tokens zwar im Dump, zeigen aber noch auf die alte Adresse.
4. Wenn alles läuft: Vercel-Projekt und Neon-Datenbank löschen.

## Smoke-Test nach dem Umzug

- `/login` lädt, Anmeldung funktioniert.
- Die Übersicht zeigt deine Titel mit Stand.
- Ein Kapitel auf einer freigeschalteten Seite lesen: Es erscheint nach wenigen Sekunden in der Übersicht.
