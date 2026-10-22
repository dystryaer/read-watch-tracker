# Übersicht neu gestalten: Recherche und vier Vorschläge

Stand: 22.10.2026. Statische Mocks für die Übersicht (`/`, SPEC §4), teils mit einem Ausschnitt der Detailseite. Jede Datei ist eigenständig: nur Inline-CSS, keine Schriften, Bilder oder Skripte von außen. Cover sind Farbkacheln mit Initialen, wie `cover-thumb.tsx` sie ohne Bild zeigt. Hell und dunkel folgen `prefers-color-scheme`. Die Screenshots sind ganzseitig (Viewport 1280 × 900 bzw. 375 × 812 mit `isMobile`). Keine Seite scrollt seitlich (vom Skript geprüft), und keine lädt etwas von außen.

| Datei | Desktop | Handy |
|---|---|---|
| [01-regal.html](01-regal.html) | [Bild](screenshots/01-regal-desktop.png) | [Bild](screenshots/01-regal-mobile.png) |
| [02-weitermachen.html](02-weitermachen.html) | [Bild](screenshots/02-weitermachen-desktop.png) | [Bild](screenshots/02-weitermachen-mobile.png) |
| [03-tabelle.html](03-tabelle.html) | [Bild](screenshots/03-tabelle-desktop.png) | [Bild](screenshots/03-tabelle-mobile.png) |
| [04-anstehend.html](04-anstehend.html) | [Bild](screenshots/04-anstehend-desktop.png) | [Bild](screenshots/04-anstehend-mobile.png) |

