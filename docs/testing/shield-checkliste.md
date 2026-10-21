# Abnahme Shield (manuell)

Die Logik der Shield-App ist mit JVM-Tests abgedeckt (`apps/shield/logic`, `.\gradlew.bat test`). Was nur auf dem echten Gerät prüfbar ist, steht hier (SPEC §8.6). Voraussetzung: [Einrichtung](../setup-shield.md) erledigt, Spike S1 ausgewertet.

| # | Prüfung | Erwartung | ✓ |
|---|---|---|---|
| 1 | Eine Folge in einer gemappten App zu ≥ 85 % sehen | Steht ≤ 2 min später in der Web-App (bzw. als Inbox-Karte bei einer neuen Serie) | |
| 2 | Dieselbe Serie vorher am Desktop bestätigt, dann auf der Shield weitersehen | Landet ohne neue Inbox-Karte auf **demselben** Werk | |
| 3 | Folge nach 50 % abbrechen | Kein Ereignis | |
| 4 | Autoplay in die nächste Folge bei > 85 % | Vorherige Folge zählt, genau einmal | |
| 5 | Musik (z. B. Spotify) und YouTube abspielen | Keine Ereignisse, nichts unter „Nicht erkannt“ | |
| 6 | Shield neu starten, danach eine Folge sehen | Wird ohne Zutun gezählt (Listener bindet neu) | |
| 7 | WLAN aus, Folge sehen, WLAN an | Outbox zeigt 1, danach 0; Folge steht einmal in der Web-App | |
| 8 | Gerät im Tracker widerrufen, Folge sehen | App zeigt wieder den Kopplungsscreen; nach erneuter Kopplung wird die Outbox nachgesendet | |
| 9 | Film in einer App sehen | Erscheint unter „Nicht erkannt“ (Filme erkennt die Shield ohne Folgennummer nicht) | |
| 10 | Statusscreen öffnen | Gekoppelt ✓, Medienzugriff ✓, letzte Ereignisse stimmen | |
