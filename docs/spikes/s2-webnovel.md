# Spike S2: WebNovel – Bibliothek und Teilen

**Fragen (SPEC §9.5):**
1. Zeigt die WebNovel-Bibliothek auf der Website den Kapitelstand, den ich in der iPhone-App erreicht habe?
2. Wie ist sie aufgebaut (HTML-Karten oder nachgeladenes JSON)?
3. Was landet beim „Teilen“ aus der WebNovel-App im Kurzbefehl (Buch-Link, Kapitel-Link, Text)?

**Timebox:** ½ Tag. Fällt der Spike negativ aus, bleibt für Light Novels das Schnell-Update (SPEC §9.1, Pfad B).

## 1. Bibliothek am Desktop

1. In der iPhone-App ein Kapitel eines Buches lesen, dessen Stand du kennst.
2. In Brave `https://www.webnovel.com/library` öffnen (angemeldet).
3. Steht dort derselbe Kapitelstand?
4. Seite speichern: Rechtsklick → **Speichern unter → Webseite, nur HTML**. Vorher prüfen, dass keine Kontodaten (E-Mail, Name) im Dokument stehen; ggf. die Stellen ersetzen.
5. In den Entwicklertools (F12 → Netzwerk) nachsehen, ob die Liste per JSON-Request nachgeladen wird. Wenn ja: die Antwort ebenfalls speichern (ohne Cookies/Header).

**Abgleich mit der Extension:** Der Adapter in `apps/extension/src/library/pages.ts` sucht Links auf `/book/<slug>_<id>` und in deren Karte „Chapter N“ bzw. „Kapitel N“. Die gespeicherte Seite ersetzt die erfundene Seite in `apps/extension/test/library-pages.test.ts`; passt der Adapter nicht, wird er gegen die echte Seite angepasst. Die Karte eines Buchs ist der größte Bereich um seinen Link, der kein anderes Buch enthält. **Bitte prüfen:** Zeigt eine Karte außer dem Lesestand auch das neueste Kapitel (z. B. „Latest: Chapter 2950“) *vor* dem Lesestand? Dann nimmt der Adapter heute die falsche Zahl. Er muss dann gezielt das Lesestand-Label lesen, festgehalten mit einem Test an der echten Seite.

## 2. Teilen aus der App

1. Im Kurzbefehl „Lesestand“ (siehe [setup-iphone.md](../setup-iphone.md)) vorübergehend direkt nach dem Start die Aktion **Ergebnis anzeigen** mit *Kurzbefehleingabe* einfügen.
2. In der WebNovel-App ein Buch und ein Kapitel teilen.
3. Den angezeigten Inhalt notieren (Link, Text). Danach die Aktion wieder entfernen.

**Abgleich:** `parseWebnovelBookId` (`packages/core/src/share.ts`) erkennt `webnovel.com/book/<slug>_<id>`, `/book/<id>` und Kapitel-Links darunter, auch im Text. Neue Formen kommen als Testfall nach `packages/core/test/share.test.ts`.

## 3. Ergebnis

| Frage | Ergebnis |
|---|---|
| Bibliothek zeigt App-Stand | |
| Aufbau (HTML/JSON) | |
| Teilen liefert | |
| Entscheidung | Bibliotheks-Sync ja/nein · Kurzbefehl ja/nein |