Alle vier nutzen dieselben zehn Beispieltitel (Eleceed mit 2 neuen Kapiteln, Overgeared mit 3, Omniscient Reader's Viewpoint mit `Kap. ?`, Solo Leveling abgeschlossen, Shadow Slave, Project Hail Mary, Frieren usw.) und behalten Marke, Navigation und Teal-Akzent der App.

---

## 1. Recherche

Sechs bekannte Tracker und Streamingdienste, dazu Mihon als Randnotiz. Die meisten Seiten dieser Dienste verlangen eine Anmeldung, und AniList blockt automatische Abrufe. Belegt ist deshalb nur, was in Hilfeseiten, Foren, Artikeln und READMEs steht. Was ich nur aus eigener Kenntnis beschreibe, ist mit *(eigene Kenntnis)* markiert und nicht nachgeprüft.

### AniList

- **Layout:** Listen mit Statusabschnitten. Laut Vergleichen die modernere und stärker anpassbare Oberfläche („customizable statuses and displays“). Eine Zeilenansicht mit kleinem Bild und eine Kartenansicht mit großen Covern *(eigene Kenntnis)*.
- **Startseite:** Zeigt die laufenden Titel und wann die nächste Folge erscheint. Fährt man mit der Maus über ein Cover, steht dort, wie viele Folgen man **hinterher** ist. Der „Airing“-Bereich ist eine Liste kommender Folgen mit Countdown.
- **Fortschritt:** Hochzählen erzeugt einen Aktivitätseintrag im Feed. Ein „+“ am Cover bzw. in der Zeile *(eigene Kenntnis)*.
- **Passt zu uns:** „X hinterher“ entspricht unserem „N neu“. Kartenraster mit Fortschritt auf dem Cover (→ Vorschlag 1). Den sozialen Feed brauchen wir nicht.
- Quellen: [Review MAL → AniList (thecartdriver, 2021)](https://thecartdriver.wordpress.com/2021/11/04/i-switched-from-using-myanimelist-to-anilist-and-heres-a-quick-review/) · [anilist-calendar-extension (README zum Airing-Bereich)](https://github.com/rikymarche-ctrl/anilist-calendar-extension) · [Achriom: Anime-Tracker im Vergleich](https://www.achriom.com/blog/best-anime-tracking-apps/) · [AniList-Forum „Welcome to AniList“ (Aktivitäten)](https://anilist.co/forum/thread/9281) · [SaaSHub MAL vs. AniList](https://www.saashub.com/compare-myanimelist-vs-anilist)

### MyAnimeList (MAL)

- **Layout:** Dichte Tabelle mit Status-Reitern. Ein „Modern“-Listenstil, dessen Spalten man in den Listeneinstellungen ein- und ausblendet: Nummer, Score, Typ, Episoden bzw. Kapitel/Bände, Bild, Tags, Notizen, Erscheinungszeitraum, Studio usw. Viele Nutzer gestalten die Liste mit eigenem CSS.
- **Cover:** Nur als optionale Spalte „Image“ (klein).
- **Fortschritt:** Als Spalte („5 / 12“), Status als farbiger Rand bzw. Gruppen *(eigene Kenntnis)*.
- **Ruf:** Dicht und mächtig, gilt aber als veraltet („not meaningfully redesigned in a decade“).
- **Passt zu uns:** Statusfarben, wählbare Spalten und Gruppen sind stark bei Hunderten Titeln (→ Vorschlag 3). Auf dem Handy taugt die Tabelle nicht.
- Quellen: [rl404/MyAnimeList (Listen-Designs, empfohlene Spalten)](https://github.com/rl404/MyAnimeList) · [MAL „Tokyo Revengers List Designs“ (Spalten über die Listeneinstellungen)](https://mxj.myanimelist.net/liststyle_TR2022/) · [algoentremanos: MAL vs. AniList vs. Kitsu](https://algoentremanos.com/myanimelist-vs-anilist-vs-kitsu-para-seguir-manga-anime/) · [Achriom](https://www.achriom.com/blog/best-anime-tracking-apps/)

### MangaDex

- **Bibliothek:** Drei Kachelansichten, die von Stufe zu Stufe mehr Information zeigen (Inhaltsangabe, Tags). „Zuletzt gelesen“ und „neuestes Kapitel“ zeigt sie **nicht**: Nutzer wünschen sich Ungelesen-Zähler, letztes gelesenes Kapitel und Sortierung nach neuestem Kapitel. Den Fortschritt pro Titel gab es früher, in v5 fehlt er (noch).
- **Neue Kapitel:** Eigene Seite „Updates“ mit den neuesten Kapiteln gefolgter Titel, neueste oben. Ungelesene sind hervorgehoben, ein Augen-Symbol markiert ungeöffnete. Intern sind es die letzten N Kapitel, nach Titel gruppiert. Viel aktualisierte Serien verdrängen deshalb andere, und wer ein paar Tage fehlt, muss zurückblättern.
- **Handy:** Keine App, nur PWA.
- **Passt zu uns:** Neue Kapitel als Chips pro Titel (→ Vorschlag 4). Die Lehre: Die Bibliothek muss „gelesen bis“ und „neu“ zusammen zeigen, sonst braucht man zwei Seiten.
- Quellen: [Forum: „How do I know a new chapter has been released?“](https://forums.mangadex.org/threads/how-do-i-know-a-new-chapter-has-been-released-resolved.1837048/) · [Forum: „Latest chapter and last read in library?“](https://forums.mangadex.org/threads/latest-chapter-and-last-read-in-library.1754624/) · [Forum: „Make a library view which shows useful data“](https://forums.mangadex.org/threads/make-a-library-view-which-shows-useful-data-about-each-title.1185208/) · [Forum: „Base Last Updates on Titles, not Chapters“](https://forums.mangadex.org/threads/base-last-updates-on-titles-not-chapters.2520755/) · [API-Doku: Reading List vs. Follows](https://api.mangadex.org/docs/03-manga/mdlist/)

### Trakt

- **Layout (neue „Lite“-Oberfläche, 2025/26):** Zwei Smart-Listen statt „Up Next“. **Continue Watching** zeigt angefangene Serien mit der nächsten Folge, sortiert nach letzter Aktivität. **Start Watching** zeigt neu erschienene Titel der Watchlist nach Erscheinungsdatum. Oben schaltet man zwischen Media, Shows und Movies um.
- **Fortschritt:** Die eigene Seite „Progress“ (In Progress / Completed / Dropped) zeigt verbleibende Folgen und Laufzeit. Nutzer vermissen den früheren Prozentwert und die Sortierung.
- **Passt zu uns:** „Weitermachen“ als eigener Bereich, nach Aktivität sortiert und mit der nächsten Einheit (→ Vorschlag 2). Die Trennung „angefangen“ / „neu erschienen“ findet sich in Vorschlag 4 wieder. Warnung aus den Foren: Zwei halbe Seiten nerven. Eine Seite sollte alles können.
- Quellen: [Trakt-Forum: Feature Spotlight Continue/Start Watching](https://forums.trakt.tv/t/new-trakt-feature-spotlight-continue-watching-start-watching/89875) · [Trakt-Forum: Progress-Seite in der neuen UI](https://forums.trakt.tv/t/how-do-i-access-the-progress-page-in-the-new-ui/107174) · [AlternativeTo: Trakt Lite](https://alternativeto.net/news/2025/12/trakt-rolls-out-continue-watching-and-start-watching-smart-lists-in-new-lite-design/)

### Goodreads

- **Layout:** Regale (Want to Read / Currently Reading / Read). Auf der Startseite stehen die aktuell gelesenen Bücher mit „Update progress“ daneben. Laut Nutzern zeigt sie aber nur einige davon, die übrigen erreicht man über *My Books*.
- **Fortschritt:** Seite **oder** Prozent, umschaltbar. Prozent braucht eine Gesamtseitenzahl. Nur eine verknüpfte Kindle-Bibliothek aktualisiert automatisch.
- **Passt zu uns:** Fortschrittsbalken für E-Books. Das kleine Eingabefeld direkt in der Liste („gelesen bis …“) eignet sich für `Kap. ?` (→ Vorschlag 4).
- Quellen: [Goodreads-Hilfe „Update your reading progress“](https://help.goodreads.com/s/article/000001090) (ließ sich nicht abrufen, Inhalt aus dem Suchauszug) · [Librarians: „Percent done vs pages done“](https://www.goodreads.com/topic/show/2127612-percent-done-vs-pages-done) · [Librarians: Prozent braucht Seitenzahl](https://www.goodreads.com/topic/show/22250058-help-with-currently-reading-updates-please?tab=book) · [Hilfe-Frage: Fortschritt für Bücher 11–25](https://help.goodreads.com/s/question/0D58V000077hjFnSAI/how-can-i-add-progress-on-books-1125-that-i-am-reading-without-going-in-through-the-phone-app)

### Netflix („Weiterschauen“)

- **Layout:** Startseite aus horizontalen Reihen. Die Reihe „Weiterschauen“ steht meist weit oben. Seit 2025 gibt es auf dem TV den Hub „My Netflix“ mit Weiterschauen und Verlauf.
- **Reihenfolge:** Nicht nur nach Aktualität. Ein Modell sortiert die Reihe so, dass der Titel, den man wirklich startet, vorne steht. Wo die Reihe auf der Seite erscheint, hängt davon ab, ob man eher weiterschauen oder entdecken will.
- **Pflege:** Titel lassen sich mit „Aus Reihe entfernen“ herausnehmen (Computer per Hover, Handy übers Menü, TV über die Detailseite).
- **Darstellung:** Querformat-Bild mit Fortschrittsbalken darunter, „S1:F3“ und ein Play-Knopf bei Hover *(eigene Kenntnis)*.
- **Passt zu uns:** Eine Reihe „Weitermachen“ oben, die ohne Scrollen den nächsten Klick anbietet (→ Vorschlag 2). „Aus Reihe entfernen“ entspricht bei uns „Abbrechen“ bzw. dem Status.
- Quellen: [Netflix-Hilfe: Titel aus „Weiterschauen“ entfernen](https://help.netflix.com/en/node/115312) · [Tudum: neue TV-Startseite (2025)](https://netflix.com/tudum/articles/netflix-new-homepage-layout-user-guide) · [Netflix TechBlog: „To Be Continued“](https://netflixtechblog.com/to-be-continued-helping-you-find-shows-to-continue-watching-on-7c0d8ee4dab6) (Abruf blockiert, Inhalt aus dem Suchauszug)

### Randnotiz: Mihon (Android-Reader, keine Web-App)

Bibliothek in Kategorien (z. B. „Reading“, „Completed“) mit Filtern nach gelesen und Lesezeichen. Badges schaltet man im Reiter „Display“ des Filtermenüs ein. Ein Cover-Raster mit Ungelesen-Zähler oben am Cover ist das bekannteste Bild dieser App-Familie *(eigene Kenntnis)*. Quelle: [Mihon-FAQ Bibliothek](https://mihon.app/docs/faq/library)

### Was daraus für einen Ein-Nutzer-Tracker folgt

1. **Die Frage zuerst beantworten.** Netflix und Trakt stellen „weiter mit …“ an den Anfang, AniList zeigt „hinterher“. MangaDex trennt es auf zwei Seiten, und Nutzer beschweren sich darüber.
2. **„Gelesen bis“ und „neuestes“ gehören zusammen** („421 / 423“, „+2“). Diese Daten haben wir schon (`newChapters`, `latestChapter`).
3. **Soziales weglassen** (Feeds, Scores, Reviews). Das spart bei AniList, MAL und Goodreads die Hälfte der Oberfläche.
4. **Dichte bei vielen Titeln:** MAL-artige Listen skalieren auf 500 Titel, Cover-Raster nicht.
5. **Handy:** Eine Spalte mit großen Zielen. Horizontale Reihen nur innerhalb eines Bereichs (Netflix), nie für die ganze Seite.

---

## 2. Die vier Vorschläge

### 1 · Cover-Regal (`01-regal.html`)
Raster aus großen Cover-Kacheln (Desktop 6, Handy 3 Spalten). Auf dem Cover stehen Typ, „2 neu“, `Kap. 421 / 423` bzw. ein gelbes `Kap. ?`, bei E-Books ein Balken. Darunter Titel, Quelle und Zeit, „Weiterlesen ›“ und „+“. Die −/+-Knöpfe erscheinen beim Überfahren auf dem Cover. Ein Umschalter „Regal | Liste“ behält die heutige Liste. Dazu ein Ausschnitt einer Detailseite mit Cover-Kopf, großem „Weiterlesen · Kap. 422“, Stepper, Quellen und Verlauf.

### 2 · Weitermachen-Leiste (`02-weitermachen.html`)
Oben eine Reihe „Weitermachen“ wie bei Netflix und Trakt. Karten mit Cover, nächstem Kapitel als großem Knopf („Kap. 422 lesen ›“), Balken „421 / 423“ und „+“. Sortiert erst nach neuen Kapiteln, dann nach letzter Aktivität. Die Reihe scrollt nur in sich (Desktop mit Pfeilen, Handy eine Karte plus Anschnitt der nächsten). Darunter ein Hinweis „Stand prüfen“ für `Kap. ?`, dann „Alle Titel“: die heutige Liste etwas ruhiger, mit Filtern direkt darüber und der Suche im Kopf (wie SPEC §4.1).

### 3 · Tabelle mit Gruppen (`03-tabelle.html`)
Dichte, sortierbare Tabelle wie bei MAL. Status-Reiter mit Zahlen, Gruppen „Lese · 9“ und „Abgeschlossen · 1“, ein farbiger Statusstreifen links. Spalten Titel, Typ, Stand (−/+), **Neu** (`+2`, Mini-Balken, „von 423“), Quelle, Zuletzt, Weiter. Die Spalten sind wählbar („Spalten ▾“), die Filter sind Chips mit Zahl. Eine Zeile klappt zu einer Schnellansicht auf: nächstes Kapitel mit Ziel-URL, Quellen, die letzten Verlaufseinträge, Link zur Detailseite. Tastenkürzel `/`, `↑↓`, `+ −`, `Enter`. Auf dem Handy wird jede Zeile eine Karte mit zwei Zeilen.

### 4 · Was steht an? (`04-anstehend.html`)
Statt einer sortierten Liste ein Feed nach nächstem Schritt. **Neue Kapitel** zeigt Karten mit Kapitel-Chips 346 · 347 · 348 (wie MangaDex Updates) und „entdeckt vor 1 Std.“. Danach folgen **Weiterlesen** (kompakte Zeilen, E-Book mit Balken), **Stand prüfen** mit einem Eingabefeld „Gelesen bis Kap. …“ direkt in der Karte (wie Goodreads), **Ruht seit dem Import** mit „Abbrechen“ und zuletzt eingeklappt **Abgeschlossen**. Oben Zähler-Chips als Sprungmarken. Auf dem Desktop rechts ein festes Panel mit dem Ausschnitt der Detailseite des gewählten Titels. Auf dem Handy bleibt die Detailseite eine eigene Seite.

### Vergleich

| | 1 · Cover-Regal | 2 · Weitermachen-Leiste | 3 · Tabelle mit Gruppen | 4 · Was steht an? |
|---|---|---|---|---|
| **Vorbild** | AniList-Karten, Mihon-Bibliothek | Netflix/Plex „Weiterschauen“, Trakt „Continue Watching“ | MyAnimeList-Liste, MangaDex-Wünsche | MangaDex „Updates“, Trakt „Start Watching“, Goodreads „Currently Reading“ |
| **Kernidee** | Das Cover ist die Zeile, der Stand steht auf dem Bild | Die 6–8 wahrscheinlichsten nächsten Klicks stehen ganz oben, die Liste bleibt | Maximale Übersicht und Pflege für Hunderte Titel | Die Seite ist eine To-do-Liste, geordnet nach nächstem Schritt |
| **Vorteile** | Schön und schnell wiedererkennbar, gut für Titel mit echtem Bild. Gute Touch-Ziele | Beantwortet „wie komme ich weiter?“ ohne Scrollen. Kleinster Umbau, Liste und Filter bleiben. Klappt auch ohne Bilder. Auf dem Handy stark | Höchste Dichte. Sortieren nach „Neu“. Status auf einen Blick. Schnellansicht spart Seitenwechsel. Tastaturbedienung | Neue Kapitel und `Kap. ?` lassen sich nicht übersehen. Fehlende Stände füllt man direkt. Der Import wird sichtbar aufgeräumt. Detail ohne Seitenwechsel (Desktop) |
| **Nachteile** | Wenig Titel pro Bildschirm (Desktop: im ersten Bildschirm nur eine volle Reihe à 6). Viele importierte Titel ohne Bild werden zur Wand aus Initialen. Stepper versteckt (Hover). Domain und Zeit werden abgeschnitten | Titel stehen doppelt (Leiste und Liste). Die Leiste sieht nur die obersten 6–8. Auf dem Desktop ist horizontales Scrollen per Maus mäßig | Auf dem Handy nur eingeschränkt. Wirkt technisch. Aufklappen braucht Verlaufsdaten pro Zeile. Gruppen ändern den heutigen Standardfilter „Lese“ | Neues Denkmodell, kein freies Sortieren. „Weiterlesen“ wird bei 400 aktiven Titeln lang (braucht „mehr anzeigen“). Das Panel braucht eigenes Datenladen |
| **Aufwand im echten Code** | **M**: neue `WorkCard`, große `CoverThumb`-Variante mit Overlays, Ansichtswahl pro Gerät speichern | **S**: neue `ContinueRail` aus den vorhandenen `OverviewItem`s (Auswahl als reine, testbare Funktion), `latestChapter` ins Item, Balken über das vorhandene `barWidthClass` | **L**: Tabelle mit neuen Sortierungen (Stand, Neu), Statusgruppen, ausklappbare Zeilen mit nachgeladenem Verlauf, Tastatur-Fokusführung, Handy-Umbruch | **M** ohne Panel (Gruppierung als reine Funktion in `lib/overview`, Inline-Formular per Server Action), **L** mit Desktop-Panel (paralleles Route-Segment oder Client-Fetch) |

Für alle gilt: Die CSP der App verbietet Inline-Styles. Breiten von Balken gehen daher nicht per `style="width:…"` wie in den Mocks, sondern über Klassenstufen (`barWidthClass` der Statistik), `<progress>` oder SVG-Attribute. Bilder kommen weiter nur vom eigenen Server. Die Detailseite bleibt eine eigene, verlinkbare Seite (SPEC §4.2).

---

## 3. Empfehlung

**Vorschlag 2 (Weitermachen-Leiste) umsetzen und zwei Teile aus Vorschlag 4 übernehmen.**

Gründe:

- Er beantwortet die Kernfrage aus SPEC §4 („Wo stehe ich, und wie komme ich weiter?“) gleich im ersten Bildschirm, auf dem Desktop wie auf dem Handy, mit genau einem Klick.
- Er ist der kleinste Umbau. Liste, Filter, Suche, Stepper und Detailseite bleiben, wie sie sind und getestet sind. Die Leiste ist eine zusätzliche Komponente auf vorhandenen Daten (`continueLink`, `newChapters`, `lastActivity`). Die Auswahl „neue Kapitel zuerst, dann zuletzt aktiv, höchstens 8“ ist eine reine Funktion und leicht zu testen.
- Er braucht keine echten Cover. Bei vielen Titeln aus dem Excel-Import schwächelt Vorschlag 1 genau dort.
- Wer wöchentlich Manhwa liest, für den sind Titel mit neuen Kapiteln der wichtigste Einstieg. Deshalb sortiert die Leiste sie nach vorn, nicht nur nach letzter Aktivität. Diese Lücke hätte eine reine Netflix-Kopie.

Aus Vorschlag 4 übernehmen:

1. das Eingabefeld „Gelesen bis Kap. …“ für `Kap. ?`, im Hinweis „Stand prüfen“ statt nur eines Links;
2. „421 / 423“ als Balken bzw. die Kapitel-Chips, wo `latestChapter` bekannt ist.

Die Tabelle (Vorschlag 3) lohnt sich später als zweite Ansicht, falls die Pflege von Hunderten Titeln zur Hauptarbeit wird. Das Cover-Regal (Vorschlag 1) erst, wenn die meisten Titel ein echtes Bild haben.

---

## Hinweise zu den Mocks

- Statisch: Knöpfe und Filter tun nichts. Die erste Karte in Vorschlag 1 zeigt den Hover-Zustand, die erste Zeile in Vorschlag 3 ist aufgeklappt, und in Vorschlag 4 ist Overgeared gewählt.
- Die Farben der Kacheln sind für die Mocks von Hand verteilt. Die App leitet sie per Hash aus dem Titel ab (`lib/cover.ts`).
- Gesamtzahlen für Folgen (z. B. Staffellänge bei Frieren) kennt die App nicht. Die Mocks zeigen Balken deshalb nur, wo „neuestes Kapitel“ bekannt ist.
- Die Screenshots erzeugte ein kleines Playwright-Skript außerhalb des Repos (Chromium aus der vorhandenen Playwright-Installation). Es prüft auch, dass die Seite nicht seitlich scrollt und nichts von außen lädt.
