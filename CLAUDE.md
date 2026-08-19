# Scuola Mia — memoria di progetto

Leggi tutto questo file prima di toccare qualsiasi cosa.

## Chi è l'utente e come lavora

Manlio. **Non legge il codice** e non usa il terminale. Verifica il lavoro in un
solo modo: apre l'indirizzo pubblicato e guarda se funziona.

Conseguenze operative:
- Non chiedergli di leggere un diff. Spiega **cosa cambia per lui**, non come.
- Non lasciare mai il repo in uno stato non funzionante fra una sessione e l'altra.
- Scrivi in italiano, nel codice e nei commenti.

## Cos'è

Sito pubblico dell'anagrafe delle scuole statali italiane, per Scuola Mia ETS.
Nato il 2026-08-19 da una richiesta precisa: una scheda per ogni riga del CSV
ministeriale, con tutti i dati, impaginata bene. Poi allargato a sito vero, con
mappa, numeri e pagine di territorio.

Pubblicato su GitHub Pages: `https://manliograndi-del.github.io/scuolamia-dati-scuole/`

**La prima versione era una pagina sola** dentro il repo `palestra`
(`scuole.html`, sul ramo `claude/dynamic-school-cards-fdg87k`, mai unita a main).
È rimasta lì come primo tentativo: il lavoro vero è qui.

## Vincoli tecnici — non negoziabili senza chiederglielo

1. **Nessun build, nessun framework, nessun npm.** JavaScript semplice.
2. **Nessuna dipendenza esterna a runtime**, a parte i caratteri di Google Fonts,
   che degradano su caratteri di sistema se non arrivano.
3. **Mobile prima di tutto.** Lo guarda dal telefono.
4. **Tutti i dati stanno nel repo**: nessuna chiamata a servizi, nessuna chiave.

## L'architettura, e perché è così

Tre file di dati, e la divisione è la decisione più importante del progetto:

- `dati/sintesi.js` (25 KB) — i totali già contati. Caricato **sempre**.
  Mappa, numeri e grafici partono senza aspettare niente.
- `dati/confini.js` (180 KB) — i confini di regioni e province, già proiettati
  in coordinate di disegno e già semplificati. Caricato **sempre**.
- `dati/scuole.js` (4,4 MB) — l'anagrafe riga per riga. Caricato **solo quando
  serve una scuola vera**: la ricerca, un comune, un istituto, una scheda.

Chi apre il sito per guardare la mappa scarica 200 KB, non quattro megabyte e
mezzo. Se sposti dati fra i tre file, ricorda perché sono divisi.

Il file grande finisce con `if (window.anagrafePronta) window.anagrafePronta()`:
è così che `conAnagrafe()` sa che è arrivato. Se cambi quel nome, cambialo in
tutti e due i posti.

## I dati sono generati, non scritti

`dati/` si rigenera con gli script in `strumenti/`, non si modifica a mano —
al primo lancio riscrive tutto. Le istruzioni stanno nel README.

`impacchetta-scuole.py` va lanciato **dopo** `impacchetta-confini.py`: prende da
`confini.js` i nomi ufficiali ISTAT (Forlì-Cesena, Reggio nell'Emilia,
Friuli-Venezia Giulia, scritti meglio di quelli ministeriali) e **si ferma** se
una provincia del CSV non trova il suo confine. È voluto: meglio accorgersene
subito che scoprire un buco nella mappa mesi dopo. Le differenze di scrittura
note stanno nella tabella `ALIAS`.

Nel file grande le colonne che si ripetono diventano dizionari e ogni scuola è
una riga di indici in base 36: il CSV di partenza pesa 13 MB, qui scende a un
terzo. **Se riordini o cambi i dizionari, il file va rigenerato tutto**: gli
indici delle righe non corrisponderebbero più.

Nella posta elettronica il trattino `-` significa «assente per davvero» e il
campo vuoto significa «ricavabile dal codice dell'istituto». Non confonderli:
880 scuole non hanno la posta e 49.341 ce l'hanno nella forma standard.

## Le mappe, e cosa costa cosa

Il ministero **non deposita coordinate**. Deposita il codice catastale del
comune, che è anche nell'archivio ISTAT: da lì i 6.648 punti dei comuni
(`dati/comuni.js`, 250 KB, caricato solo quando la mappa scende ai paesi).
Precisione: il paese, non la via.

`dati/confini.js` porta anche `C_PROIEZIONE`, i tre numeri della proiezione di
Mercatore usata per il disegno. Con quelli qualunque coppia latitudine e
longitudine si mette sulla mappa: li usa `strumenti/geocodifica.py`, li può
usare il sito.

**La cosa da non dimenticare**: per la mappa di Google dentro la scheda **non
serve geocodificare niente**. La Maps Embed API vuole l'indirizzo scritto e
cerca lei il posto. Geocodificare i 50.273 indirizzi con Google costerebbe
circa 250 euro e non servirebbe a quello. Le coordinate servono solo per
mettere molte scuole insieme sulla stessa mappa.

`chiave-google.js` è l'unico file pensato per essere modificato a mano, da
lui, dall'editor web di GitHub: una riga, con le istruzioni sopra. Vuoto, il
sito mostra il localizzatore e funziona; pieno, compare la mappa di Google.
**Non spostare quella costante dentro sito.js**: il punto è che stia in un
file che si apre senza avere paura di rompere qualcosa.

