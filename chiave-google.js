/* ===========================================================================
   LA CHIAVE DI GOOGLE MAPS

   Questo file esiste per essere modificato senza toccare il resto del sito.
   Fra le due virgolette qui sotto va incollata la chiave di Google Maps.

   Finche' resta vuoto il sito funziona lo stesso: al posto della mappa di
   Google mostra il localizzatore, che dice in che punto della provincia sta
   il paese. Il pulsante "Portami li'", che apre il navigatore di Google
   sull'indirizzo, funziona in tutti e due i casi e non ha bisogno di chiavi.

   Come si ottiene la chiave:
   1. console.cloud.google.com, si entra col proprio account Google
   2. si crea un progetto e si attiva "Maps Embed API"
   3. Credenziali - Crea credenziali - Chiave API
   4. si limita la chiave al proprio indirizzo (Restrizioni per referrer HTTP),
      scrivendo:  manliograndi-del.github.io/*
      Questo passaggio conta: la chiave e' scritta dentro la pagina e chiunque
      puo' leggerla; la restrizione fa si' che funzioni solo qui.

   Per il modo in cui la usiamo - una mappa che mostra un indirizzo - la
   Maps Embed API di Google e' senza costo. Google chiede comunque una carta
   di credito per attivare il progetto.
   =========================================================================== */
const CHIAVE_GOOGLE = "";
