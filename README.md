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
| `dati/comuni.js` | un punto per comune (250 KB) — caricato solo dalle mappe dei paesi |
| `chiave-google.js` | la chiave di Google Maps, l'unico file da modificare a mano |
| `strumenti/*.py` | gli script che generano i file di dati |

La scelta che conta: chi apre il sito scarica 200 KB e vede subito mappa e
numeri. I quattro megabyte dell'anagrafe partono solo quando si cerca una
scuola, si apre un comune o un istituto.

## Rigenerare i dati

I file dentro `dati/` sono **generati**: non si modificano a mano, si
riscrivono. Quando esce il CSV dell'anno nuovo:

```sh
# 1. i confini e i punti dei comuni, una volta sola
curl -O https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson
curl -O https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson
curl -O https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson
python3 strumenti/impacchetta-confini.py limits_IT_regions.geojson limits_IT_provinces.geojson limits_IT_municipalities.geojson

# 2. le scuole, a ogni nuova anagrafe
python3 strumenti/impacchetta-scuole.py SCUANAGRAFESTAT20262720260901.csv
```

Serve solo Python 3, senza librerie da installare. Il secondo script va
lanciato dopo il primo: prende da `dati/confini.js` i nomi ufficiali ISTAT di
regioni e province, e si ferma se una provincia del CSV non trova il suo
confine.

## Le mappe

Il ministero non deposita nessuna coordinata: nelle sue venti colonne non c'è
una latitudine. Quello che deposita è il codice catastale del comune, e lo
stesso codice sta nell'archivio ISTAT: tutti e 6.648 i comuni con scuole
trovano così il loro punto. Da lì vengono la mappa dei paesi e il
localizzatore nelle schede. **Precisione: il paese, non la via.**

Per la via ci sono due strade, e non richiedono le stesse cose:

- **Il pulsante «Portami lì»** apre il navigatore di Google sull'indirizzo
  depositato. Funziona sempre, non serve nessuna chiave, non costa niente.
- **La mappa di Google dentro la scheda** si accende scrivendo una chiave in
  `chiave-google.js`. Usa la Maps Embed API, che vuole l'indirizzo scritto e
  cerca lei il posto: **non serve tradurre in coordinate i 50.273 indirizzi**,
  che sarebbe la parte cara. Per questo uso l'Embed API è senza costo.

`strumenti/geocodifica.py` serve solo se un giorno si vorranno vedere molte
scuole insieme sulla stessa mappa, ognuna al suo numero civico: allora le
coordinate servono davvero. Interroga Nominatim (OpenStreetMap) a un indirizzo
al secondo, riprende da dove si era fermato, e scarta i risultati che cadono
nel comune sbagliato. Su tutta Italia sono circa quattordici ore: conviene una
provincia per volta.

Quanto sono scritti bene gli indirizzi del ministero, che è ciò che decide
quanto bene andrebbe: 2,1% non ce l'ha affatto, 63,7% finisce con un numero
civico, 22% contiene abbreviazioni puntate, 1.439 dicono «SNC», cioè senza
numero civico.

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
