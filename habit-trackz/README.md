# Habit Trackz

Ein Habit-Tracker als Website. Umsetzung des Project Scope aus *Einführung in Software Engineering*.

Reines HTML, CSS und JavaScript — kein Build-Schritt, keine Abhängigkeiten.
`index.html` im Browser öffnen genügt.

---

## Starten

**Variante A — einfach:** `index.html` doppelklicken.

**Variante B — lokaler Server** (nötig, falls der Browser lokale Dateien blockiert):

```bash
python3 -m http.server 4173
```

Dann `http://localhost:4173` öffnen.

Auf dem Anmeldebildschirm führt **„Mit Demo-Konto ansehen"** direkt in die App,
inklusive acht Beispiel-Gewohnheiten mit 70 Tagen Verlauf.

---

## Tests

Die Kernlogik (Streak-Berechnung) ist durch 27 Unit-Tests abgesichert:

- Im Browser: `tests.html` öffnen
- Im Terminal: `node js/tests.js`

---

## Architektur

Drei Schichten, bewusst getrennt, damit die Geschäftslogik ohne Oberfläche testbar bleibt:

| Datei | Schicht | Aufgabe |
| --- | --- | --- |
| `js/streak.js` | Domänenlogik | Streak-Algorithmus, Konsistenz, Datumslogik. Kennt kein DOM. |
| `js/store.js` | Persistenz | Nutzerkonten, Passwort-Hashing, Gewohnheiten, Einstellungen. Kapselt `localStorage`. |
| `js/app.js` | Präsentation | Rendering, Events, Navigation. Enthält keine Geschäftsregeln. |
| `js/tests.js` | Test | Unit-Tests gegen `streak.js`. |

Der Vorteil dieser Trennung: Ein Wechsel von `localStorage` auf eine echte Datenbank
beträfe nur `store.js`. Der Algorithmus bliebe unverändert — und seine Tests ebenfalls.

---

## Der Kernalgorithmus

`completeHabit()` in `js/streak.js`, direkt übernommen aus der Algorithmus-Abgabe:

1. Geplante Wochentage aus der Wiederholung ermitteln (`Daily`, `Mon, Wed, Fri`, `Mon-Fri`).
2. Ist heute kein geplanter Tag → nichts tun.
3. Wurde heute schon abgehakt → nichts tun (keine Doppelbuchung).
4. Letzten geplanten Tag **vor** heute suchen. Dort erledigt → Streak +1, sonst zurück auf 1.
5. Heute als `lastCompleted` speichern.

Schritt 4 ist der entscheidende Punkt: Bei „Mo, Mi, Fr" muss für den Mittwoch nur der
Montag erledigt sein — der Dienstag ist keine Lücke. Genau dieser Fall ist als Test
hinterlegt (`completeHabit: Mo/Mi/Fr — Dienstag ist keine Lücke`).

**Ergänzungen gegenüber der Abgabe:**

- `recalculateStreak()` leitet den Streak aus der kompletten Historie ab. Nötig, weil
  verpasste Tage auch dann zählen müssen, wenn die App zwischendurch nie offen war.