**Lo zoom cambia il riquadro di vista dell'SVG**, non ridisegna niente: è il
modo che costa meno al telefono. Tre cose lì dentro sono scelte, non dettagli:

- **A mappa intera il dito scorre la pagina** (`touch-action: pan-y`); la mappa
  se lo prende solo quando si è ingrandito qualcosa, e il pulsante «Tutta la
  mappa» glielo restituisce. Una mappa alta mezzo schermo che si mangia lo
  scorrimento è una trappola.
- **I cerchi non crescono quanto la mappa.** Se crescessero come tutto il resto,
  ingrandire non servirebbe: due paesi vicini resterebbero appiccicati identici.
  Il raggio è una proprietà CSS (`--r` per cerchio, `--controscala` sull'SVG),
  così un numero solo li rimpicciolisce tutti insieme senza toccare seimila
  elementi uno per uno. L'esponente è `k^-0.35`: più aggressivo e spariscono,
  meno e non si staccano.
- **Le linee non si ingrossano** (`vector-effect: non-scaling-stroke`).

I **nomi dei paesi** compaiono oltre l'ingrandimento 2,4×, al massimo 26, scelti
per numero di scuole e scartati se si accavallano o se toccano il bordo. Si
ridisegnano 130 ms dopo che il gesto è finito, non durante.

Lo zoom si accende da solo su qualunque mappa entri nella pagina, via
`sorvegliaMappe()`: le mappe arrivano anche dopo, quando arrivano i dati, e
ricordarsi di accenderlo in otto punti diversi era il modo giusto per
dimenticarsene in uno.

I raggi dei cerchi sulla mappa dei paesi **si misurano sul riquadro**, non in
numeri fissi: una provincia è disegnata in un centesimo delle unità
dell'Italia intera. Sotto ogni cerchio ne sta uno trasparente più largo
(`.presa`), perché un dito non prende un puntino.

## Decisioni di progetto già prese, con la ragione

- **Il colore misura, non decora.** Una sola tinta, il blu inchiostro. Sulla
  mappa dice quante scuole ci sono, nei grafici dice il grado di istruzione.
  Le rampe (`--grado1..4`, `--mappa1..5`) sono state **verificate** per
  contrasto e per daltonismo con lo strumento della guida alle visualizzazioni,
  non scelte a occhio: chi le cambia rifaccia la verifica.
- **I gradi sono quattro e stanno su una rampa in ordine.** Comprensivi, centri
  per adulti e convitti **non sono un grado**: nella composizione stanno in un
  solo segmento grigio, «Altre sedi», col dettaglio scritto nella legenda. Prima
  erano tre pastiglie dello stesso grigio e sembrava un errore di stampa.
- **La mappa usa i quantili, non intervalli uguali.** Con le scuole ammassate
  nelle regioni grandi, dividere l'intervallo in parti uguali lascerebbe quasi
  tutto nella prima fascia e non si vedrebbe niente.
- **Il maiuscolo del ministero viene rimesso in tondo** (`tondo()`), ma le sigle
  scolastiche restano (IC, ITIS, CPIA), le preposizioni si abbassano («IC di
  Abano Terme») e le iniziali puntate no: «E. Pantano», non «e. Pantano».
- **Gli elenchi lunghi si disegnano a scaglioni di 24** (`elencoSchede`): Roma ha
  1.271 sedi, e metterle tutte insieme nella pagina blocca il telefono.
- **L'indirizzo tiene lo stato della ricerca** (`#/cerca?q=...&reg=...`), così un
  risultato si può salvare o mandare a qualcuno. Quando è la ricerca stessa a
  riscrivere l'indirizzo, `ignoraProssimoIndirizzo` impedisce all'instradatore
  di ridisegnare i comandi mentre si sta scrivendo.
- **`.scheda .nome` è scritto con la classe del contenitore** apposta: `.nome`
  da solo colpiva anche le classifiche accanto alla mappa e le mandava in
  carattere con le grazie.

## Aspetto

Inchiostro su carta da registro: carta fredda, nero-blu, un solo accento
(`--accento #1D3F8B`). Caratteri: **Archivo** per titoli e interfaccia,
**Newsreader** per i nomi delle scuole — sono il contenuto, e un carattere con
le grazie li tratta da nome proprio — **Spline Sans Mono** per i codici
meccanografici, che si leggono lettera per lettera.

Tema chiaro e tema scuro, tutti e due disegnati: le variabili si ridefiniscono
in `@media (prefers-color-scheme: dark)` e in `[data-theme="dark"]`. Non
mettere mai un colore solo dentro uno dei due blocchi.

## Prima di chiudere una sessione

1. Prova nel browser: mappa, ricerca, una regione, un comune, una scheda.
2. Guarda tutte e due i temi e la larghezza del telefono.
3. Digli in italiano cosa vedrà di diverso.

## Pubblicazione

GitHub Pages, ramo indicato nelle impostazioni, cartella radice. Il repo deve
essere **pubblico**: sui piani gratuiti GitHub non pubblica i siti dei
repository privati. C'è un `.nojekyll` perché Pages non provi a trattare i file
come un sito Jekyll.
