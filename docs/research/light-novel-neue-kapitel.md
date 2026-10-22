# Neue Kapitel bei Light Novels erkennen (WebNovel)

**Stand:** 22.10.2026 · Recherche, kein Code geändert.
**Frage:** Woher erfährt der Tracker, dass es bei Light Novels, die ich in der WebNovel-App auf dem iPhone lese, neue Kapitel gibt? Bei Manga, Manhwa und Manhua prüft das die Extension einmal am Tag auf der Serienseite (SPEC §7.11).

**Methode:** Websuche; einzelne öffentliche Seiten abgerufen, mit `curl` sowie im eingebauten Browser per `fetch` ohne Cookies und ohne Weiterleitungen, also so, wie §7.11 abruft. Kein Login, keine Formulare, keine Cookie-Zustimmung, keine Captchas. Stichprobe: *Shadow Slave* (WebNovel-Original). Was nicht geprüft werden konnte, ist mit **⚠ nicht geprüft** markiert.

## Kurzfassung

- **Die öffentliche WebNovel-Buchseite nennt die Kapitelzahl im HTML**, ohne JavaScript: `<span>3,223 Chapters</span>` und im eingebetteten JSON `"chapterNum":3223` sowie `"updateTime"`. Damit kann die Extension WebNovel-Bücher einmal am Tag prüfen wie Manga-Serienseiten. Dafür braucht es einen kleinen WebNovel-spezifischen Leser, denn WebNovel-Kapitel-URLs enthalten keine Kapitelnummer, und `latestChapterIn` findet dort deshalb nichts.
- **Die WebNovel-Bibliothek zeigt vermutlich „Progress X/Y“ und einen Update-Punkt je Buch.** Das ist aus der abgemeldeten Seite `/library` abgeleitet, nicht am echten Konto geprüft. Dann könnte der Bibliotheks-Sync (§9.1) Lesestand und neueste Kapitelzahl in einem Schritt liefern.
- **Discord-Bot:** Der passende Bot heißt *WebNovel Updates* bzw. *Novel Updates* (Entwickler „proddy“). Er postet neue Kapitel in einen Discord-Kanal. Der Tracker käme an diese Meldungen nur über einen **eigenen** Discord-Bot mit Token, der den Kanal per API liest. Discord hat keine ausgehenden Webhooks für Kanalnachrichten. Das bedeutet viel Einrichtung, eine Abhängigkeit von einem Hobby-Bot mit undokumentierter Datenquelle und ein gespeichertes Token. Nicht empfohlen.
- **RSS:** WebNovel hat einen seitenweiten Feed, er ist aber ungeeignet: 9,4 MB, nur Übersetzungen in andere Sprachen, eine Woche alt. Einen Feed pro Buch gibt es nicht. NovelUpdates liegt hinter einer interaktiven Cloudflare-Prüfung und ist damit nach §16 ausgeschlossen.

## Befunde

### 1. WebNovel-Bibliothek im Browser

- Die abgemeldete Seite `https://www.webnovel.com/library` enthält das CSS der echten Bibliotheksliste. `.lib-books ._update:before` zeichnet einen 6-px-Punkt in der Akzentfarbe neben ein Buch, also einen **Update-Hinweis**. Die Demo-Karte zeigt **„Progress 0/150“ → „Progress 23/150“**, also gelesen/gesamt.
- **⚠ nicht geprüft:** Wie die angemeldete Bibliothek wirklich aussieht, ob sie bei jedem Buch „Progress X/Y“ zeigt und ob X die Kapitelnummer oder die Anzahl gelesener Kapitel ist. Das gehört zu Spike S2.
- Folge für den Code: Der Adapter `apps/extension/src/library/pages.ts` sucht heute „Chapter N“ bzw. „Kapitel N“. „Progress 23/150“ würde er nicht erkennen. Das muss S2 ohnehin klären.

### 2. Öffentliche WebNovel-Buchseiten

| Abruf (ohne Cookies, ohne Weiterleitungen) | Ergebnis |
|---|---|
| `curl` auf `/book/shadow-slave_22196546206090805` | **403, Cloudflare-Challenge** (`cf-mitigated: challenge`, „Just a moment…“) |
| `fetch` im echten Browser, gleiche URL | **200**, ca. 0,3 MB, keine Challenge. Enthält `<span>3,223 Chapters</span>`, `"chapterNum":3223`, `"updateTime":…`, `og:updated_time` und JSON-LD `dateModified` |
| `/book/22196546206090805` (ohne Slug) | 200, aber **ca. 3,6 MB**, also über der 2-MB-Grenze aus §7.11 |
| Slug, der nicht der aktuelle ist (Stichprobe), sowie `/book/<slug>_<id>/catalog` | **Weiterleitung** (§7.11 überspringt sie) |
| `/book/<id>/catalog` (Inhaltsverzeichnis) | 200, **ca. 2,0 MB** bei 3.202 Kapiteln, also schon an der Grenze. Nummeriert bis **3202** |

