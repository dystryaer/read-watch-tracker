# Spike S3: Kindle – Bibliothek, Teilen und Datenexport

**Fragen (SPEC §9.5):**
1. Zeigt `read.amazon.com` (Kindle-Bibliothek) den Fortschritt pro Buch an?
2. Liefert „Teilen“ aus der Kindle-App einen Link mit ASIN?
3. Welche Dateien und Felder enthält der Amazon-Datenexport zu Kindle-Lesesitzungen?

**Timebox:** ½ Tag. Fällt der Spike negativ aus, bleibt für E-Books das Schnell-Update mit Prozent-Regler (SPEC §9.2, Pfad B).

## 1. Bibliothek am Desktop

1. In Brave `https://read.amazon.com/kindle-library` öffnen (angemeldet).
2. Steht bei den Büchern ein Fortschritt in Prozent?
3. Seite speichern (**Speichern unter → Webseite, nur HTML**), vorher Kontodaten (Name, E-Mail) im Dokument ersetzen.
4. In den Entwicklertools prüfen, ob die Bücherliste als JSON nachgeladen wird; die Antwort ohne Cookies/Header speichern.

**Abgleich mit der Extension:** Der Adapter in `apps/extension/src/library/pages.ts` liest Kacheln mit `data-asin`, deren Titel und eine Prozentangabe. Ohne Prozentangabe sendet er nichts. Die gespeicherte Seite ersetzt die erfundene in `apps/extension/test/library-pages.test.ts`.

## 2. Teilen aus der App

1. Im Kurzbefehl „Lesestand“ vorübergehend **Ergebnis anzeigen** mit *Kurzbefehleingabe* einfügen.
2. In der Kindle-App ein Buch teilen.
3. Den Inhalt notieren: Steht ein Link mit ASIN darin (`/dp/<ASIN>`, `?asin=<ASIN>`)? Kurzlinks wie `a.co/…` kann der Tracker nicht auflösen.

**Abgleich:** `parseAsin` (`packages/core/src/share.ts`); neue Formen als Testfall nach `packages/core/test/share.test.ts`.

## 3. Datenexport (optional, SPEC §9.2 Pfad D)

1. Unter amazon.de → **Konto → Datenschutz → Daten anfordern** den Kindle-Export anfordern (dauert Tage).
2. Im ZIP die Dateien zu Lesesitzungen suchen (z. B. `Kindle.Devices.ReadingSession`), Spaltennamen und ein, zwei Beispielzeilen notieren – **ohne** die Datei ins Repository zu legen.

## 4. Ergebnis

| Frage | Ergebnis |
|---|---|
| Bibliothek zeigt Fortschritt | |
| Teilen liefert ASIN | |
| Export: Dateien/Felder | |
| Entscheidung | Bibliotheks-Sync ja/nein · Kurzbefehl ja/nein · Export später ja/nein |
