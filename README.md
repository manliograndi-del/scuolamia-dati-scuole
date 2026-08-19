# Base dati delle scuole statali — Scuola Mia ETS

Sito pubblico costruito sull'anagrafe delle scuole statali del Ministero
dell'Istruzione e del Merito. Ogni sede scolastica ha la sua scheda con tutti i
campi depositati; sopra ci sono una mappa d'Italia, i conteggi e le pagine di
ogni regione, provincia, comune e istituto.

**Anno scolastico 2026/27 — 50.273 sedi, 6.648 comuni, 7.779 istituti.**

Indirizzo pubblicato: `https://manliograndi-del.github.io/scuolamia-dati-scuole/`

## Com'è fatto

Niente framework, niente compilazione, niente dipendenze a runtime: HTML, CSS e
JavaScript semplice. Si pubblica copiando i file su GitHub Pages.

| File | Cosa fa |
|---|---|
| `index.html` | il guscio: testata, menu, contenitore delle pagine |
| `stile.css` | tutto l'aspetto, tema chiaro e tema scuro |
| `sito.js` | il programma: instradamento, ricerca, mappa, grafici, schede |
| `dati/sintesi.js` | i totali già contati (25 KB) — caricato sempre |
| `dati/scuole.js` | l'anagrafe riga per riga (4,4 MB) — caricata solo quando serve |
| `dati/confini.js` | i confini di regioni e province, già proiettati (180 KB) |
| `strumenti/*.py` | gli script che generano i tre file di dati |

La scelta che conta: chi apre il sito scarica 200 KB e vede subito mappa e
numeri. I quattro megabyte dell'anagrafe partono solo quando si cerca una
scuola, si apre un comune o un istituto.

## Rigenerare i dati

I file dentro `dati/` sono **generati**: non si modificano a mano, si
riscrivono. Quando esce il CSV dell'anno nuovo:

```sh
# 1. i confini, una volta sola (cambiano solo se cambiano le province)
curl -O https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson
curl -O https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson
python3 strumenti/impacchetta-confini.py limits_IT_regions.geojson limits_IT_provinces.geojson

# 2. le scuole, a ogni nuova anagrafe
python3 strumenti/impacchetta-scuole.py SCUANAGRAFESTAT20262720260901.csv
```

Serve solo Python 3, senza librerie da installare. Il secondo script va
lanciato dopo il primo: prende da `dati/confini.js` i nomi ufficiali ISTAT di
regioni e province, e si ferma se una provincia del CSV non trova il suo
confine.

## Fonti e licenze

- Anagrafe delle scuole statali — Ministero dell'Istruzione e del Merito,
  <https://dati.istruzione.it/>, dati aperti.
- Confini amministrativi ISTAT, ridistribuiti da
  [openpolis/geojson-italy](https://github.com/openpolis/geojson-italy) con
  licenza CC-BY 4.0.

## Come tratta i dati mancanti

Dove il ministero non ha compilato un campo, la scheda scrive «non depositata»
invece di lasciare un buco muto. L'unico dato ricostruito è l'indirizzo di
posta: in 49.341 sedi su 50.273 è `CODICEISTITUTO@istruzione.it`, e dove
l'anagrafe non lo riporta la scheda lo ricava dichiarandolo ogni volta.

Trentino-Alto Adige e Valle d'Aosta gestiscono le proprie scuole e non
compaiono nell'anagrafe statale: sulla mappa restano grigi, con la ragione
scritta accanto.
