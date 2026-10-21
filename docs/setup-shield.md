# Nvidia Shield einrichten

Die Shield-App liest mit, was in Prime Video, Crunchyroll, Netflix und Disney+ läuft, und meldet gesehene Folgen an deinen Tracker (SPEC §8). Sie wird einmal per adb installiert und läuft danach ohne dein Zutun, auch nach einem Neustart.

> **Stand:** Welche Metadaten die Apps auf der Shield wirklich liefern, klärt erst Spike S1 ([Anleitung](spikes/s1-shield-metadata.md)). Bis dahin ist die Erkennung gegen erfundene Beispieldaten gebaut. Was die App nicht lesen kann, zeigt sie unter „Nicht erkannt“; dafür bleibt der Verlaufs-Sync am Desktop (SPEC §7.6).

## Voraussetzungen

- Der Tracker ist per **https** erreichbar (Vercel oder eigener Server mit Caddy/Traefik). Über http verbindet sich die App nicht, damit das Geräte-Token nie unverschlüsselt durchs Netz geht.
- Auf deinem Rechner: die Android-Platform-Tools (`adb`). Mit dem Android-SDK unter `%LOCALAPPDATA%\Android\Sdk` liegen sie in `platform-tools\`.
- Die APK: `apps/shield/app/build/outputs/apk/release/app-release.apk` (bauen mit `.\gradlew.bat assembleRelease` in `apps/shield`).

## 1. Shield vorbereiten (einmalig)

1. Auf der Shield: **Einstellungen → Geräteeinstellungen → Info → Build** siebenmal auswählen. Damit sind die Entwickleroptionen frei.
2. **Einstellungen → Geräteeinstellungen → Entwickleroptionen → Netzwerk-Debugging** einschalten. Die Shield zeigt ihre IP-Adresse an.

## 2. App installieren

```powershell
adb connect <shield-ip>:5555
adb install -r app-release.apk
```

Beim ersten `adb connect` fragt die Shield, ob sie deinem Rechner vertraut. Mit „Immer erlauben“ bestätigen.

## 3. Medienzugriff freigeben

Android TV hat für diese Berechtigung keinen Einstellungsdialog, deshalb einmal per adb:

```powershell
adb shell cmd notification allow_listener app.rwt.shield/app.rwt.shield.MediaWatcherService
```

Die App nutzt die Berechtigung nur, um die laufenden Mediensitzungen zu sehen. Benachrichtigungen liest sie nicht.

## 4. Mit dem Tracker koppeln

1. Die App „Read-Watch-Tracker“ auf der Shield öffnen und die Adresse deines Trackers eingeben. Schneller geht es von deinem Rechner aus:

   ```powershell
   adb shell am start -n app.rwt.shield/.MainActivity --es apiUrl https://dein-tracker.vercel.app
   ```

2. Die App zeigt einen sechsstelligen Code und einen QR-Code.
3. Den QR-Code mit dem Handy scannen (oder im Tracker **Einstellungen → Gerät koppeln** den Code eingeben). Der Tracker zeigt, welches Gerät sich koppeln will („Shield · Nvidia Shield · angefragt gerade eben“); prüfen und **Koppeln bestätigen**.
4. Nach wenigen Sekunden zeigt die Shield den Statusscreen: **Gekoppelt ✓** und **Medienzugriff ✓**.

## Statusscreen

| Zeile | Bedeutung |
|---|---|
| Gekoppelt ✓ | Die App hat ein gültiges Geräte-Token. Wird es im Tracker widerrufen, koppelt sie neu. |
| Medienzugriff ✓/✗ | Ob Schritt 3 erledigt ist. Bei ✗ steht der adb-Befehl darunter. |
| Outbox | Gesehene Folgen, die noch nicht beim Tracker sind (z. B. ohne Netz). Sie werden automatisch nachgesendet. |
| Letzte Ereignisse | Die letzten zehn gezählten Folgen. |
| Nicht erkannt | Was eine der vier Apps gespielt hat, ohne dass eine Folgennummer lesbar war. |

## Wann zählt eine Folge?

Sobald 85 % der Laufzeit gesehen sind, einmal pro Folge. Springt die App per Autoplay zur nächsten Folge, wird die vorherige noch einmal bewertet. Clips unter einer Minute (Trailer, Vorschauen) zählen nie. YouTube, Musik und alle anderen Apps werden ignoriert.

## Aktualisieren, widerrufen, entfernen

- **Update:** neue APK bauen und wieder mit `adb install -r app-release.apk` installieren. Kopplung und Outbox bleiben erhalten.
- **Widerrufen:** im Tracker unter **Einstellungen → Gekoppelte Geräte**. Die Shield verwirft ihr Token dann beim nächsten Senden.
- **Entfernen:** `adb uninstall app.rwt.shield`.

## Fehlersuche

| Problem | Lösung |
|---|---|
| „Der Tracker ist nicht erreichbar“ | Adresse prüfen (https, ohne Pfad), Netz der Shield prüfen. |
| Medienzugriff bleibt ✗ | Befehl aus Schritt 3 erneut ausführen; Paketname exakt übernehmen. |
| Folgen tauchen nicht auf | Statusscreen: Steht die Folge unter „Nicht erkannt“, liefert die App keine Folgennummer → Spike S1, Verlaufs-Sync am Desktop nutzen. Steht sie in der Outbox, fehlt die Verbindung zum Tracker. |