- **Bot-Schutz:** Cloudflare ist aktiv. Ein schlichter Abruf aus einem echten Chromium kam durch, `curl` nicht. **⚠ nicht geprüft:** der Abruf aus dem Service Worker der Extension. Kommt eine Challenge, greift die bestehende Regel aus §7.11: überspringen, 7 Tage Pause, nichts umgehen.
- **Kapitelzahl und Kapitelnummer unterscheiden sich:** Die Buchseite nennt 3.223 Kapitel, das öffentliche Inhaltsverzeichnis endet bei Nummer 3202. Vermutlich zählen Vorab-Kapitel für Privilege-Abonnenten mit, denn das Buch hat `hasPrivilege`. **⚠ nicht geprüft.** Wird mein Stand als Kapitelnummer gespeichert, zeigte das Badge (§4.2: `floor(latest) − floor(chapter)`) dauerhaft „21 neu“. Die Quelle für „neuestes Kapitel“ muss also zur Zählweise meines Stands passen.
- **RSS:** Die Buchseite verlinkt keinen Feed. `robots.txt` sperrt `/rssbook`, und `/rssbook/<id>` liefert 404.
- **Heutiger Code:** `seriesToWatch` (`packages/server/src/latest.ts`) liefert nur Quellen mit `kind = 'website'`. WebNovel ist `kind: "app"` (`packages/core/src/services.ts`). `webnovel.com` ist aber schon fest im Manifest (§7.2), es käme also keine neue Berechtigung hinzu.

### 3. WebNovel-Feed

`https://www.webnovel.com/feed` leitet weiter auf `https://webbackend.webnovel.com/feed/feed.xml` (anderer Host). Der Feed ist RSS 2.0 mit **9,4 MB** und rund 22.600 Einträgen zu etwa 1.065 Büchern. Alle Einträge haben die Kategorie **„Translation“**: Übersetzungen ins Russische, Japanische, Arabische, Deutsche und andere Sprachen. Der Feed deckt nur etwa zwei Tage ab, `lastBuildDate` war der 15.10.2026, also eine Woche alt. *Shadow Slave* fehlt. Die Links zeigen auf das gesperrte `/rssbook/…`. **Ungeeignet.** Eine ältere Anleitung auf WebNovel selbst filtert genau diesen Feed per Discord-RSS-Bot nach Titel. Das funktioniert heute nicht mehr sinnvoll.

### 4. Discord-Bots

| Bot | Was | Datenquelle |
|---|---|---|
| **WebNovel Updates** / „Novel Updates“ (top.gg-ID `830199082211344394`, Entwickler *proddy*, Website `webnovelupdates.zhbot.org`) | Kapitelmeldungen für WebNovel (Romane, Comics, Fanfics), Royal Road, Wattpad und Wuxiaworld. Bei WebNovel außerdem Geschenke, Power-Stones und Golden Tickets. Einrichtung: einladen, im Kanal `/webnovel trackreleases novel <Buch> [Nachricht]`, Auswahl per Autovervollständigung. Rechte: Kanal sehen, senden, Links einbetten, erwähnen. Kostenlos, Spenden. | **⚠ nicht dokumentiert.** Vermutlich ruft der Bot WebNovel selbst ab; ob über eine inoffizielle API, ist unbekannt. Auch das Nachrichtenformat ist nicht dokumentiert, etwa ob die Meldung einen Buch-Link mit ID oder eine Kapitelnummer enthält. |
| Generische RSS-Bots (z. B. MonitoRSS, früher „Discord.RSS“) | posten Feed-Einträge in einen Kanal | nur so gut wie der Feed; für WebNovel gibt es keinen brauchbaren (siehe 3) |
| Manhwa Updates u. a. | Manga, Manhwa, Manhua | keine Light Novels |

**Wie der Tracker Discord nutzen könnte:**

