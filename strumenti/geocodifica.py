#!/usr/bin/env python3
"""Cerca la posizione esatta delle scuole, indirizzo per indirizzo.

    python3 strumenti/geocodifica.py anagrafe.csv --provincia BERGAMO
    python3 strumenti/geocodifica.py anagrafe.csv --tutte

QUANDO SERVE. Per la mappa di Google dentro la scheda di una scuola questo
script NON serve: la Maps Embed API vuole l'indirizzo scritto e il posto lo
cerca lei. Serve quando si vogliono vedere molte scuole insieme sulla stessa
mappa, ognuna al suo numero civico: li' le coordinate ci vogliono.

COME. Interroga Nominatim, il servizio gratuito di OpenStreetMap. Gratuito
vuol dire con delle regole, e questo script le rispetta:
  - una richiesta al secondo, non di piu' (PAUSA)
  - un nome riconoscibile nell'intestazione, con un recapito (UTENTE)
  - i risultati si tengono da parte e non si richiedono due volte
Cinquantamila indirizzi a un secondo l'uno fanno quattordici ore. Lanciarlo
su una provincia per volta e' piu' sensato che su tutte.

Riprende da dove si era fermato: la cache sta in strumenti/cache-posizioni.json
e viene salvata ogni cinquanta indirizzi. Si puo' interrompere e rilanciare.

CONTROLLO DI QUALITA'. Ogni risposta viene verificata: il comune che torna
indietro deve essere quello che ci aspettavamo. Se non lo e', il risultato si
butta - meglio nessuna posizione che una sbagliata di trenta chilometri. Alla
fine lo script dice quante ne ha trovate e quante ne ha scartate.

USCITA. dati/indirizzi.js, una riga per scuola: codice meccanografico e il
punto gia' proiettato nelle coordinate di disegno del sito, usando i numeri
scritti in dati/confini.js.
"""

import csv
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
CACHE = os.path.join(QUI, "cache-posizioni.json")
CONFINI = os.path.join(RADICE, "dati", "confini.js")
USCITA = os.path.join(RADICE, "dati", "indirizzi.js")

SERVIZIO = "https://nominatim.openstreetmap.org/search"
UTENTE = "ScuolaMiaETS-basedati/1.0 (https://github.com/manliograndi-del/scuolamia-dati-scuole)"
PAUSA = 1.1          # secondi fra una richiesta e l'altra: la regola dice uno
OGNI_QUANTO_SALVA = 50

# Il ministero abbrevia in modo tutto suo. Nominatim capisce meglio la forma
# distesa, e queste sostituzioni sono le sole che si possono fare a occhi
# chiusi: cambiano la sigla, non il nome della via.
ABBREVIAZIONI = [
    (r"^V\.LE\b", "VIALE"), (r"^V\.LO\b", "VICOLO"), (r"^V\.\b", "VIA"),
    (r"^P\.ZZA\b", "PIAZZA"), (r"^P\.ZA\b", "PIAZZA"), (r"^P\.LE\b", "PIAZZALE"),
    (r"^PZA\b", "PIAZZA"), (r"^C\.SO\b", "CORSO"), (r"^C\.DA\b", "CONTRADA"),
    (r"^C/DA\b", "CONTRADA"), (r"^LOC\b\.?", "LOCALITA'"), (r"^FRAZ\b\.?", "FRAZIONE"),
    (r"^L\.GO\b", "LARGO"), (r"^STR\b\.?", "STRADA"),
]


def raddrizza(indirizzo):
    """Da 'VIA ROMA6' e 'PIAZZA ALDO MORO N. 1' a qualcosa di interrogabile."""
    u = indirizzo.strip().upper()
    for cerca, metti in ABBREVIAZIONI:
        u = re.sub(cerca, metti, u)
    u = re.sub(r"\bN\.\s*(\d)", r"\1", u)          # "N. 1" diventa "1"
    u = re.sub(r"\bS\.?N\.?C\.?\b", "", u)         # "SNC" vuol dire senza civico
    u = re.sub(r"([A-Z])(\d)", r"\1 \2", u)        # "VIA ROMA6" diventa "VIA ROMA 6"
    u = re.sub(r"\s+", " ", u).strip(" ,")
    return u


def leggi_proiezione():
    testo = open(CONFINI, encoding="utf-8").read()
    return json.loads(re.search(r"const C_PROIEZIONE = (\{.*?\});", testo).group(1))


def proietta(lon, lat, p):
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return (x - p["x0"]) * p["scala"], (p["y1"] - y) * p["scala"]


