# Spike S1: Was liefern die Streaming-Apps auf der Shield?

**Frage (SPEC §8.5):** Geben Prime Video, Crunchyroll, Netflix und Disney+ über `MediaSession` Serie, Staffel und Folge preis? Davon hängt ab, ob die Shield eine Folge selbst erkennt oder ob der Verlaufs-Sync am Desktop der offizielle Weg ist.

**Timebox:** 1 Tag. **Ergebnis:** die Tabelle unten ausgefüllt, die Logs als Testdaten im Repo.

## 1. Debug-Build installieren

Der Debug-Build schreibt alle Metadaten-Felder und Wiedergabezustände **aller** Apps mit, auch der nicht freigegebenen. Er ist nur für diesen Spike gedacht.

```powershell
cd apps/shield
.\gradlew.bat assembleDebug
adb connect <shield-ip>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell cmd notification allow_listener app.rwt.shield/app.rwt.shield.MediaWatcherService
```

Danach die App einmal öffnen (Kopplung ist für den Spike nicht nötig).

## 2. Je eine Folge abspielen

In jeder App eine Serienfolge starten, ein paar Minuten laufen lassen, einmal pausieren und fortsetzen, dann per Autoplay in die nächste Folge wechseln lassen:

- [ ] Prime Video
- [ ] Crunchyroll
- [ ] Netflix
- [ ] Disney+
- [ ] zum Vergleich: ein Film in einer der Apps
- [ ] zum Vergleich: YouTube (muss später ignoriert werden)

## 3. Log abholen

```powershell
adb shell run-as app.rwt.shield cat files/spike-s1.jsonl > spike-s1.jsonl
```

Jede Zeile ist ein JSON-Objekt: `type` (`metadata` oder `playback`), `package`, die Felder (`android.media.metadata.TITLE`, `…DISPLAY_SUBTITLE`, `…DURATION` usw.) und der Zeitpunkt.

## 4. Auswerten

Pro App notieren:

| App | Paketname (tatsächlich) | Feld mit Serientitel | Feld mit Staffel/Folge (Beispielwert) | DURATION gesetzt? | Autoplay wechselt Metadaten? | Entscheidung |
|---|---|---|---|---|---|---|
| Prime Video | | | | | | |
| Crunchyroll | | | | | | |
| Netflix | | | | | | |
| Disney+ | | | | | | |

**Entscheidung pro Dienst:** Stehen Serie und Folge in den Metadaten, wird `PackageMappings` (in `apps/shield/logic`) für diese App angepasst. Fehlen sie, wird die App auf der Shield ignoriert und der Verlaufs-Sync am Desktop ist der Weg für diesen Dienst.

Zusätzlich im Browser prüfen: Hat **Disney+** im Web eine Verlaufsseite, die die Extension lesen könnte (SPEC §7.6)? Ergebnis hier notieren:

- Disney+-Verlaufsseite: …

## 5. Testdaten ablegen

Die relevanten Zeilen pro App als Datei unter `apps/shield/logic/src/test/resources/fixtures/<paketname>/` ablegen (Titel dürfen bleiben, sie sind keine Zugangsdaten). Daraus entstehen Tests für die angepassten Mappings, sodass die Erkennung gegen echte Daten geprüft ist und nicht mehr gegen erfundene (Plan A10).

Für den Verlaufs-Sync am Desktop gilt dasselbe: Der Netflix-Aktivitätenverlauf nennt vermutlich nur Folgentitel ohne Nummer. Eine gespeicherte Verlaufsseite (Rechtsklick → „Speichern unter“, ohne Kontodaten) ersetzt die erfundenen Fixtures in `apps/extension/test/history.test.ts`.
