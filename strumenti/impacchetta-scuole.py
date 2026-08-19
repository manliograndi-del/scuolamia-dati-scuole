#!/usr/bin/env python3
"""Trasforma il CSV ministeriale nei due file di dati che il sito consuma.

    python3 strumenti/impacchetta-scuole.py SCUANAGRAFESTAT....csv

Va lanciato DOPO impacchetta-confini.py: da dati/confini.js e dati/comuni.js
prende i nomi ufficiali ISTAT di regioni, province e comuni, che sono scritti
meglio di quelli del ministero (Forli'-Cesena, Reggio nell'Emilia, Abano Terme
invece di ABANO TERME) e che servono a far combaciare le pagine con la mappa.
I comuni si legano per codice catastale, lo stesso che il ministero usa: tutti
e 6.648 quelli con scuole trovano il loro punto. Se qualcosa non combacia lo
script si ferma: meglio accorgersene qui che scoprire un buco nella mappa
mesi dopo.

Scrive due file, e sono due apposta:

  dati/sintesi.js  ~50 KB, i totali gia' contati. Il sito lo carica sempre:
                   la mappa, i numeri e i grafici partono subito.
  dati/scuole.js   ~4,5 MB, l'anagrafe riga per riga. Il sito lo carica solo
                   quando serve davvero una scuola, non all'apertura.

Nel file grande le colonne che si ripetono (comuni, istituti, tipologie, siti)
diventano dizionari e ogni scuola resta una riga di indici: il CSV di partenza
pesa 13 MB, qui scende a un terzo senza perdere un campo.
"""

import csv
import json
import os
import re
import sys
import unicodedata

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
CONFINI = os.path.join(RADICE, "dati", "confini.js")
COMUNI = os.path.join(RADICE, "dati", "comuni.js")

# Il ministero e l'ISTAT non scrivono sempre uguale.
ALIAS = {
    "FRIULI VENEZIA G.": "FRIULI VENEZIA GIULIA",
    "REGGIO EMILIA": "REGGIO NELL EMILIA",
}

FAMIGLIE = ["Infanzia", "Primaria", "Secondaria I", "Secondaria II",
            "Comprensivi", "Adulti", "Convitti"]


