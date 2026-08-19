#!/usr/bin/env python3
"""Trasforma i confini amministrativi in tracciati SVG per la mappa del sito.

Partenza: i due GeoJSON di openpolis/geojson-italy, che ripubblicano i limiti
amministrativi ISTAT (licenza CC-BY 4.0):

    https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson
    https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson

Arrivo: dati/confini.js, un centinaio di chilobyte di tracciati gia' proiettati
e gia' semplificati, che il sito disegna senza chiamare nessuno.

    python3 strumenti/impacchetta-confini.py regioni.geojson province.geojson

I confini arrivano in gradi di latitudine e longitudine: qui diventano
coordinate di disegno con una proiezione di Mercatore, la stessa delle mappe a
cui siamo abituati, e vengono alleggeriti con l'algoritmo di Douglas e Peucker
finche' il disegno regge senza pesare.
"""

import json
import math
import os
import re
import sys
import unicodedata

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
USCITA = os.path.join(RADICE, "dati", "confini.js")

LARGHEZZA = 1000.0          # unita' di disegno del viewBox
TOLLERANZA_REGIONI = 0.010  # gradi: circa un chilometro
TOLLERANZA_PROVINCE = 0.006
AREA_MINIMA = 0.0009        # gradi quadri: sotto questa soglia l'isola sparisce


def senza_accenti(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def chiave(s):
    """Nome ridotto all'osso, per far combaciare fonti che lo scrivono diverso."""
    s = senza_accenti(s).upper()
    s = s.replace("'", " ").replace("-", " ").replace("/", " ")
    return re.sub(r"\s+", " ", s).strip()


def scorciatoia(s):
    """Nome adatto a stare in un indirizzo: tutto minuscolo, senza spazi."""
    s = senza_accenti(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def mercatore(lon, lat):
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def anelli(geom):
    """Restituisce gli anelli esterni, poligono per poligono."""
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"][0]]
    if t == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def area(punti):
    a = 0.0
    for i in range(len(punti) - 1):
        a += punti[i][0] * punti[i + 1][1] - punti[i + 1][0] * punti[i][1]
    return abs(a) / 2.0


def semplifica(punti, toll):
    """Douglas-Peucker: tiene i vertici che cambiano davvero la forma."""
    if len(punti) < 3:
        return punti
    primo, ultimo = punti[0], punti[-1]
    dx, dy = ultimo[0] - primo[0], ultimo[1] - primo[1]
    lung = math.hypot(dx, dy)
    peggiore, quale = 0.0, 0
    for i in range(1, len(punti) - 1):
        px, py = punti[i]
        if lung == 0:
            d = math.hypot(px - primo[0], py - primo[1])
        else:
            d = abs(dy * px - dx * py + ultimo[0] * primo[1] - ultimo[1] * primo[0]) / lung
        if d > peggiore:
            peggiore, quale = d, i
    if peggiore <= toll:
        return [primo, ultimo]
    return semplifica(punti[:quale + 1], toll)[:-1] + semplifica(punti[quale:], toll)


def tracciato(geom, toll, trasforma):
    pezzi = []
    for anello in anelli(geom):
        if area(anello) < AREA_MINIMA:
            continue
        ridotto = semplifica(anello, toll)
        if len(ridotto) < 4:
            continue
        d = []
        for j, (lon, lat) in enumerate(ridotto):
            x, y = trasforma(lon, lat)
            d.append(("M" if j == 0 else "L") + ("%.1f %.1f" % (x, y)))
        pezzi.append("".join(d) + "Z")
    return "".join(pezzi)


def baricentro(geom, trasforma):
    """Il centro del pezzo piu' grande: e' li' che ha senso mettere l'etichetta."""
    grande, quanto = None, -1.0
    for anello in anelli(geom):
        a = area(anello)
        if a > quanto:
            grande, quanto = anello, a
    if not grande:
        return 0.0, 0.0
    sx = sum(p[0] for p in grande) / len(grande)
    sy = sum(p[1] for p in grande) / len(grande)
    return trasforma(sx, sy)


def costruisci(f_regioni, f_province):
    regioni = json.load(open(f_regioni, encoding="utf-8"))["features"]
    province = json.load(open(f_province, encoding="utf-8"))["features"]

    # Il riquadro di disegno lo detta l'insieme delle province.
    xs, ys = [], []
    for f in province:
        for anello in anelli(f["geometry"]):
            if area(anello) < AREA_MINIMA:
                continue
            for lon, lat in anello:
                x, y = mercatore(lon, lat)
                xs.append(x)
                ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    scala = LARGHEZZA / (x1 - x0)
    altezza = (y1 - y0) * scala

    def trasforma(lon, lat):
        x, y = mercatore(lon, lat)
        return (x - x0) * scala, (y1 - y) * scala   # la y si ribalta: in SVG cresce verso il basso

    voci_r = []
    for f in regioni:
        p = f["properties"]
        nome = p["reg_name"].split("/")[0]
        voci_r.append({
            "n": nome,
            "k": chiave(nome),
            "s": scorciatoia(nome),
            "d": tracciato(f["geometry"], TOLLERANZA_REGIONI, trasforma),
        })

    voci_p = []
    for f in province:
        p = f["properties"]
        nome = p["prov_name"].split("/")[0]
        cx, cy = baricentro(f["geometry"], trasforma)
        voci_p.append({
            "n": nome,
            "k": chiave(nome),
            "s": scorciatoia(nome),
            "a": p["prov_acr"],
            "r": p["reg_name"].split("/")[0],
            "cx": round(cx, 1),
            "cy": round(cy, 1),
            "d": tracciato(f["geometry"], TOLLERANZA_PROVINCE, trasforma),
        })

    voci_r.sort(key=lambda v: v["n"])
    voci_p.sort(key=lambda v: v["n"])

    os.makedirs(os.path.dirname(USCITA), exist_ok=True)
    with open(USCITA, "w", encoding="utf-8") as f:
        f.write("/* Generato da strumenti/impacchetta-confini.py.\n")
        f.write("   Confini amministrativi ISTAT via openpolis/geojson-italy, CC-BY 4.0.\n")
        f.write("   Gia' proiettati e semplificati: il sito li disegna e basta. */\n")
        f.write('const C_RIQUADRO = "0 0 %d %d";\n' % (LARGHEZZA, math.ceil(altezza)))
        f.write("const C_REGIONI = %s;\n" % json.dumps(voci_r, ensure_ascii=False, separators=(",", ":")))
        f.write("const C_PROVINCE = %s;\n" % json.dumps(voci_p, ensure_ascii=False, separators=(",", ":")))

    print("confini.js scritto: %d regioni, %d province, %.0f KB, riquadro %dx%d"
          % (len(voci_r), len(voci_p), os.path.getsize(USCITA) / 1024.0,
             LARGHEZZA, math.ceil(altezza)))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: impacchetta-confini.py regioni.geojson province.geojson")
    sys.setrecursionlimit(100000)
    costruisci(sys.argv[1], sys.argv[2])
