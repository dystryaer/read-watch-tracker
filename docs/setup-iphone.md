# iPhone einrichten: Schnell-Update und Kurzbefehl „Lesestand“

Light Novels (WebNovel-App) und E-Books (Kindle-App) aktualisierst du halbautomatisch (SPEC §9):

| Weg | Aufwand | Wann |
|---|---|---|
| **Schnell-Update** (Web-App auf dem Homescreen) | 2 Taps | immer, für alle Light Novels und E-Books |
| **Kurzbefehl „Lesestand“** aus dem Teilen-Menü | 3 Taps | direkt aus der WebNovel- oder Kindle-App |
| **Bibliotheks-Sync** am Desktop | 1 Seitenaufruf | WebNovel- bzw. Kindle-Bibliothek in Brave öffnen (Extension) |

## 1. Schnell-Update auf den Homescreen

1. In Safari deinen Tracker öffnen und anmelden.
2. **Teilen → Zum Home-Bildschirm**. Name „Lesestand“ übernehmen.
3. Das Icon öffnet die Web-App im Vollbild direkt auf **Schnell-Update**: die 8 zuletzt aktiven Light Novels und E-Books, mit `[+]` für das nächste Kapitel bzw. einem Regler für Prozent. Gespeichert wird automatisch eine halbe Sekunde nach der letzten Änderung.

## 2. Token für den Kurzbefehl anlegen

1. Im Tracker **Einstellungen → iPhone-Kurzbefehl → iPhone-Kurzbefehl hinzufügen**.
2. Der Token erscheint **nur dieses eine Mal**. „Kopieren“ tippen und gleich in Schritt 3 einfügen.
3. Widerrufen kannst du ihn jederzeit unter **Gekoppelte Geräte**. Danach meldet der Kurzbefehl „Dieser Kurzbefehl ist nicht mehr mit dem Tracker verbunden …“.

## 3. Kurzbefehl „Lesestand“ bauen (einmalig, ca. 5 Minuten)

In der App **Kurzbefehle** einen neuen Kurzbefehl „Lesestand“ anlegen. Unter **Details** (ⓘ) **Im Teilen-Menü anzeigen** einschalten und als Typen **URLs** und **Text** wählen. Dann diese Aktionen in dieser Reihenfolge:

1. **Text**: deine Tracker-Adresse, z. B. `https://dein-tracker.vercel.app`. Umbenennen in *Adresse*.
2. **Text**: den kopierten Token einfügen. Umbenennen in *Token*.
3. **Inhalt von URL abrufen**
   - URL: *Adresse* `/api/v1/share`
   - Methode: **POST**
   - Header: `Authorization` = `Bearer ` + *Token*, `Content-Type` = `application/json`
   - Haupttext: **JSON** mit den Feldern `url` = *Kurzbefehleingabe* und `text` = *Kurzbefehleingabe*
4. **Wörterbuchwert abrufen**: `message` aus *Inhalt der URL*.
5. **Wenn** *Wörterbuchwert* **hat beliebigen Wert** → **Mitteilung anzeigen** (*Wörterbuchwert*) → **Kurzbefehl stoppen** → **Ende**.
   So zeigt der Kurzbefehl die Fehlermeldungen des Trackers (unbekannter Link, abgelaufen, Token widerrufen).
6. **Wörterbuchwert abrufen** für `shareId`, `title`, `unit` und `suggested` (je eine Aktion, alle aus *Inhalt der URL*).
7. **Nach Eingabe fragen**: Typ **Zahl**, Frage *title* `– Kapitel bzw. Prozent?`, Standardwert *suggested*.
8. **Wenn** *unit* **ist** `chapter` → **Inhalt von URL abrufen** mit URL *Adresse* `/api/v1/share/confirm`, POST, gleiche Header, JSON `shareId` = *shareId*, `chapter` = *Gefragte Eingabe*. **Sonst** → dasselbe mit `percent` statt `chapter`. **Ende**.
9. **Wörterbuchwert abrufen**: `message` aus dem letzten *Inhalt der URL*.
10. **Mitteilung anzeigen**: *Wörterbuchwert* – z. B. „Shadow Slave → Kap. 1205 gespeichert“.

Zahlen mit Komma („43,5“) versteht der Tracker. Ein Teilen gilt 15 Minuten und nur einmal.

## 4. Benutzen

1. In der WebNovel- oder Kindle-App **Teilen → Lesestand**.
2. Vorschlag prüfen (nächstes Kapitel bzw. letzter Prozentwert) und **Fertig**.
3. Ein Buch, das der Tracker noch nicht kennt, landet mit der eingegebenen Zahl als Karte in **Zuordnungen**. Die Mitteilung lautet dann „Neuer Titel – bitte im Tracker zuordnen“. Einmal zuordnen, danach erkennt der Kurzbefehl das Buch.

> **Stand:** Was die beiden Apps beim Teilen genau übergeben (Buch-Link, Kapitel-Link, Text), klären die Spikes [S2](spikes/s2-webnovel.md) und [S3](spikes/s3-kindle.md). Der Tracker erkennt WebNovel-Links (`webnovel.com/book/…`) und Amazon-/Kindle-Links mit ASIN (`/dp/…`, `?asin=…`), auch mitten im geteilten Text.
