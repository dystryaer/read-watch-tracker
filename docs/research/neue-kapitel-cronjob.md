# Neue Kapitel per Cronjob mit Agent? – Bewertung

Stand 2026-10-22, Anlass T49 (demonicscans fand keine neuen Kapitel). Nur bewertet, nichts eingerichtet.

**Frage:** Ließe sich die Prüfung auf neue Kapitel „ganz einfach mit einem Cronjob mit einem Agenten“ lösen? Gemeint ist ein täglich geplanter Claude-Agent, der die Serienseiten liest und neue Kapitel an den Tracker meldet.

**Kurz:** Als Ersatz für die Extension nein. Als gelegentliche Reparatur, die eine Seitenregel vorschlägt, ja, aber auf Abruf und nicht als Cronjob. Der Fehler bei demonicscans lag nicht am Mechanismus: Die Serien-URL war falsch und die Kapitel-Links hatten eine andere Form. Ein Agent liest dieselben Seiten. Er würde das Problem bei jedem Lauf neu „verstehen“ müssen, mit Tokenkosten und ohne Gewähr.

## Varianten

**(a) Lokaler geplanter Agent** (geplante Aufgabe in Claude Code oder der Desktop-App), der Seiten per Abruf oder Browser liest
- Ablauf: `GET /series-watch` → jede Serienseite lesen → höchstes Kapitel bestimmen → `POST /latest-chapters`.
- Zuverlässigkeit: mittel. Das Modell liest Zahlen nicht deterministisch (200.5 oder 205, Kapitel aus der Seitenleiste). Läufe fallen aus bei Updates, abgelaufener Anmeldung oder erreichtem Nutzungslimit.
- Kosten (Schätzung bei rund 50 Serien): Ein Seitenabruf bringt nach der Aufbereitung etwa 1–5 k Tokens in den Kontext. Pro Lauf wächst der Kontext so auf 100–250 k Tokens; über die Runden summiert, liest das Modell ein Mehrfaches davon (größtenteils gecacht). Mit Browser-Snapshots einer langen Kapitelliste (2 000 Links) kommen pro Seite eher 10–20 k Tokens dazu. Das ist jeden Tag ein spürbarer Teil des Abo-Kontingents, bei API-Abrechnung echtes Geld. Die Extension braucht dafür 0 Tokens.
- Einrichtung: Geräte-Token vom Typ `extension` (nur dieser darf `/series-watch` lesen). Der Agent bräuchte ihn im Klartext in seiner Aufgabe. Dazu müssen der PC an sein, `pnpm start` und Claude laufen und angemeldet sein.
- Datenschutz: Meine Leseliste (Serien-URLs) und die Seiteninhalte gehen täglich ans Modell. Heute bleibt beides auf dem Rechner.
- JavaScript und Bot-Schutz: Ein Abruf sieht dasselbe wie die Extension. Ein Browser könnte JavaScript-Listen rendern, Challenges darf er aber nicht lösen (§16, und Agenten lösen keine Captchas). Der Vorteil wäre klein und teuer.

**(b) Cloud-Routine** (geplanter Agent in der Cloud)
- Er erreicht den Tracker nicht: `pnpm start` lauscht nur auf `127.0.0.1` (§19 Punkt 2). Dafür müsste die API ins Netz, mit HTTPS-Zugang oder Tunnel. Das wäre neue Angriffsfläche für den einzigen Zweck, ein Badge zu setzen.
- Rechenzentrums-IPs bekommen bei Cloudflare häufiger eine Challenge als ein Heim-Browser. Die Leseliste müsste in der Cloud liegen.
- Ergebnis: ohne geöffneten Tracker nicht machbar. Möglich wäre nur ein Bericht, den ich von Hand übernehme.

**(c) Deterministisches Skript per Windows-Aufgabenplanung, ohne LLM**
- Ein Node-Skript mit demselben Code (`latestChapterIn`) spricht die API über ein Geräte-Token an. Die Datenbank direkt geht nicht, solange der Tracker läuft (Sperrdatei, T45).
- Zuverlässigkeit wie die Extension, 0 Tokens, alles lokal.
- Nachteile: Node verschickt einen anderen User-Agent und TLS-Fingerabdruck als Brave, Bot-Schutz greift also eher. Ihn anzugleichen wäre Umgehen und ist ausgeschlossen. Zusätzlich ein zweiter Weg mit eigenem Token, eigener Planung und eigenem Fehlerbild.
- Gewinn: Prüfungen auch bei geschlossenem Brave. Das ist laut §18 ausdrücklich kein Ziel.

