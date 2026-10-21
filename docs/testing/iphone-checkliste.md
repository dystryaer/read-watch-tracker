# Abnahme iPhone (manuell)

Die Server-Seite ist mit Tests abgedeckt (`packages/server/test/share.test.ts`, `api.test.ts`, E2E in `tests/e2e/web`). Was nur auf dem iPhone prüfbar ist, steht hier (SPEC §9.6). Voraussetzung: [Einrichtung](../setup-iphone.md) erledigt.

| # | Prüfung | Erwartung | ✓ |
|---|---|---|---|
| 1 | Homescreen-Icon „Lesestand“ antippen, bei einer Light Novel `[+]` | Vom Icon bis zum gespeicherten Kapitel +1 höchstens 2 Taps; nach erneutem Öffnen steht das neue Kapitel da | |
| 2 | E-Book im Schnell-Update per Regler auf einen neuen Wert | Wert bleibt nach erneutem Öffnen erhalten | |
| 3 | WebNovel-App: ein bekanntes Buch teilen → Lesestand | Richtiges Werk, Vorschlag Kapitel *n+1*, speichern in höchstens 3 Taps, Mitteilung „… → Kap. … gespeichert“ | |
| 4 | Kindle-App: ein bekanntes Buch teilen → Lesestand | Vorschlag letzter Prozentwert; „43,5“ mit Komma wird gespeichert | |
| 5 | Ein unbekanntes Buch teilen | Mitteilung „Neuer Titel – bitte im Tracker zuordnen“; Karte mit der Zahl in „Zuordnungen“ | |
| 6 | Einen beliebigen anderen Link teilen | Verständliche Meldung („Dieser Link gehört zu keinem Buch …“) | |
| 7 | Token im Tracker widerrufen, dann teilen | Verständliche Meldung („Dieser Kurzbefehl ist nicht mehr mit dem Tracker verbunden …“) | |
| 8 | Am Desktop die WebNovel-Bibliothek öffnen (sofern S2 positiv) | Alle dort gelisteten Bücher sind danach aktualisiert; der Hinweis auf dem Core-Screen verschwindet | |