- **Webhook-Weiterleitung geht nicht.** Discord-Webhooks schreiben nur *in* einen Kanal. Die ausgehenden „Webhook Events“ enthalten kein `MESSAGE_CREATE` für Server-Kanäle. Außerdem lauscht der Tracker nur auf `127.0.0.1` (§19, offene Frage 2) und wäre für Push von außen gar nicht erreichbar.
- **Einziger zulässiger Weg: ein eigener Bot.** Dafür legst du im Discord Developer Portal eine App mit Bot an und schaltest den privilegierten **Message Content Intent** ein. Ohne ihn sind `content` und `embeds` leer, auch über die REST-API. Für eine kleine private App lässt er sich ohne Verifizierung im Portal einschalten; erst ab 100 Servern ist eine Verifizierung nötig. Den Bot lädst du mit „Kanal ansehen“ und „Nachrichtenverlauf lesen“ in den Kanal ein, in den *WebNovel Updates* postet. Der Tracker-Server holt dann `GET /channels/{id}/messages?after=<letzte ID>` (höchstens 100 pro Abruf), etwa beim Start und einmal am Tag. Das Token liegt als Umgebungsvariable, nie im Repo. Eine neue Abhängigkeit braucht es nicht, `fetch` reicht.
- **Verboten:** das eigene Discord-Benutzerkonto zu automatisieren („Self-Bot“) oder Discord im Browser über die Extension auszulesen.
- **Konflikte mit der Spec:** Das Token ist ein gespeicherter Zugang zu einem Drittanbieter (§16 „Erst fragen“; §18 schließt „inoffizielle Anbieter-APIs mit gespeicherten Zugangsdaten“ aus; die Discord-API ist offiziell, die Datenquelle des Bots aber unklar). Der Server würde selbst nach außen abfragen, auch ohne laufenden Browser. Das berührt das Nicht-Ziel „Prüfungen … ohne laufenden Browser“ (§18) und ist ein neues Muster, denn bisher holt nur die Extension Daten.
- **Zuordnung:** Enthält die Meldung einen WebNovel-Link, findet `parseWebnovelBookId` das Werk direkt. Sonst bleibt nur der Titel, und das bedeutet Inbox-Karten.

### 5. NovelUpdates und andere Feeds

- `novelupdates.com` (Serienseiten und `rss.php`) und das NovelUpdates-Forum liegen hinter Cloudflare. `curl` bekommt eine Challenge (403). Im echten Browser erscheint eine **interaktive Prüfung** („Bestätigen Sie, dass Sie ein Mensch sind“). Die Extension würde nach §7.11 überspringen, und Umgehen ist nach §16 verboten.
- Es gibt einen persönlichen **Leselisten-RSS** (`rss.php?uid=…&unq=…&type=…`, Link auf der Leselisten-Seite). Dafür brauchst du ein NovelUpdates-Konto und musst dort eine zweite Leseliste pflegen. Laut Forum ist die Funktion zeitweise ausgefallen. **⚠ nicht geprüft:** ob dieser Feed ohne Challenge abrufbar ist.
- **Abdeckung:** NovelUpdates verzeichnet vor allem übersetzte asiatische Web- und Light Novels samt Releases der Übersetzergruppen. **⚠ nicht geprüft:** ob WebNovel-Originale (englisch, z. B. *Shadow Slave*) und offizielle WebNovel-Übersetzungen mit aktuellen Kapiteln geführt werden; die Seiten waren nicht lesbar.

### 6. Manuell und halbautomatisch

Kurzbefehl (§9.4) und Schnell-Update (§9.3) liefern **meinen Lesestand**, nicht das neueste Kapitel. Der Kurzbefehl könnte zusätzlich nach „neuestes Kapitel?“ fragen. Das kostet einen Tap mehr und ist nur so aktuell wie meine letzte Eingabe. Die WebNovel-App zeigt neue Kapitel ohnehin selbst. Als Quelle für das Badge taugt der Weg kaum. **⚠ nicht geprüft:** was „Teilen“ aus der App übergibt (S2, Teil 2).

## Optionstabelle

