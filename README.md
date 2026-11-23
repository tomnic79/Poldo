# Poldo HD — Il banchetto dei colori

Tributo amatoriale in 2D ad alta risoluzione al platformer per Amiga **Chubby Gristle** (Grandslam Interactive, 1988).
Il personaggio usa i fotogrammi di `main.jpg`, il vigile del secondo livello usa `vigile.gif`
e il maggiolone usa `maggiolone.png`; entrambi sono rielaborati con la stessa palette e la
stessa risoluzione degli sprite del protagonista. La musica è `theme.mp3` in loop. Gli altri
sprite (nemici, cibo, porte, piattaforme) e gli sfondi sono disegnati proceduralmente in canvas.

## Come si avvia

Apri `index.html` in un browser moderno (Chrome, Firefox, Edge, Safari).

Se preferisci un server locale:

```bash
cd /home/tomnic/Chubby
python3 -m http.server 8000
```

poi visita `http://localhost:8000`.

## Controlli

| Azione | Tasti |
| --- | --- |
| Movimento | `←` `→` oppure `A` `D` |
| Salta | `Spazio` |
| Sale / scende dalle scale | `↑` / `↓` oppure `W` / `S` |
| Pausa | `P` oppure `Esc` |
| Ricomincia il livello | `R` |
| Attiva/disattiva audio | `M` |
| Inizia / riavvia | `Invio` |

Arrivati in fondo a una scala il personaggio si stacca automaticamente dal ripiano e può
camminare: per riagganciarsi basta rilasciare e premere di nuovo `↓` (o `↑`). Quando due
scale si sovrappongono viene scelta quella effettivamente più vicina al personaggio.

Su dispositivi touch compaiono pulsanti virtuali in basso allo schermo.

## Obiettivo

Raccogli tutte le prelibatezze sparse per il livello: quando hai preso l'ultima,
la porta si apre. Raggiungila per passare al piatto successivo. Attento ai topi,
alle api, ai fantasmi e a tutte le trappole: puoi schiacciare la maggior parte dei
nemici saltandoci sopra, ma **non** punte, fiamme, razzi e stalattiti.

## Contenuti

- 4 livelli con tavolozze e sfondi animati diversi:
  **La Cucina Reale**, **Il Giardino Incantato**, **La Panetteria Dorata**,
  **La Sala del Banchetto**. Le trappole aumentano di livello in livello: prime
  punte, poi fiamme, razzi mobili e infine stalattiti.
- Nel Giardino Incantato il maggiolone (`maggiolone.png`) è parcheggiato in divieto
  di sosta: il vigile animato (`vigile.gif`) scrive la multa e, se passi accanto alla macchina,
  ti addebita 150 punti. Non costa una vita e puoi tornare a ripassare più tardi.
- Fotogrammi del personaggio: 6 frame della corsa e 4 del salto da `main.jpg`; 4 frame
  della scala da `sale-ok.jpg`, con gli stessi criteri di scontorno. Rumore JPEG rimosso,
  frangia chiara del bordo eliminata, nessun alone bianco attorno alla sagoma; il bordo è
  trasparente e le zone interne chiare restano bianco opaco. I frame della scala vengono
  privati del margine trasparente e disegnati a dimensione fissa (66×96 px), pari
  all'altezza di quelli della corsa, così lo sprite non si ingrandisce né si
  rimpicciolisce passando da un fotogramma all'altro.
  La banda di descrizione e le altre righe di `main.jpg` non vengono usate.
- Musica: `theme.mp3` riprodotta in loop esattamente come fornita.
- Schermata intro: titolo **POLDO** e immagine `Poldo.png` (nella cartella base del progetto)
  mostrata in alto a colori pieni, senza velature, con una cornice di salsicce disegnata
  proceduralmente; tutte le scritte stanno sotto l'immagine.
- Nemici, trappole, cibo, porte e piattaforme: grafica procedurale in canvas,
  come nella primissima versione del remake. Sfondi HD con parallasse e particelle.
- Effetti sonori generati con WebAudio e record salvato in `localStorage`.
- 3 vite, punteggio, bonus di fine livello e schermata di vittoria. Le cadute oltre
  **280 px** di altezza costano una vita; i salti normali e le discese brevi sono sicuri.
  Il personaggio è confinato dentro i bordi del livello e non può uscire dallo schermo.
  Ogni prelibatezza mangiata lo appesantisce: la sagoma resta invariata, ma velocità,
  salto (più basso) e arrampicata diminuiscono progressivamente; il peso si azzera a ogni livello.

Realizzato come omaggio non ufficiale; i diritti del gioco originale restano ai rispettivi proprietari.
