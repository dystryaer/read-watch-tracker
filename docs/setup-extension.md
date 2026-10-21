# Browser-Extension in Brave einrichten

## 1. Bauen und laden

```bash
pnpm install
pnpm --filter @rwt/extension build
```

1. In Brave `brave://extensions` öffnen und oben rechts den **Entwicklermodus** einschalten.
2. **Entpackte Erweiterung laden** → den Ordner `apps/extension/.output/chrome-mv3` wählen.
3. Optional: Extension in der Symbolleiste anheften.

Nach einem Update erneut bauen und in `brave://extensions` auf **Neu laden** klicken.

## 2. Mit dem Tracker koppeln

1. Rechtsklick auf das Extension-Symbol → **Optionen**.
2. Adresse deines Trackers (z. B. `https://dein-tracker.vercel.app`) und einen Gerätenamen eintragen, **Koppeln** klicken.
3. Brave fragt nach Zugriff auf genau diese Adresse → erlauben.
4. Der sechsstellige Code erscheint. Im Tracker unter **Einstellungen → Gerät koppeln** eingeben (oder auf „Im Tracker öffnen“ klicken). Der Tracker zeigt, welches Gerät sich koppeln will; prüfen und **Koppeln bestätigen** klicken. Nach wenigen Sekunden zeigt die Optionsseite „Gekoppelt“.

## 3. Manga-Seiten freischalten

Die Extension läuft nur auf Seiten, die du freischaltest.

1. Ein Kapitel auf deiner Manga-Seite öffnen, auf das Extension-Symbol klicken.
2. **Diese Seite tracken** → Brave fragt nach Zugriff auf diese Seite → erlauben.
3. Ist die Seite nur umgezogen (neue Domain), stattdessen **Umzug von: …** wählen. Alle bisherigen Zuordnungen bleiben erhalten.

Ab jetzt zählt ein Kapitel, sobald du sein Ende erreichst (60 % gescrollt, letztes Bild sichtbar oder Wechsel zum nächsten Kapitel). Beim ersten Kapitel einer Serie fragt der Tracker einmal in **Zuordnungen** nach, zu welchem Titel sie gehört.

Erkennt die Extension auf einer Seite nichts oder das Falsche: im Popup **Regel bearbeiten** öffnet den Regel-Editor im Tracker (mit Live-Test).

## 4. Kapitelstände aus dem Verlauf holen

Optionen → **Verlauf der letzten 90 Tage durchsuchen**. Brave fragt nach Zugriff auf den Verlauf (nur für diesen Abgleich). Danach im Tracker unter **Zuordnungen** bestätigen, gern mit „Alle bestätigen“.

## Datenschutz

- Keine festen Host-Berechtigungen: Zugriff gibt es nur auf freigeschaltete Seiten und deinen Tracker.
- Gesendet werden nur Seitenname, Serie, Kapitel, URL und Zeitpunkt – nichts von anderen Seiten.
- Das Geräte-Token lässt sich im Tracker unter **Einstellungen → Gekoppelte Geräte** widerrufen; die Extension hört dann sofort auf zu tracken.