| Option | Zuverlässigkeit | Aufwand (Bau) | Einrichtung für dich | Datenschutz | SPEC §16 | Passt zur Architektur |
|---|---|---|---|---|---|---|
| **A: Bibliotheks-Sync liefert auch „Y“ aus „Progress X/Y“** | mittel: nur so aktuell wie dein letzter Besuch der Bibliothek (Erinnerung nach 7 Tagen); Markup unbestätigt | klein: Adapter erweitern, `latest_chapter` auch für die App-Quelle WebNovel annehmen | keine (S2 durchführen) | sehr gut: keine zusätzlichen Requests; liest nur, was dir angezeigt wird | ok, Erweiterung eines bestehenden Adapters (§7.6) | ja |
| **B: Buchseite 1×/Tag durch die Extension** | mittel bis hoch: täglich, direkt von der Quelle; Risiken sind Cloudflare, Slug-Weiterleitungen und die Zählweise (Privilege) | mittel: WebNovel in `series-watch`/`latest-chapters` aufnehmen, `series_url` mit Slug speichern, Leser für `"chapterNum"`, Fixture-Tests | keine | gut: GET ohne Cookies, nur `webnovel.com` | **Erst fragen:** neuer Code-Adapter; keine neue Berechtigung, kein Umgehen | ja, genau §7.11 |
| **C: Discord (WebNovel-Updates-Bot + eigener Lese-Bot)** | mittel: hängt an einem Hobby-Bot mit unbekannter Quelle und unbekanntem Format | mittel bis hoch: Discord-Client im Server, Parser für ein unbekanntes Format, Token-Verwaltung | hoch: Discord-Server, Bot einladen und jedes Buch einzeln tracken, eigene Bot-App mit Intent anlegen, Token und Kanal-ID hinterlegen | schwächer: Discord und der Bot-Betreiber sehen deine Liste; Token gespeichert | **Erst fragen:** neue Integration, gespeichertes Token, Server ruft Dritte ab | eher nein: Server-Polling ohne Browser (§18) |
| **D: Discord-Webhook-Weiterleitung** | – | – | – | – | – | **nicht möglich** (keine ausgehenden Webhooks; Tracker nicht von außen erreichbar) |
| **E: WebNovel-Feed `/feed`** | niedrig: veraltet, nur Fremdsprachen-Übersetzungen | – | – | – | anderer Host = neue Berechtigung; `robots.txt` sperrt die Links | nein (9,4 MB) |
| **F: NovelUpdates (Seiten bzw. Leselisten-RSS)** | niedrig: interaktive Cloudflare-Prüfung; Abdeckung der WebNovel-Originale unklar | mittel | NovelUpdates-Konto, zweite Leseliste pflegen | schwächer: persönlicher Feed-Link | **Bot-Schutz:** nicht zulässig | nein |
| **G: Kurzbefehl bzw. Schnell-Update mit „neuestes Kapitel?“** | niedrig: so aktuell wie deine Eingabe | klein | jedes Mal eintippen | sehr gut | ok | ja, aber ohne Nutzen gegenüber der App |

## Empfehlung

**B als Hauptweg, vorbereitet durch Spike S2 und ergänzt um A. Kein Discord.**

1. **Zuerst Spike S2** (angemeldete Bibliothek speichern), mit drei Zusatzfragen: Zeigt jede Karte „Progress X/Y“? Gibt es den Update-Punkt? Ist X die Kapitelnummer aus dem Kapiteltitel oder die Zahl gelesener Kapitel? Davon hängt ab, welche Zahl als „neuestes Kapitel“ zum gespeicherten Stand passt. Sonst zeigt das Badge falsche „neu“-Zahlen.
2. **A** baut man mit, weil es fast nichts kostet: Wer die Bibliothek öffnet, bekommt Stand und Gesamtzahl aus derselben Quelle mit derselben Zählweise.
3. **B** macht das Badge täglich aktuell, ohne dass du etwas tun musst. Es nutzt genau den Mechanismus aus §7.11 und braucht keine neue Berechtigung. Gelesen wird gezielt `"chapterNum"`, ersatzweise `N Chapters` aus der Buchseite `/book/<slug>_<id>` (ca. 0,3 MB). Nicht gelesen werden `/book/<id>` (3,6 MB) und das Inhaltsverzeichnis (2 MB). Weiterleitungen und Challenges werden wie bisher übersprungen. Vor dem Bau einmal aus der Extension selbst prüfen, ob Cloudflare den Abruf durchlässt.
4. **C nicht bauen.** Der Discord-Weg bringt dieselbe Information über zwei fremde Dienste und einen undokumentierten Hobby-Bot. Er braucht ein gespeichertes Token, ein Server-Polling außerhalb der Architektur und viel Einrichtung bei dir. Sinnvoll wäre er nur als Rückfall, falls WebNovel die Buchseiten für die Extension dauerhaft per Challenge sperrt. Auch dann bliebe offen, woher der Bot seine Daten hat.

## Was du entscheiden oder liefern musst