**(d) Agent nur als Reparatur-Job**
- Er läuft, wenn die normale Prüfung bei einer Seite nichts findet (404, kein Kapitel-Link, Fund unter meinem Stand). Er schaut sich die Seite einmal an und schlägt eine Seitenregel vor, z. B. `seriesUrlTemplate` und `chapterLinkPattern`, also genau das, was für demonicscans nötig war. Ich prüfe den Vorschlag im Live-Test des Regel-Editors. Danach läuft alles wieder deterministisch über die Extension.
- Kosten nur im Bedarfsfall, etwa nach einem Redesign, mit einmalig rund 50–150 k Tokens. Das Ergebnis sind Daten statt Code (§2.7, §16).
- Voraussetzung, damit ich den Bedarf sehe: Heute merkt nur die Extension, dass eine Prüfung scheitert (Pause von 7 Tagen); der Tracker erfährt davon nichts. Ein Hinweis „Serienseite liefert 404 / keine Kapitel“ in der Web-App wäre eine kleine Erweiterung, ändert aber den API-Vertrag und ist damit freigabepflichtig. Bis dahin genügt es, Claude Code bei Bedarf von Hand zu fragen.

**(e) Heutiger Weg über die Extension** (§7.11)
- Deterministisch, 0 Tokens, lokal. Sie nutzt nur Hosts, die ich freigeschaltet habe, hat Brave-Fingerabdruck und Pausen bei Challenges.
- Grenzen: Sie prüft nur, solange Brave läuft. Seiten, die ihre Liste per JavaScript laden, liefern nichts. Sie braucht die richtige Seitenregel, die mit T49 für abweichende Serienseiten und Kapitel-Links nun möglich ist.

## Vergleich

| | Zuverlässigkeit | Tokens/Tag | Einrichtung | Datenschutz | JS / Bot-Schutz |
|---|---|---|---|---|---|
| (a) lokaler Agent | mittel, nicht deterministisch | hoch (100 k bis über 1 Mio.) | Token im Klartext, PC + Tracker + Claude an | Leseliste geht ans Modell | Browser rendert JS, Challenges bleiben zu |
| (b) Cloud-Routine | erreicht Tracker nicht | hoch | API ins Netz | Liste in der Cloud | mehr Challenges |
| (c) Skript + Aufgabenplanung | hoch | 0 | Token, Aufgabe, PC an | lokal | kein JS, eher geblockt |
| (d) Reparatur-Agent | hoch (Regel wird geprüft) | 0, selten einmalig | keine bzw. später Status-Hinweis | einmalig eine Seite | wie (a), nur einmal |
| (e) Extension | hoch | 0 | vorhanden | lokal | kein JS, Pause bei Challenge |

## Konflikt mit der Spec

- §18 nennt „Prüfungen … ohne laufenden Browser“ ausdrücklich als Nicht-Ziel. (a) bis (c) bräuchten eine Spec-Änderung.
- §16 verbietet das Umgehen von Bot-Schutz. Ein Agent mit Browser müsste an jeder Challenge aufhören, ein Skript dürfte keinen Browser vortäuschen.
- §16 „Geräte-Tokens nie im Klartext speichern“: Ein geplanter Agent oder ein Skript hielte das Token in seiner Konfiguration.
- (b) widerspricht dem lokalen Betrieb (§2.3, §18 „Cloud-Hosting“).

## Empfehlung

Die Extension bleibt der Mechanismus (e). Seiten, die von der Norm abweichen, werden über Seitenregeln repariert (dieser PR). Ein Agent kommt als Reparatur-Helfer (d) auf Abruf dazu: Findet eine Seite nichts, lasse ich Claude Code einmal eine Regel vorschlagen und prüfe sie im Live-Test. Einen täglichen Agenten (a, b) empfehle ich nicht. Er kostet jeden Tag Tokens, liefert schwankende Ergebnisse und gibt die Leseliste heraus, löst aber weder JavaScript-Listen noch Bot-Schutz besser. Ein Skript per Aufgabenplanung (c) lohnt sich erst, wenn Prüfungen ohne Brave wirklich gewünscht sind, und dann nur nach einer Änderung von §18.