- Pausierte Tage („Skip Day") werden übersprungen, statt den Streak zu brechen.

---

## Umgesetzte Anforderungen

### Funktional

| ID | Anforderung | Umsetzung |
| --- | --- | --- |
| FR-1.1 | Registrierung mit Name, E-Mail, Geburtstag, Passwort | Registrierungsformular; Passwortregel: min. 8 Zeichen und eine Ziffer oder ein Sonderzeichen |
| FR-1.2 | Generische Fehlermeldung beim Login | „E-Mail oder Passwort ungültig" — verhindert User-Enumeration |
| FR-1.3 | Sichere Sitzung | Session im `localStorage`, Passwörter nur als Hash gespeichert |
| FR-2.1 | Gewohnheit anlegen | Name, Kategorie, Symbol, Uhrzeit, Dauer, Erinnerung, Wiederholung, Notizen |
| FR-2.2 | Quantitative Habits | Optionales Ziel mit Einheit (z. B. 2500 ml) |
| FR-2.3 | Abhaken mit Feedback und Undo | „Pling"-Ton, Vibration, Ausblend-Animation, Snackbar mit 5 Sekunden Rückgängig |
| FR-3.1 | Erinnerungen | 5 / 15 / 30 min, 1 / 2 Std vor der Zielzeit über die Notification API |
| FR-3.2 | Smart Scheduling | Habits mit identischer Benachrichtigungszeit werden zu einer Meldung gebündelt |
| FR-4.1 | Dashboard mit Fortschrittsring | SVG-Ring, Zähler für erledigt und offen |
| FR-4.2 | Konsistenz-Graph | Heatmap über 12 Wochen im GitHub-Stil |
| FR-4.3 | Skip Day | Pause-Button pro Gewohnheit, der den Streak erhält |
| — | Kategorien | Ernährung, Mentale Gesundheit, Sport, Studium, Arbeit, Haushalt, Hobbys |
| — | Filter und Suche | Kategorie-Chips und Volltextsuche auf der Habits-Seite |

### Nicht-funktional

| Kategorie | Anforderung | Umsetzung |
| --- | --- | --- |
| Performance | Dashboard in ≤ 150 ms | Alle Daten liegen lokal vor, kein Netzwerkzugriff beim Rendern |
| Performance | Feedback beim Abhaken in ≤ 50 ms | Ton und Vibration starten synchron im Click-Handler |
| Availability | Offline-First | Die App läuft vollständig ohne Internetverbindung |
| Security | Passwörter nicht im Klartext | SHA-256 mit zufälligem Salt pro Nutzer (siehe Einschränkung unten) |
| Accessibility | WCAG 2.1 AA | `aria-label` und `aria-pressed` an allen Bedienelementen, Kontraste in beiden Modi geprüft, Touch-Ziele ≥ 44 px |
| Design | Hell/Dunkel | Hell: Weiß mit grünen Akzenten · Dunkel: Schwarz mit blauen Akzenten |
| Design | Reduzierte Bewegung | `prefers-reduced-motion` wird respektiert |

---

## Bewusste Einschränkungen

Ehrlich dokumentiert, weil es ein Prototyp für die Lehrveranstaltung ist:

1. **Passwort-Hashing im Browser.** SHA-256 mit Salt ist deutlich besser als Klartext,
   aber kein Ersatz für serverseitiges Argon2id oder bcrypt. Ohne Backend gibt es keinen
   Ort, an dem ein Geheimnis sicher läge.
2. **Keine Synchronisation.** Daten liegen pro Browser im `localStorage`. Ein Wechsel des
   Geräts bedeutet einen leeren Stand. Die gekapselte Persistenzschicht ist genau die
   Stelle, an der ein Backend andocken würde.
3. **Erinnerungen nur bei geöffnetem Tab.** Echte Push-Nachrichten bräuchten einen
   Service Worker und einen Push-Dienst.
4. **Kein Social Sign-In** (FR-1.1, optionaler Teil) und **kein biometrischer Lock** (FR-1.3) —
   beides setzt eine native App oder ein Backend voraus.

---

## Projektstruktur

```
habit-trackz/
├── index.html          Anmeldung + App-Shell (Dashboard, Habits, Konto, Editor)
├── tests.html          Testbericht im Browser
├── css/
│   └── styles.css      Design-Tokens und Komponenten, hell und dunkel
└── js/
    ├── streak.js       Kernalgorithmus (keine DOM-Abhängigkeit)
    ├── store.js        Persistenz, Konten, Einstellungen
    ├── app.js          Oberfläche und Interaktion
    └── tests.js        27 Unit-Tests
```

Das Design folgt dem Stitch-Entwurf „Kinetic Clarity": Inter als Schrift, Haarlinien statt
Schlagschatten, Pillenformen für Chips und Checkboxen, Emerald-Grün im hellen und
Azure-Blau im dunklen Modus.
