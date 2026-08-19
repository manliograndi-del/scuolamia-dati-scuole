#!/usr/bin/env python3
"""Mette tutto il sito dentro un file HTML solo.

    python3 strumenti/pagina-unica.py scuole-tutto.html

Serve per due cose: guardare il sito prima di pubblicarlo, e mandarlo a
qualcuno che se lo apre senza rete. Non e' il modo in cui il sito viene
pubblicato: cosi' il visitatore scarica subito tutti e quattro i megabyte e
mezzo dell'anagrafe, mentre il sito vero li chiede solo quando servono.

Con --senza-guscio toglie doctype, head e body, per chi avvolge la pagina per
conto suo.
"""

import os
import re
import sys

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)


def leggi(*pezzi):
    with open(os.path.join(RADICE, *pezzi), encoding="utf-8") as f:
        return f.read()


def costruisci(uscita, senza_guscio=False):
    pagina = leggi("index.html")

    pagina = pagina.replace(
        '<link rel="stylesheet" href="stile.css">',
        "<style>\n" + leggi("stile.css") + "\n</style>")

    # L'anagrafe entra prima del programma: cosi' conAnagrafe() la trova gia'
    # in casa e non prova a chiederla alla rete.
    dentro = "\n".join(
        "<script>\n" + leggi("dati", nome) + "\n</script>"
        for nome in ("sintesi.js", "confini.js", "scuole.js"))
    pagina = pagina.replace('<script src="chiave-google.js"></script>',
                            "<script>\n" + leggi("chiave-google.js") + "\n</script>")
    pagina = pagina.replace('<script src="dati/sintesi.js"></script>', dentro)
    pagina = pagina.replace('<script src="dati/confini.js"></script>', "")
    pagina = pagina.replace('<script src="sito.js"></script>',
                            "<script>\n" + leggi("sito.js") + "\n</script>")

    if senza_guscio:
        for via in ("<!doctype html>\n", '<html lang="it">\n', "<head>\n",
                    '<meta charset="utf-8">\n', "</head>\n", "<body>\n",
                    "</body>\n", "</html>\n"):
            pagina = pagina.replace(via, "", 1)
        pagina = re.sub(r'<meta name="viewport"[^>]*>\n', "", pagina, count=1)

    with open(uscita, "w", encoding="utf-8") as f:
        f.write(pagina)
    print("%s scritto: %.1f MB" % (uscita, os.path.getsize(uscita) / 1048576.0))


if __name__ == "__main__":
    argomenti = [a for a in sys.argv[1:] if a != "--senza-guscio"]
    if len(argomenti) != 1:
        raise SystemExit("Uso: pagina-unica.py <uscita.html> [--senza-guscio]")
    costruisci(argomenti[0], "--senza-guscio" in sys.argv)