def senza_accenti(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def chiave(s):
    s = senza_accenti(s).upper().replace("'", " ").replace("-", " ").replace("/", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return ALIAS.get(s, s)


def ripulisci(v):
    v = v.strip()
    return "" if v.lower() == "non disponibile" else v


def b36(n):
    if n == 0:
        return "0"
    cifre = "0123456789abcdefghijklmnopqrstuvwxyz"
    s = ""
    while n:
        s = cifre[n % 36] + s
        n //= 36
    return s


def famiglia_di(t):
    if t == "SCUOLA INFANZIA":
        return 0
    if t == "SCUOLA PRIMARIA":
        return 1
    if t == "SCUOLA PRIMO GRADO":
        return 2
    if t == "ISTITUTO COMPRENSIVO":
        return 4
    if t == "CENTRO TERRITORIALE":
        return 5
    if t.startswith("CONVITTO") or t == "EDUCANDATO":
        return 6
    return 3


class Dizionario:
    def __init__(self):
        self.voci = []
        self.dove = {}

    def indice(self, v):
        if v not in self.dove:
            self.dove[v] = len(self.voci)
            self.voci.append(v)
        return self.dove[v]


def leggi_confini():
    """Nomi e scorciatoie ufficiali, presi dai file gia' costruiti."""
    if not os.path.exists(CONFINI) or not os.path.exists(COMUNI):
        raise SystemExit("Mancano i file dei confini: lancia prima impacchetta-confini.py.")
    testo = open(CONFINI, encoding="utf-8").read()
    reg = json.loads(re.search(r"const C_REGIONI = (\[.*?\]);\n", testo, re.S).group(1))
    prov = json.loads(re.search(r"const C_PROVINCE = (\[.*?\]);\n", testo, re.S).group(1))
    blocco_comuni = re.search(r"const C_COMUNI = `(.*?)`;", open(COMUNI, encoding="utf-8").read(), re.S).group(1)
    nomi_comuni = {}
    for riga in blocco_comuni.split("\n"):
        pezzi = riga.split("\t")
        nomi_comuni[pezzi[0]] = pezzi[1]
    return ({r["k"]: r for r in reg}, {p["k"]: p for p in prov}, nomi_comuni)


def impacchetta(percorso_csv):
    confini_reg, confini_prov, nomi_comuni = leggi_confini()
    with open(percorso_csv, encoding="utf-8-sig", newline="") as f:
        righe = list(csv.DictReader(f))
    if not righe:
        raise SystemExit("Il CSV e' vuoto.")

    reg = Dizionario()
    prov = Dizionario()
    com = Dizionario()
    ist = Dizionario()
    tip = Dizionario()
    car = Dizionario()
    web = Dizionario()
    scuole = []

    # Conteggi, riempiti mentre si legge.
    cont_reg, cont_prov, cont_com, cont_ist = {}, {}, {}, {}
    comune_istituto = {}   # dove ha la sede la direzione, per le classifiche
    per_tipologia, per_caratteristica = {}, {}
    mancanti = {"indirizzo": 0, "posta": 0, "pec": 0, "sito": 0, "nome": 0}
    sedi_direttive = 0

    for x in righe:
        kr = chiave(x["REGIONE"])
        kp = chiave(x["PROVINCIA"])
        if kr not in confini_reg:
            raise SystemExit("Regione senza confine: %s" % x["REGIONE"])
        if kp not in confini_prov:
            raise SystemExit("Provincia senza confine: %s" % x["PROVINCIA"])
        cr, cp = confini_reg[kr], confini_prov[kp]

        ir = reg.indice("\t".join([cr["n"], cr["s"], x["AREAGEOGRAFICA"]]))
        ip = prov.indice("\t".join([cp["n"], cp["s"], cp["a"], b36(ir)]))
        codice_comune = x["CODICECOMUNESCUOLA"]
        if codice_comune not in nomi_comuni:
            raise SystemExit("Comune senza punto sulla mappa: %s (%s)"
                             % (x["DESCRIZIONECOMUNE"], codice_comune))
        ic = com.indice("\t".join([codice_comune, nomi_comuni[codice_comune], b36(ip)]))
        # L'istituto e' identificato dal solo codice: le sue sedi possono
        # stare in comuni diversi, e infilare il comune nella chiave lo
        # spezzerebbe in due istituti distinti.
        ii = ist.indice("\t".join([
            x["CODICEISTITUTORIFERIMENTO"],
            ripulisci(x["DENOMINAZIONEISTITUTORIFERIMENTO"]),
        ]))
        comune_istituto.setdefault(ii, ic)
        tipologia = x["DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA"]
        caratteristica = x["DESCRIZIONECARATTERISTICASCUOLA"]
        it = tip.indice(tipologia)
        ia = car.indice(caratteristica)
        iw = web.indice(ripulisci(x["SITOWEBSCUOLA"]))
        fam = famiglia_di(tipologia)

        posta = ripulisci(x["INDIRIZZOEMAILSCUOLA"])
        atteso = x["CODICEISTITUTORIFERIMENTO"].lower() + "@istruzione.it"
        if not posta:
            posta = "-"
        elif posta.lower() == atteso:
            posta = ""

        direttiva = x["INDICAZIONESEDEDIRETTIVO"] == "SI"
        bandiere = ("1" if direttiva else "0") + ("1" if x["SEDESCOLASTICA"] == "SI" else "0")

        scuole.append("\t".join([
            x["CODICESCUOLA"],
            ripulisci(x["DENOMINAZIONESCUOLA"]),
            ripulisci(x["INDIRIZZOSCUOLA"]),
            ripulisci(x["CAPSCUOLA"]),
            b36(ic), b36(ii), b36(it), b36(ia), b36(iw),
            bandiere,
            posta,
            ripulisci(x["INDIRIZZOPECSCUOLA"]),
            ripulisci(x["INDICAZIONESEDEOMNICOMPRENSIVO"]),
        ]).rstrip("\t"))

        for mappa, indice in ((cont_reg, ir), (cont_prov, ip), (cont_com, ic), (cont_ist, ii)):
            v = mappa.setdefault(indice, [0] + [0] * len(FAMIGLIE))
            v[0] += 1
            v[1 + fam] += 1
        per_tipologia[tipologia] = per_tipologia.get(tipologia, 0) + 1
        per_caratteristica[caratteristica] = per_caratteristica.get(caratteristica, 0) + 1
        if direttiva:
            sedi_direttive += 1
        if not ripulisci(x["INDIRIZZOSCUOLA"]):
            mancanti["indirizzo"] += 1
        if posta == "-":
            mancanti["posta"] += 1
        if not ripulisci(x["INDIRIZZOPECSCUOLA"]):
            mancanti["pec"] += 1
        if not ripulisci(x["SITOWEBSCUOLA"]):
            mancanti["sito"] += 1
        if not ripulisci(x["DENOMINAZIONESCUOLA"]):
            mancanti["nome"] += 1

    scrivi_anagrafe(righe[0]["ANNOSCOLASTICO"], reg, prov, com, ist, tip, car, web, scuole)
    scrivi_sintesi(righe[0]["ANNOSCOLASTICO"], reg, prov, com, ist, tip,
                   cont_reg, cont_prov, cont_com, cont_ist, comune_istituto,
                   per_tipologia, per_caratteristica, mancanti, sedi_direttive, len(scuole))


def blocco(nome, testo):
    # I dati stanno dentro un template literal: l'unica insidia e' la barra
    # rovesciata, che nel CSV compare cinque volte.
    return "const D_%s = `%s`;\n" % (nome, testo.replace("\\", "\\\\"))


def scrivi_anagrafe(anno, reg, prov, com, ist, tip, car, web, scuole):
    percorso = os.path.join(RADICE, "dati", "scuole.js")
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    with open(percorso, "w", encoding="utf-8") as f:
        f.write("/* Generato da strumenti/impacchetta-scuole.py: l'anagrafe riga per riga.\n")
        f.write("   Dizionari piu' una riga per scuola, campi separati da tabulazione.\n")
        f.write("   Il sito lo carica solo quando serve una scuola vera. */\n")
        f.write(blocco("ANNO", anno))
        f.write(blocco("REG", "\n".join(reg.voci)))
        f.write(blocco("PROV", "\n".join(prov.voci)))
        f.write(blocco("COM", "\n".join(com.voci)))
        f.write(blocco("IST", "\n".join(ist.voci)))
        f.write(blocco("TIP", "\n".join(tip.voci)))
        f.write(blocco("CAR", "\n".join(car.voci)))
        f.write(blocco("WEB", "\n".join(web.voci)))
        f.write(blocco("SCU", "\n".join(scuole)))
        f.write("if (window.anagrafePronta) window.anagrafePronta();\n")
    print("dati/scuole.js: %d scuole, %.1f MB" % (len(scuole), os.path.getsize(percorso) / 1048576.0))


def scrivi_sintesi(anno, reg, prov, com, ist, tip,
                   cont_reg, cont_prov, cont_com, cont_ist, comune_istituto,
                   per_tipologia, per_caratteristica, mancanti, sedi_direttive, totale):
    comuni_per_regione, comuni_per_provincia = {}, {}
    for w in com.voci:
        ip = int(w.split("\t")[2], 36)
        ir = int(prov.voci[ip].split("\t")[3], 36)
        comuni_per_provincia[ip] = comuni_per_provincia.get(ip, 0) + 1
        comuni_per_regione[ir] = comuni_per_regione.get(ir, 0) + 1

    regioni = []
    for i, v in enumerate(reg.voci):
        nome, slug, area = v.split("\t")
        c = cont_reg.get(i, [0] * (1 + len(FAMIGLIE)))
        regioni.append({"n": nome, "s": slug, "area": area, "tot": c[0], "fam": c[1:],
                        "com": comuni_per_regione.get(i, 0),
                        "prov": sum(1 for w in prov.voci if w.split("\t")[3] == b36(i))})

    province = []
    for i, v in enumerate(prov.voci):
        nome, slug, sigla, ir = v.split("\t")
        c = cont_prov.get(i, [0] * (1 + len(FAMIGLIE)))
        province.append({"n": nome, "s": slug, "a": sigla, "r": reg.voci[int(ir, 36)].split("\t")[0],
                         "rs": reg.voci[int(ir, 36)].split("\t")[1], "tot": c[0], "fam": c[1:],
                         "com": comuni_per_provincia.get(i, 0)})

    # Quante scuole ha ogni comune, in una riga sola: sessanta chilobyte che
    # permettono alla mappa dei paesi di funzionare senza scaricare l'anagrafe.
    conteggio_comuni = " ".join(
        "%s%d" % (com.voci[i].split("\t")[0], c[0]) for i, c in sorted(cont_com.items()))

    comuni = sorted(
        ({"c": com.voci[i].split("\t")[0], "n": com.voci[i].split("\t")[1],
          "p": prov.voci[int(com.voci[i].split("\t")[2], 36)].split("\t")[0], "tot": c[0]}
         for i, c in cont_com.items()),
        key=lambda x: -x["tot"])[:60]

    istituti = sorted(
        ({"c": ist.voci[i].split("\t")[0], "n": ist.voci[i].split("\t")[1],
          "m": com.voci[comune_istituto[i]].split("\t")[1], "tot": c[0]}
         for i, c in cont_ist.items()),
        key=lambda x: -x["tot"])[:60]

    sintesi = {
        "anno": anno,
        "totale": totale,
        "comuni": len(com.voci),
        "istituti": len(ist.voci),
        "province": len(prov.voci),
        "regioni": len(reg.voci),
        "sediDirettive": sedi_direttive,
        "famiglie": FAMIGLIE,
        "perFamiglia": [sum(r["fam"][k] for r in regioni) for k in range(len(FAMIGLIE))],
        "perTipologia": sorted(([k, v] for k, v in per_tipologia.items()), key=lambda x: -x[1]),
        "perCaratteristica": sorted(([k, v] for k, v in per_caratteristica.items()), key=lambda x: -x[1]),
        "mancanti": mancanti,
        "conteggioComuni": conteggio_comuni,
        "elencoRegioni": regioni,
        "elencoProvince": province,
        "topComuni": comuni,
        "topIstituti": istituti,
    }
    percorso = os.path.join(RADICE, "dati", "sintesi.js")
    with open(percorso, "w", encoding="utf-8") as f:
        f.write("/* Generato da strumenti/impacchetta-scuole.py: i totali gia' contati,\n")
        f.write("   perche' la mappa e i grafici partano senza aspettare l'anagrafe. */\n")
        f.write("const SINTESI = %s;\n" % json.dumps(sintesi, ensure_ascii=False, separators=(",", ":")))
    print("dati/sintesi.js: %.0f KB" % (os.path.getsize(percorso) / 1024.0))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: impacchetta-scuole.py <anagrafe.csv>")
    impacchetta(sys.argv[1])