def carica_cache():
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def salva_cache(cache):
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def chiedi(domanda):
    indirizzo = SERVIZIO + "?" + urllib.parse.urlencode({
        "q": domanda, "format": "jsonv2", "limit": 1,
        "countrycodes": "it", "addressdetails": 1,
    })
    richiesta = urllib.request.Request(indirizzo, headers={"User-Agent": UTENTE})
    with urllib.request.urlopen(richiesta, timeout=30) as risposta:
        return json.load(risposta)


def stesso_comune(risposta, atteso):
    """Il comune che torna deve essere quello che ci aspettavamo."""
    dettagli = risposta.get("address", {})
    candidati = [dettagli.get(k, "") for k in
                 ("city", "town", "village", "municipality", "county")]
    a = atteso.upper().replace("'", " ")
    for c in candidati:
        if c and c.upper().replace("'", " ") in a or a in (c or "").upper().replace("'", " "):
            return True
    return False


def lavora(percorso_csv, provincia, tutte):
    proiezione = leggi_proiezione()
    with open(percorso_csv, encoding="utf-8-sig", newline="") as f:
        righe = list(csv.DictReader(f))
    if not tutte:
        righe = [x for x in righe if x["PROVINCIA"].upper() == provincia.upper()]
        if not righe:
            raise SystemExit("Nessuna scuola nella provincia %s." % provincia)

    cache = carica_cache()
    trovate, scartate, saltate, nuove = 0, 0, 0, 0
    inizio = time.time()

    for n, x in enumerate(righe, 1):
        codice = x["CODICESCUOLA"]
        via = x["INDIRIZZOSCUOLA"].strip()
        comune = x["DESCRIZIONECOMUNE"].strip()
        if not via or via.lower() == "non disponibile":
            saltate += 1
            continue
        if codice in cache:
            if cache[codice]:
                trovate += 1
            else:
                scartate += 1
            continue

        domanda = "%s, %s, %s, Italia" % (raddrizza(via), comune, x["PROVINCIA"])
        try:
            risposta = chiedi(domanda)
        except Exception as errore:                      # rete ballerina: si riprova dopo
            print("  ! %s: %s" % (codice, errore))
            time.sleep(5)
            continue
        nuove += 1
        time.sleep(PAUSA)

        if risposta and stesso_comune(risposta[0], comune):
            cache[codice] = [float(risposta[0]["lon"]), float(risposta[0]["lat"])]
            trovate += 1
        else:
            cache[codice] = None
            scartate += 1

        if nuove % OGNI_QUANTO_SALVA == 0:
            salva_cache(cache)
            passato = time.time() - inizio
            print("  %d di %d - trovate %d, scartate %d - %.0f minuti finora"
                  % (n, len(righe), trovate, scartate, passato / 60))

    salva_cache(cache)
    scrivi(cache, proiezione)
    print("\nFinito. Trovate %d, scartate %d, senza indirizzo %d, su %d scuole."
          % (trovate, scartate, saltate, len(righe)))
    if trovate + scartate:
        print("Ne ha riconosciute il %.1f%% di quelle con un indirizzo."
              % (trovate * 100.0 / (trovate + scartate)))


def scrivi(cache, proiezione):
    voci = []
    for codice, punto in sorted(cache.items()):
        if not punto:
            continue
        x, y = proietta(punto[0], punto[1], proiezione)
        voci.append("%s\t%.1f\t%.1f" % (codice, x, y))
    with open(USCITA, "w", encoding="utf-8") as f:
        f.write("/* Generato da strumenti/geocodifica.py: la posizione esatta di\n")
        f.write("   ogni scuola che Nominatim ha saputo riconoscere, gia' proiettata\n")
        f.write("   nelle coordinate di disegno del sito.\n")
        f.write("   Codice meccanografico, x, y - una scuola per riga. */\n")
        f.write("const C_INDIRIZZI = `%s`;\n" % "\n".join(voci))
        f.write("if (window.indirizziPronti) window.indirizziPronti();\n")
    print("dati/indirizzi.js scritto: %d posizioni, %.0f KB"
          % (len(voci), os.path.getsize(USCITA) / 1024.0))


if __name__ == "__main__":
    argomenti = sys.argv[1:]
    if not argomenti:
        raise SystemExit(__doc__)
    csv_in = argomenti[0]
    tutte = "--tutte" in argomenti
    provincia = ""
    if "--provincia" in argomenti:
        provincia = argomenti[argomenti.index("--provincia") + 1]
    elif not tutte:
        raise SystemExit("Serve --provincia NOME oppure --tutte.")
    lavora(csv_in, provincia, tutte)