1. **Freigabe für B** (§16 „Erst fragen“): ein neuer Code-Adapter „WebNovel-Buchseite“ für die tägliche Prüfung, dazu `series-watch` und `latest-chapters` auch für die App-Quelle WebNovel. Das ändert §7.11, das bisher nur freigeschaltete Websites prüft.
2. **Spike S2 durchführen** und die drei Zusatzfragen oben beantworten. Die gespeicherte Bibliotheksseite (ohne Kontodaten) dient als Testfall.
3. **Hast du WebNovel-Privilege-Abos?** Dann wären Vorab-Kapitel für dich lesbar, und die Gesamtzahl der Buchseite passt eher.
4. **Nur falls du Discord trotzdem willst:** Name des Bots (*WebNovel Updates* von proddy oder ein anderer?), Name des Discord-Servers, auf dem er für dich postet (deiner oder ein fremder?), ein Screenshot einer Kapitelmeldung und deine Bereitschaft, eine eigene Bot-App anzulegen und ihr Token beim Tracker zu hinterlegen.
5. **Liest du Light Novels auch außerhalb von WebNovel**, etwa auf Übersetzerseiten im Browser? Die deckt §7.11 schon heute ab, sobald die Seite freigeschaltet ist.

## Nicht geprüft

- Die **angemeldete** WebNovel-Bibliothek: nur aus der abgemeldeten Seite abgeleitet, kein Login.
- Der Abruf der Buchseite **aus dem Service Worker der Extension**. Geprüft wurde nur im Browserfenster per `fetch` ohne Cookies; Cloudflare kann anders entscheiden.
- Die Bedeutung von `chapterNum` (Privilege-Vorabkapitel oder Hilfsband) und ob sie zu deinem Stand passt.
- Nur ein Buch (*Shadow Slave*, WebNovel-Original) wurde untersucht; keine Übersetzung, kein abgeschlossenes Buch.
- Beim Discord-Bot: Datenquelle, Nachrichtenformat, Abfrageintervall und Zuverlässigkeit. Er wurde nicht eingeladen.
- Bei NovelUpdates: alle Seiten, der Leselisten-RSS und die Abdeckung. Alles liegt hinter einer Cloudflare-Prüfung, die nicht umgangen wurde.
- Die Nutzungsbedingungen von WebNovel zu automatisiertem Abruf; sie wurden nicht gefunden.
- Was „Teilen“ aus der iPhone-App übergibt (S2, Teil 2).

## Quellen

- WebNovel-Buchseite *Shadow Slave*: <https://www.webnovel.com/book/shadow-slave_22196546206090805> und Inhaltsverzeichnis <https://www.webnovel.com/book/22196546206090805/catalog> (abgerufen am 22.10.2026)
- WebNovel-Bibliothek, abgemeldet: <https://www.webnovel.com/library>
- WebNovel `robots.txt`: <https://www.webnovel.com/robots.txt>
- WebNovel-Feed: <https://www.webnovel.com/feed>, weitergeleitet auf <https://webbackend.webnovel.com/feed/feed.xml>
- Ältere Anleitung „Integrating Your Novel RSS feed For Discord Channel Update!“ (auf WebNovel): <https://www.webnovel.com/book/inkstone-system!_11403825006352405/integrating-your-novel-rss-feed-for-discord-channel-update!_30617558948300217>
- Bot *WebNovel Updates* auf top.gg: <https://top.gg/bot/830199082211344394>
- Bot-Website und Anleitung: <https://webnovelupdates.zhbot.org/>, <https://webnovelupdates.zhbot.org/Tutorial>; Datenschutz: <https://zhbot.org/PrivacyPolicy.aspx>
- Discord, Message Content Intent: <https://docs.discord.com/developers/events/gateway#message-content-intent>
- Discord, Webhook Events: <https://docs.discord.com/developers/events/webhook-events>
- Discord, Get Channel Messages: <https://docs.discord.com/developers/resources/message#get-channel-messages>
- Discord, Automated User Accounts (Self-Bots): <https://support.discord.com/hc/en-us/articles/115002192352>
- NovelUpdates-Feed (Cloudflare-Challenge): <https://www.novelupdates.com/rss.php>
- NovelUpdates-Forum zum Leselisten-RSS (nur aus Suchergebnissen, Seiten hinter Cloudflare): <https://www.novelupdatesforum.com/threads/rss-from-reading-list-is-not-working.67323/>, <https://www.novelupdatesforum.com/blogs/reading-lists-rss.1436/>
- Firefox-Add-on „Novelupdates RSS reader“: <https://addons.mozilla.org/en-US/firefox/addon/novelupdates-rss-reader/>
