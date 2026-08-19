/* ===========================================================================
   Scuola Mia — base dati delle scuole statali
   Un solo programma, nessuna libreria: quello che il sito fa, lo fa qui.

   Come e' organizzato il caricamento, che e' la scelta piu' importante:
   all'apertura arrivano solo i totali gia' contati (dati/sintesi.js, 25 KB)
   e i confini (dati/confini.js, 180 KB). Mappa, numeri e grafici partono
   subito. L'anagrafe riga per riga (dati/scuole.js, 4,4 MB) viene chiesta
   solo quando serve una scuola vera: la ricerca, un comune, un istituto.
   Chi guarda la mappa non scarica cinquantamila scuole per niente.
   =========================================================================== */

/* --- piccole cose utili -------------------------------------------------- */
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function num(n){ return Number(n).toLocaleString("it-IT"); }
function pct(parte, tutto){
  if (!tutto) return "0%";
  const v = parte * 100 / tutto;
  return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(".", ",")) + "%";
}

/* Il ministero deposita tutto in maiuscolo. Rimetterlo in tondo lo rende
   leggibile, ma due categorie di parole vanno lasciate stare: le sigle
   scolastiche, che sono nomi, e le preposizioni, che dentro un nome proprio
   si scrivono minuscole. */
const SIGLE = /^(IC|ICS|IM|SM|SMS|DD|CD|CTP|CPIA|IIS|IISS|ITI|ITIS|ITC|ITCG|ITG|ITE|ITT|ITAS|ITN|IPA|IPAA|IPC|IPIA|IPSS|IPSIA|IPSAR|IPSSAR|IPSEOA|IPSCT|ISA|ISIS|LS|LC|LSS|CFP|IAL|SNC|SS|SP|SR)$/;
const PICCOLE = /^(DI|DA|DE|DEL|DELL|DELLA|DELLE|DELLO|DEI|DEGLI|DAL|DALLA|DALLE|AL|ALLA|ALLE|AI|AGLI|IL|LO|LA|LE|GLI|IN|CON|SU|PER|TRA|FRA|ED|E|A|D)$/;
function tondo(s){
  let primo = true;
  return String(s).replace(/[A-Z]+/g, function(p, posizione, tutto){
    const iniziale = primo; primo = false;
    const dopo = tutto.charAt(posizione + p.length);
    if (p.length === 1){
      /* Una lettera sola seguita dal punto e' l'iniziale di un nome
         ("E. Pantano"), non la preposizione "e". */
      if (!iniziale && dopo !== "." && PICCOLE.test(p)) return p.toLowerCase();
      return p;
    }
    if (SIGLE.test(p)) return p;
    if (!iniziale && PICCOLE.test(p)) return p.toLowerCase();
    return p.charAt(0) + p.slice(1).toLowerCase();
  });
}
function indirizzoWeb(s){
  if (!s) return "";
  let u = String(s).trim();
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u.replace(/^https?[:/]*/i, "");
}
function vuoto(t){ return '<span class="vuoto">' + t + "</span>"; }
function scorciatoia(s){
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function annoLeggibile(a){ return a.slice(0,4) + "/" + a.slice(4); }

/* --- colori --------------------------------------------------------------
   I primi quattro sono la rampa dei gradi, in ordine. Gli ultimi tre non
   sono un grado - comprensivi, scuole per adulti, convitti - e prendono il
   grigio: fingerli parte della scala direbbe una cosa falsa. */
const COLORE_FAMIGLIA = [
  "var(--grado1)", "var(--grado2)", "var(--grado3)", "var(--grado4)",
  "var(--fuoriscala)", "var(--fuoriscala)", "var(--fuoriscala)"
];
const SCALA_MAPPA = ["var(--mappa1)","var(--mappa2)","var(--mappa3)","var(--mappa4)","var(--mappa5)"];

/* --- l'anagrafe completa, caricata solo quando serve --------------------- */
let A = null;          /* gli indici, una volta costruiti */
let inArrivo = null;   /* la promessa in corso, per non chiedere due volte */

function conAnagrafe(){
  if (A) return Promise.resolve(A);
  /* Se l'anagrafe e' gia' dentro la pagina non c'e' niente da chiedere:
     e' il caso della copia in un file solo (strumenti/pagina-unica.py). */
  if (typeof D_SCU !== "undefined") return Promise.resolve(costruisciIndici());
  if (inArrivo) return inArrivo;
  inArrivo = new Promise(function(risolvi, rifiuta){
    window.anagrafePronta = function(){ risolvi(costruisciIndici()); };
    const s = document.createElement("script");
    s.src = "dati/scuole.js";
    s.onerror = function(){ rifiuta(new Error("anagrafe non raggiungibile")); };
    document.head.appendChild(s);
  });
  return inArrivo;
}

function n36(s){ return parseInt(s, 36); }

function costruisciIndici(){
  const REG = D_REG.split("\n").map(function(r){ return r.split("\t"); });
  const PROV = D_PROV.split("\n").map(function(r){ return r.split("\t"); });
  const COM = D_COM.split("\n").map(function(r){ return r.split("\t"); });
  const IST = D_IST.split("\n").map(function(r){ return r.split("\t"); });
  const TIP = D_TIP.split("\n");
  const CAR = D_CAR.split("\n");
  const WEB = D_WEB.split("\n");
  const RIGHE = D_SCU.split("\n");
  const n = RIGHE.length;

  const famDiTip = TIP.map(function(t){
    if (t === "SCUOLA INFANZIA") return 0;
    if (t === "SCUOLA PRIMARIA") return 1;
    if (t === "SCUOLA PRIMO GRADO") return 2;
    if (t === "ISTITUTO COMPRENSIVO") return 4;
    if (t === "CENTRO TERRITORIALE") return 5;
    if (t.indexOf("CONVITTO") === 0 || t === "EDUCANDATO") return 6;
    return 3;
  });

  const iCom = new Uint16Array(n), iProv = new Uint8Array(n);
  const iFam = new Uint8Array(n), iIst = new Uint16Array(n);
  const chiave = new Array(n), ordinaPer = new Array(n);
  const perComune = new Map(), perIstituto = new Map(), perProvincia = new Map();
  const perCodice = new Map(), istitutoDaCodice = new Map(), comuneDaCodice = new Map();

  for (let i = 0; i < n; i++){
    const c = RIGHE[i].split("\t");
    const ic = n36(c[4]), ii = n36(c[5]);
    const ip = n36(COM[ic][2]);
    iCom[i] = ic; iProv[i] = ip; iIst[i] = ii; iFam[i] = famDiTip[n36(c[6])];
    chiave[i] = (c[1] + " " + COM[ic][1] + " " + c[0] + " " + PROV[ip][0] + " " + (c[2] || "")).toLowerCase();
    ordinaPer[i] = COM[ic][1] + "|" + c[1] + "|" + c[0];
    perCodice.set(c[0], i);
    if (!perComune.has(ic)) perComune.set(ic, []);
    perComune.get(ic).push(i);
    if (!perIstituto.has(ii)) perIstituto.set(ii, []);
    perIstituto.get(ii).push(i);
    if (!perProvincia.has(ip)) perProvincia.set(ip, []);
    perProvincia.get(ip).push(i);
  }
  IST.forEach(function(v, k){ istitutoDaCodice.set(v[0], k); });
  COM.forEach(function(v, k){ comuneDaCodice.set(v[0], k); });

  /* Ordine: prima il comune, poi il nome. I dati sono tutti ASCII, quindi il
     confronto secco basta ed e' molto piu' rapido di localeCompare. */
  const ordine = [];
  for (let i = 0; i < n; i++) ordine.push(i);
  ordine.sort(function(a, b){
    return ordinaPer[a] < ordinaPer[b] ? -1 : ordinaPer[a] > ordinaPer[b] ? 1 : 0;
  });
  /* Il posto di ciascuna scuola nell'ordine, per riordinare un sottoinsieme
     senza rifare il confronto fra stringhe. */
  const rango = new Int32Array(n);
  for (let k = 0; k < n; k++) rango[ordine[k]] = k;

  A = { REG:REG, PROV:PROV, COM:COM, IST:IST, TIP:TIP, CAR:CAR, WEB:WEB, RIGHE:RIGHE,
        n:n, iCom:iCom, iProv:iProv, iFam:iFam, iIst:iIst, chiave:chiave, ordine:ordine, rango:rango,
        perComune:perComune, perIstituto:perIstituto, perProvincia:perProvincia,
        perCodice:perCodice, istitutoDaCodice:istitutoDaCodice, comuneDaCodice:comuneDaCodice };
  return A;
}

/* Una scuola, sciolta dai suoi indici. */
function scuola(i){
  const c = A.RIGHE[i].split("\t");
  const ic = n36(c[4]), ii = n36(c[5]);
  const ip = n36(A.COM[ic][2]);
  const ir = n36(A.PROV[ip][3]);
  return {
    i: i,
    codice: c[0],
    nome: c[1] || "",
    indirizzo: c[2] || "",
    cap: c[3] || "",
    comuneCod: A.COM[ic][0],
    comune: A.COM[ic][1],
    provincia: A.PROV[ip][0],
    provinciaSlug: A.PROV[ip][1],
    sigla: A.PROV[ip][2],
    regione: A.REG[ir][0],
    regioneSlug: A.REG[ir][1],
    area: A.REG[ir][2],
    istCod: A.IST[ii][0],
    istNome: A.IST[ii][1] || "",
    tipologia: A.TIP[n36(c[6])],
    caratteristica: A.CAR[n36(c[7])],
    sito: A.WEB[n36(c[8])] || "",
    direttivo: c[9].charAt(0) === "1",
    sede: c[9].charAt(1) === "1",
    email: (c[10] === "-" ? "" : (c[10] || A.IST[ii][0] + "@istruzione.it")),
    emailRicavata: !c[10],
    pec: c[11] || "",
    omni: c[12] || "",
    famiglia: A.iFam[i]
  };
}

/* ===========================================================================
   I pezzi con cui sono fatte le pagine
   =========================================================================== */

const sugg = document.getElementById("suggerimento");
function mostraSugg(e, html){
  sugg.innerHTML = html;
  sugg.classList.add("mostra");
  const r = sugg.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 16;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 16;
  sugg.style.left = Math.max(8, x) + "px";
  sugg.style.top = Math.max(8, y) + "px";
}
function nascondiSugg(){ sugg.classList.remove("mostra"); }

function avvisoCopia(t){
  const a = document.getElementById("avvisocopia");
  a.textContent = t;
  a.classList.add("mostra");
  clearTimeout(avvisoCopia.t);
  avvisoCopia.t = setTimeout(function(){ a.classList.remove("mostra"); }, 1400);
}

/* --- numeri in evidenza --------------------------------------------------
   Quando la storia e' un numero solo, il numero e' il grafico. */
function numeri(voci){
  return '<div class="numeri">' + voci.map(function(v){
    return '<div class="numero"><p class="et">' + esc(v.et) + "</p>"
      + '<div class="vl">' + v.vl + "</div>"
      + (v.nota ? '<p class="nota">' + v.nota + "</p>" : "")
      + "</div>";
  }).join("") + "</div>";
}

/* --- classifica a barre --------------------------------------------------
   Una serie sola: tutte le barre dello stesso colore, il valore scritto in
   fondo. Colorarle per grandezza ripeterebbe con la tinta cio' che la
   lunghezza gia' dice. */
function classifica(voci, opzioni){
  const o = opzioni || {};
  const massimo = Math.max.apply(null, voci.map(function(v){ return v.valore; }).concat([1]));
  return '<div class="classifica">' + voci.map(function(v){
    const largo = Math.max(1.5, v.valore * 100 / massimo);
    const dentro = '<div class="cl-nome">' + esc(v.nome)
        + (v.sotto ? "<small>" + esc(v.sotto) + "</small>" : "") + "</div>"
      + '<div class="cl-pista"><div class="cl-barra" style="width:' + largo.toFixed(1) + '%"></div></div>'
      + '<div class="cl-val">' + num(v.valore) + (o.unita ? " " + o.unita : "") + "</div>";
    return v.href
      ? '<a class="cl-riga" href="' + esc(v.href) + '">' + dentro + "</a>"
      : '<div class="cl-riga">' + dentro + "</div>";
  }).join("") + "</div>";
}

/* --- composizione per grado ----------------------------------------------
   Quattro segmenti sulla rampa, in ordine, piu' uno solo per tutto cio' che
   un grado non e': dare tre pastiglie dello stesso grigio a comprensivi,
   adulti e convitti sembrava un errore di stampa. Il dettaglio delle tre
   resta scritto sotto, in chiaro. */
function composizione(fam){
  const tot = fam.reduce(function(a, b){ return a + b; }, 0) || 1;
  const nomi = SINTESI.famiglie;
  const altre = fam[4] + fam[5] + fam[6];
  const parti = [
    { nome:nomi[0], valore:fam[0], colore:COLORE_FAMIGLIA[0] },
    { nome:nomi[1], valore:fam[1], colore:COLORE_FAMIGLIA[1] },
    { nome:nomi[2], valore:fam[2], colore:COLORE_FAMIGLIA[2] },
    { nome:nomi[3], valore:fam[3], colore:COLORE_FAMIGLIA[3] },
    { nome:"Altre sedi", valore:altre, colore:"var(--fuoriscala)",
      dettaglio:[nomi[4], nomi[5], nomi[6]].map(function(x, k){
        return x.toLowerCase() + " " + num(fam[4 + k]);
      }).join(", ") }
  ];
  const segmenti = parti.map(function(v){
    if (!v.valore) return "";
    return '<div class="comp-segmento" style="width:' + (v.valore * 100 / tot).toFixed(2)
      + "%;background:" + v.colore + '" data-sugg="<b>' + esc(v.nome) + "</b><br>" + num(v.valore)
      + " sedi, " + pct(v.valore, tot) + '"></div>';
  }).join("");
  const legenda = '<div class="legenda">' + parti.map(function(v){
    if (!v.valore) return "";
    return '<span><i style="background:' + v.colore + '"></i>' + esc(v.nome)
      + " <b>" + num(v.valore) + "</b>" + (v.dettaglio ? " <small>(" + esc(v.dettaglio) + ")</small>" : "")
      + "</span>";
  }).join("") + "</div>";
  return '<div class="composizione" role="img" aria-label="Composizione per grado di istruzione: '
    + parti.filter(function(v){ return v.valore; })
        .map(function(v){ return v.nome + " " + v.valore; }).join(", ")
    + '">' + segmenti + "</div>" + legenda;
}

/* --- mappa ---------------------------------------------------------------
   Cinque classi per quantili: con le scuole ammassate nelle regioni grandi,
   dividere l'intervallo in parti uguali lascerebbe quasi tutto nella prima
   fascia e non si vedrebbe niente. */
function classi(valori){
  const ordinati = valori.slice().sort(function(a, b){ return a - b; });
  const tagli = [];
  for (let k = 1; k < 5; k++) tagli.push(ordinati[Math.floor(k * ordinati.length / 5)]);
  return tagli;
}
function classeDi(v, tagli){
  let k = 0;
  while (k < tagli.length && v >= tagli[k]) k++;
  return k;
}

function riquadroDi(tracciati){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  tracciati.forEach(function(d){
    const n = d.match(/-?\d+(?:\.\d+)?/g) || [];
    for (let k = 0; k + 1 < n.length; k += 2){
      const x = parseFloat(n[k]), y = parseFloat(n[k + 1]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  });
  const m = Math.max(12, (x1 - x0) * 0.04);
  return [x0 - m, y0 - m, (x1 - x0) + m * 2, (y1 - y0) + m * 2];
}

/* opzioni: livello ("regioni" o "province"), regione (nome ufficiale, per
   restringere il disegno a una sola). */
function mappa(opzioni){
  const o = opzioni || {};
  const perProvincia = o.livello === "province";
  const forme = perProvincia
    ? C_PROVINCE.filter(function(p){ return !o.regione || p.r === o.regione; })
    : C_REGIONI;

  const dati = new Map();
  (perProvincia ? SINTESI.elencoProvince : SINTESI.elencoRegioni).forEach(function(v){
    dati.set(v.n, v);
  });

  const conDati = forme.filter(function(f){ return dati.has(f.n); });
  const tagli = classi(conDati.map(function(f){ return dati.get(f.n).tot; }));

  const pezzi = forme.map(function(f){
    const v = dati.get(f.n);
    if (!v){
      return '<path class="fuori" d="' + f.d + '" fill="var(--mappa0)"'
        + ' data-sugg="<b>' + esc(f.n) + '</b><br>fuori dall&rsquo;anagrafe statale"></path>';
    }
    const colore = SCALA_MAPPA[classeDi(v.tot, tagli)];
    const dove = (perProvincia ? "#/provincia/" : "#/regione/") + v.s;
    return '<a href="' + dove + '" aria-label="' + esc(f.n) + ", " + num(v.tot) + ' scuole">'
      + '<path d="' + f.d + '" fill="' + colore + '"'
      + ' data-sugg="<b>' + esc(f.n) + '</b><br>' + num(v.tot) + ' scuole"></path></a>';
  }).join("");

  /* Sulla mappa nazionale delle province le linee di regione aiutano a
     riconoscere dove si sta guardando. */
  const contorni = (perProvincia && !o.regione)
    ? C_REGIONI.map(function(r){ return '<path class="contorno" d="' + r.d + '"></path>'; }).join("")
    : "";

  const riquadro = o.regione
    ? riquadroDi(forme.map(function(f){ return f.d; })).map(function(v){ return v.toFixed(0); }).join(" ")
    : C_RIQUADRO;

  const soglie = tagli.map(function(t){ return num(t); });
  const scala = '<div class="legenda-scala">'
    + '<div class="scala-barre">' + SCALA_MAPPA.map(function(c){
        return '<i style="background:' + c + '"></i>';
      }).join("") + '</div>'
    + '<div class="scala-testo"><span>meno scuole</span>'
    + soglie.map(function(t){ return "<span>" + t + "</span>"; }).join("")
    + '<span>pi&ugrave;</span></div>'
    + '</div>';

  return '<svg class="mappa' + (o.regione ? " regionale" : "") + '" viewBox="' + riquadro
    + '" role="group" aria-label="Mappa d&rsquo;Italia">'
    + pezzi + contorni + '</svg>' + scala;
}

/* --- i comuni sulla mappa ------------------------------------------------
   Il ministero non deposita nessuna coordinata: nelle sue venti colonne non
   c'e' una latitudine. Quello che c'e' e' il codice catastale del comune, e
   quello stesso codice sta nell'archivio ISTAT dei confini: tutti e 6.648 i
   comuni con scuole trovano il loro punto. Da li' viene questa mappa.
   Precisione: il paese, non la via. Per la via c'e' il pulsante che apre
   Google Maps sull'indirizzo scritto in anagrafe. */
let COMUNI = null;          /* [{c, n, x, y, p}] */
let COMUNE_DA_CODICE = null;
let inArrivoComuni = null;
let CONTEGGIO = null;

function conComuni(){
  if (COMUNI) return Promise.resolve(COMUNI);
  if (typeof C_COMUNI !== "undefined") return Promise.resolve(leggiComuni());
  if (inArrivoComuni) return inArrivoComuni;
  inArrivoComuni = new Promise(function(risolvi, rifiuta){
    window.comuniPronti = function(){ risolvi(leggiComuni()); };
    const s = document.createElement("script");
    s.src = "dati/comuni.js";
    s.onerror = function(){ rifiuta(new Error("comuni non raggiungibili")); };
    document.head.appendChild(s);
  });
  return inArrivoComuni;
}

function leggiComuni(){
  COMUNI = C_COMUNI.split("\n").map(function(r){
    const c = r.split("\t");
    return { c:c[0], n:c[1], x:parseFloat(c[2]), y:parseFloat(c[3]), p:parseInt(c[4], 10) };
  });
  COMUNE_DA_CODICE = new Map();
  COMUNI.forEach(function(v){ COMUNE_DA_CODICE.set(v.c, v); });
  return COMUNI;
}

/* Quante scuole per comune, srotolate dalla riga compatta della sintesi:
   il codice catastale e' sempre quattro caratteri, il resto e' il numero. */
function conteggioComuni(){
  if (CONTEGGIO) return CONTEGGIO;
  CONTEGGIO = new Map();
  SINTESI.conteggioComuni.split(" ").forEach(function(v){
    CONTEGGIO.set(v.slice(0, 4), parseInt(v.slice(4), 10));
  });
  return CONTEGGIO;
}

/* opzioni: provincia (scorciatoia, per restringere), evidenzia (codice
   catastale da mettere in risalto), titolo (per i lettori di schermo) */
function mappaComuni(opzioni){
  const o = opzioni || {};
  const conta = conteggioComuni();
  const ip = o.provincia ? C_PROVINCE.findIndex(function(p){ return p.s === o.provincia; }) : -1;
  const dentro = ip >= 0 ? [C_PROVINCE[ip]] : C_PROVINCE;

  const punti = COMUNI.filter(function(v){
    if (ip >= 0 && v.p !== ip) return false;
    return conta.has(v.c) || v.c === o.evidenzia;
  }).map(function(v){
    return { v:v, n: conta.get(v.c) || 0 };
  }).sort(function(a, b){ return b.n - a.n; });   /* i grandi sotto, i piccoli sopra */

  /* La grandezza dei cerchi si misura sul riquadro, non in numeri fissi:
     una provincia e' disegnata in un centesimo delle unita' dell'Italia
     intera, e un raggio buono per il paese diventa un blob sulla provincia.
     Il riferimento e' la distanza media fra due paesi vicini. */
  const riquadro = ip >= 0
    ? riquadroDi([C_PROVINCE[ip].d])
    : C_RIQUADRO.split(" ").map(parseFloat);
  const larghezza = riquadro[2];
  const passo = larghezza / Math.sqrt(Math.max(4, punti.length));
  const massimo = passo * 0.85;
  const minimo = Math.min(passo * 0.19, massimo * 0.5);
  const piuGrande = punti.length ? punti[0].n : 1;
  const fattore = massimo / Math.sqrt(Math.max(1, piuGrande));
  /* Sotto ogni cerchio ne sta uno trasparente piu' largo: i paesi piccoli
     sono puntini, e un dito non prende un puntino. */
  const dito = Math.max(passo * 0.5, larghezza / 90);

  const sfondo = dentro.map(function(p){
    return '<path class="fondo" d="' + p.d + '"></path>';
  }).join("");

  let etichettaAccesa = "";
  const pallini = punti.map(function(t){
    let r = Math.max(minimo, Math.min(massimo, Math.sqrt(t.n) * fattore));
    const acceso = t.v.c === o.evidenzia;
    if (acceso){
      /* Il paese cercato non deve essere il puntino piu' piccolo della mappa:
         se ha poche scuole lo si ingrandisce apposta, e gli si scrive il nome
         accanto, altrimenti trovarlo e' un gioco di pazienza. */
      r = Math.max(r, passo * 0.5);
      etichettaAccesa = '<text class="nome-paese" x="' + t.v.x + '" y="'
        + (t.v.y - r - passo * 0.35).toFixed(2) + '" style="font-size:'
        + (passo * 0.7).toFixed(2) + 'px">' + esc(t.v.n) + "</text>";
    }
    const etichetta = '<b>' + esc(t.v.n) + "</b><br>" + num(t.n) + (t.n === 1 ? " scuola" : " scuole");
    return '<a href="#/comune/' + esc(t.v.c) + '" aria-label="' + esc(t.v.n) + ", " + num(t.n) + ' scuole">'
      + '<circle class="presa" cx="' + t.v.x + '" cy="' + t.v.y + '" r="' + Math.max(r, dito).toFixed(2)
      + '" style="--r:' + Math.max(r, dito).toFixed(2) + '" data-sugg="' + etichetta + '"></circle>'
      + '<circle class="paese' + (acceso ? " acceso" : "") + '" cx="' + t.v.x + '" cy="' + t.v.y
      + '" r="' + r.toFixed(2) + '" style="--r:' + r.toFixed(2) + '"'
      + ' data-sugg="' + etichetta + '"></circle></a>';
  }).join("");

  const riquadroScritto = riquadro.map(function(v){ return v.toFixed(0); }).join(" ");

  return '<svg class="mappa paesi' + (ip >= 0 ? " regionale" : "") + '" viewBox="' + riquadroScritto
    + '" role="group" aria-label="' + esc(o.titolo || "I comuni con le loro scuole") + '"'
    + '>'
    + sfondo + pallini + etichettaAccesa + "</svg>"
    + '<p class="nota-mappa">Ogni cerchio &egrave; un comune, grande quanto le scuole che ha. '
    + "La posizione &egrave; quella del paese: per la via esatta c&rsquo;&egrave; il pulsante nella scheda.</p>";
}


/* ===========================================================================
   Lo zoom delle mappe

   Si pizzica con due dita, si trascina col dito, si gira la rotellina, e ci
   sono i tre pulsanti per chi preferisce toccare. Sotto non c'e' nessuna
   libreria: si cambia il riquadro di vista dell'SVG, che e' il modo che
   costa meno al telefono - nessun disegno viene rifatto, il browser
   ridisegna quello che c'e' gia' alla scala nuova.

   Due accortezze che fanno la differenza.

   Primo, finche' si e' a mappa intera il dito scorre la pagina, come deve
   essere: la mappa se lo prende solo dopo che si e' ingrandito qualcosa, e
   il pulsante "Tutta la mappa" glielo restituisce. Altrimenti una mappa
   alta mezzo schermo diventa un muro in cui il dito resta impigliato.

   Secondo, i cerchi non crescono quanto la mappa. Se crescessero come tutto
   il resto, ingrandire non servirebbe a niente: due paesi vicini
   resterebbero appiccicati identici. Rimpicciolendoli mentre si ingrandisce
   si staccano, ed e' li' che lo zoom comincia a servire davvero.
   =========================================================================== */

const ZOOM_MASSIMO = 40;
const SI_PUO_RIMPICCIOLIRE = window.CSS && CSS.supports && CSS.supports("r", "1px");

function attivaZoom(svg){
  if (!svg || svg.dataset.zoom) return;
  svg.dataset.zoom = "si";

  const base = svg.getAttribute("viewBox").split(/\s+/).map(parseFloat);
  let vista = base.slice();
  const dita = new Map();
  let trascinato = false, partenza = null, distanzaIniziale = 0, vistaIniziale = null;

  function ingrandimento(){ return base[2] / vista[2]; }

  function applica(){
    const k = ingrandimento();
    /* Il minimo tiene la mappa dentro il suo riquadro: ingrandire non deve
       poter far scappare l'Italia fuori dallo schermo. */
    const largo = Math.min(vista[2], base[2]);
    const alto = Math.min(vista[3], base[3]);
    vista[2] = largo; vista[3] = alto;
    vista[0] = Math.max(base[0] - largo * 0.1, Math.min(vista[0], base[0] + base[2] - largo * 0.9));
    vista[1] = Math.max(base[1] - alto * 0.1, Math.min(vista[1], base[1] + base[3] - alto * 0.9));
    svg.setAttribute("viewBox", vista.map(function(v){ return v.toFixed(2); }).join(" "));
    if (SI_PUO_RIMPICCIOLIRE) svg.style.setProperty("--controscala", Math.pow(k, -0.35).toFixed(4));
    svg.classList.toggle("ingrandita", k > 1.02);
    if (contenitore) contenitore.classList.toggle("ingrandita", k > 1.02);
    chiediEtichette(k);
  }

  function versoUtente(evento){
    const r = svg.getBoundingClientRect();
    return {
      fx: (evento.clientX - r.left) / r.width,
      fy: (evento.clientY - r.top) / r.height
    };
  }

  function zooma(fattore, fx, fy){
    const nuovoLargo = Math.max(base[2] / ZOOM_MASSIMO, Math.min(base[2], vista[2] / fattore));
    const nuovoAlto = nuovoLargo * base[3] / base[2];
    const ux = vista[0] + fx * vista[2];
    const uy = vista[1] + fy * vista[3];
    vista[0] = ux - fx * nuovoLargo;
    vista[1] = uy - fy * nuovoAlto;
    vista[2] = nuovoLargo;
    vista[3] = nuovoAlto;
    applica();
  }

  svg.addEventListener("wheel", function(e){
    e.preventDefault();
    const p = versoUtente(e);
    zooma(e.deltaY < 0 ? 1.22 : 1 / 1.22, p.fx, p.fy);
  }, { passive: false });

  svg.addEventListener("pointerdown", function(e){
    dita.set(e.pointerId, { x: e.clientX, y: e.clientY });
    trascinato = false;
    if (dita.size === 1){
      partenza = { x: e.clientX, y: e.clientY, vista: vista.slice() };
      if (e.pointerType === "mouse") svg.setPointerCapture(e.pointerId);
    } else if (dita.size === 2){
      const d = Array.from(dita.values());
      distanzaIniziale = Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y);
      vistaIniziale = vista.slice();
    }
  });

  svg.addEventListener("pointermove", function(e){
    if (!dita.has(e.pointerId)) return;
    dita.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();

    if (dita.size >= 2 && vistaIniziale){
      const d = Array.from(dita.values());
      const adesso = Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y);
      if (!distanzaIniziale) return;
      trascinato = true;
      const fattore = adesso / distanzaIniziale;
      const cx = (d[0].x + d[1].x) / 2, cy = (d[0].y + d[1].y) / 2;
      const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
      const largo = Math.max(base[2] / ZOOM_MASSIMO, Math.min(base[2], vistaIniziale[2] / fattore));
      const alto = largo * base[3] / base[2];
      const ux = vistaIniziale[0] + fx * vistaIniziale[2];
      const uy = vistaIniziale[1] + fy * vistaIniziale[3];
      vista = [ux - fx * largo, uy - fy * alto, largo, alto];
      applica();
      e.preventDefault();
      return;
    }

    if (dita.size === 1 && partenza && (ingrandimento() > 1.02 || e.pointerType === "mouse")){
      const dx = (e.clientX - partenza.x) / r.width * partenza.vista[2];
      const dy = (e.clientY - partenza.y) / r.height * partenza.vista[3];
      if (Math.abs(e.clientX - partenza.x) + Math.abs(e.clientY - partenza.y) > 6) trascinato = true;
      if (!trascinato) return;
      vista[0] = partenza.vista[0] - dx;
      vista[1] = partenza.vista[1] - dy;
      applica();
      e.preventDefault();
    }
  });

  function lasciaAndare(e){
    dita.delete(e.pointerId);
    if (dita.size < 2){ distanzaIniziale = 0; vistaIniziale = null; }
    if (!dita.size) partenza = null;
  }
  svg.addEventListener("pointerup", lasciaAndare);
  svg.addEventListener("pointercancel", lasciaAndare);
  svg.addEventListener("pointerleave", lasciaAndare);

  /* Chi ha trascinato voleva spostare la mappa, non aprire una provincia. */
  svg.addEventListener("click", function(e){
    if (trascinato){ e.preventDefault(); e.stopPropagation(); trascinato = false; }
  }, true);

  svg.addEventListener("dblclick", function(e){
    e.preventDefault();
    const p = versoUtente(e);
    zooma(2, p.fx, p.fy);
  });

  /* --- i pulsanti, per chi non se la sente di pizzicare ------------------ */
  const contenitore = svg.parentNode;
  const comandi = document.createElement("div");
  comandi.className = "zoom-comandi";
  comandi.innerHTML =
    '<button type="button" data-fa="piu" aria-label="Ingrandisci">+</button>'
    + '<button type="button" data-fa="meno" aria-label="Rimpicciolisci">&minus;</button>'
    + '<button type="button" data-fa="tutta">Tutta la mappa</button>';
  comandi.addEventListener("click", function(e){
    const b = e.target.closest("button");
    if (!b) return;
    const fa = b.getAttribute("data-fa");
    if (fa === "piu") zooma(1.6, 0.5, 0.5);
    else if (fa === "meno") zooma(1 / 1.6, 0.5, 0.5);
    else { vista = base.slice(); applica(); }
  });
  svg.insertAdjacentElement("afterend", comandi);

  /* --- i nomi dei paesi, quando si e' abbastanza vicini ------------------ */
  let attesaEtichette = 0;
  const gruppo = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gruppo.setAttribute("class", "etichette");
  gruppo.setAttribute("pointer-events", "none");
  svg.appendChild(gruppo);

  function chiediEtichette(k){
    clearTimeout(attesaEtichette);
    attesaEtichette = setTimeout(function(){ scriviEtichette(k); }, 130);
  }

  function scriviEtichette(k){
    if (!svg.querySelector(".paese") || k < 2.4){ gruppo.textContent = ""; return; }
    const dentro = [];
    svg.querySelectorAll(".paese").forEach(function(c){
      const x = parseFloat(c.getAttribute("cx")), y = parseFloat(c.getAttribute("cy"));
      const margineX = vista[2] * 0.09, margineY = vista[3] * 0.05;
      if (x < vista[0] + margineX || x > vista[0] + vista[2] - margineX) return;
      if (y < vista[1] + margineY || y > vista[1] + vista[3] - margineY) return;
      const sugg = c.getAttribute("data-sugg") || "";
      const nome = sugg.replace(/<b>(.*?)<\/b>[\s\S]*/, "$1");
      const quante = parseInt((sugg.match(/<br>([\d.]+)/) || [0, "0"])[1].replace(/\./g, ""), 10) || 0;
      dentro.push({ x: x, y: y, nome: nome, quante: quante, r: parseFloat(c.getAttribute("r")) });
    });
    /* Prima i paesi con piu' scuole: se non ci sta tutto, che restino i
       nomi che contano. */
    dentro.sort(function(a, b){ return b.quante - a.quante; });
    const corpo = vista[2] / 34;
    const scelti = [];
    for (let i = 0; i < dentro.length && scelti.length < 26; i++){
      const t = dentro[i];
      const vicino = scelti.some(function(v){
        return Math.abs(v.x - t.x) < corpo * 4.6 && Math.abs(v.y - t.y) < corpo * 1.6;
      });
      if (!vicino) scelti.push(t);
    }
    gruppo.innerHTML = scelti.map(function(t){
      const controscala = SI_PUO_RIMPICCIOLIRE ? Math.pow(k, -0.35) : 1;
      return '<text class="nome-paese" x="' + t.x + '" y="'
        + (t.y - t.r * controscala - corpo * 0.45).toFixed(2)
        + '" style="font-size:' + corpo.toFixed(2) + 'px">' + esc(t.nome) + "</text>";
    }).join("");
  }

  applica();
}

/* Le mappe compaiono anche dopo, quando arrivano i dati: invece di
   ricordarsi di accendere lo zoom in otto punti diversi, si guarda quello
   che entra nella pagina. */
function sorvegliaMappe(){
  const osservatore = new MutationObserver(function(){
    document.querySelectorAll("svg.mappa:not([data-zoom])").forEach(attivaZoom);
  });
  osservatore.observe(document.getElementById("vista"), { childList: true, subtree: true });
  document.querySelectorAll("svg.mappa:not([data-zoom])").forEach(attivaZoom);
}


/* --- la scheda di una scuola --------------------------------------------- */
function voce(etichetta, valore){
  return '<div class="voce"><div class="et">' + etichetta + '</div><div class="vl">' + valore + "</div></div>";
}

function schedaScuola(i){
  const s = scuola(i);
  const colore = COLORE_FAMIGLIA[s.famiglia];
  const nome = s.nome ? tondo(s.nome) : "Denominazione non depositata";

  let tag = '<span class="tag" style="color:' + colore + '">' + esc(tondo(s.tipologia)) + "</span>";
  if (s.caratteristica !== "NORMALE") tag += '<span class="tag neutro">' + esc(tondo(s.caratteristica)) + "</span>";
  if (s.direttivo) tag += '<span class="tag neutro">Sede direttiva</span>';
  if (!s.sede) tag += '<span class="tag neutro">Non sede scolastica</span>';

  const dove = (s.indirizzo ? esc(tondo(s.indirizzo)) + "<br>" : "")
    + (s.cap ? esc(s.cap) + " " : "")
    + '<a href="#/comune/' + esc(s.comuneCod) + '">' + esc(s.comune) + "</a>"
    + ' (<a href="#/provincia/' + esc(s.provinciaSlug) + '">' + esc(s.sigla) + "</a>)"
    + (s.indirizzo ? "" : "<br>" + vuoto("via e numero civico non depositati"));

  let voci = "";
  voci += voce("Dove", dove);
  voci += voce("Territorio",
    '<a href="#/regione/' + esc(s.regioneSlug) + '">' + esc(s.regione) + "</a> &middot; " + esc(tondo(s.area))
    + '<span class="ricavata">Codice catastale del comune: <span class="mono">' + esc(s.comuneCod) + "</span></span>");
  voci += voce("Istituto",
    '<a href="#/istituto/' + esc(s.istCod) + '">' + esc(tondo(s.istNome) || s.istCod) + "</a>"
    + '<span class="ricavata"><span class="mono">' + esc(s.istCod) + "</span></span>");
  voci += voce("Posta", s.email
    ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>"
      + (s.emailRicavata ? '<span class="ricavata">ricostruita dal codice dell&rsquo;istituto</span>' : "")
    : vuoto("non depositata"));
  /* La posta certificata risulta depositata per due scuole su 50.273: una
     riga che dice "non depositata" cinquantamila volte non informa nessuno,
     occupa e basta. Quando c'e' si vede, quando non c'e' sparisce. */
  if (s.pec) voci += voce("PEC", '<a href="mailto:' + esc(s.pec) + '">' + esc(s.pec) + "</a>");
  voci += voce("Sito", s.sito
    ? '<a href="' + esc(indirizzoWeb(s.sito)) + '" target="_blank" rel="noopener">' + esc(s.sito) + "</a>"
    : vuoto("non depositato"));
  voci += voce("Tipologia", esc(tondo(s.tipologia)));
  voci += voce("Caratteristica", esc(tondo(s.caratteristica)));
  voci += voce("Sede direttiva", s.direttivo ? "S&igrave;" : "No");
  voci += voce("Sede scolastica", s.sede ? "S&igrave;" : "No");
  voci += voce("Omnicomprensivo", s.omni ? '<span class="mono">' + esc(s.omni) + "</span>" : vuoto("non indicato"));

  const mappa = "https://www.google.com/maps/search/?api=1&query="
    + encodeURIComponent((s.indirizzo ? s.indirizzo + ", " : "") + s.cap + " " + s.comune + " " + s.provincia);
  let azioni = '<a class="azione" href="' + esc(mappa) + '" target="_blank" rel="noopener">Portami l&igrave;</a>';
  if (s.email) azioni += '<a class="azione" href="mailto:' + esc(s.email) + '">Scrivi</a>';
  if (s.sito) azioni += '<a class="azione" href="' + esc(indirizzoWeb(s.sito)) + '" target="_blank" rel="noopener">Sito</a>';

  return '<article class="scheda">'
    + '<div class="fascia" style="background:' + colore + '"></div>'
    + '<div class="intestazione">'
    +   '<h2 class="nome"><a href="#/scuola/' + esc(s.codice) + '">' + esc(nome) + "</a></h2>"
    +   '<div class="riga-tag">' + tag + "</div>"
    +   '<button class="codice" type="button" data-codice="' + esc(s.codice) + '">'
    +     "<small>Meccanografico</small>" + esc(s.codice) + "</button>"
    + "</div>"
    + '<div class="corpo">' + voci + "</div>"
    + '<div class="azioni">' + azioni + "</div>"
    + "</article>";
}

/* ===========================================================================
   Le pagine
   =========================================================================== */
const vista = document.getElementById("vista");

function briciole(voci){
  return '<nav class="guscio briciole" aria-label="Dove ti trovi">'
    + voci.map(function(v, k){
        const sep = k ? '<span aria-hidden="true">&rsaquo;</span>' : "";
        return sep + (v.href ? '<a href="' + esc(v.href) + '">' + esc(v.nome) + "</a>" : "<span>" + esc(v.nome) + "</span>");
      }).join("")
    + "</nav>";
}

/* Disegna un elenco di schede un pezzo alla volta. Roma ha 1.271 sedi:
   metterle tutte nella pagina in un colpo solo blocca il telefono per
   parecchi secondi. */
function elencoSchede(dentro, indici){
  let fatte = 0;
  dentro.innerHTML = '<div class="elenco"></div><div class="altre" hidden>'
    + '<button type="button">Mostra altre schede</button></div>';
  const elenco = dentro.querySelector(".elenco");
  const altre = dentro.querySelector(".altre");
  const bottone = altre.querySelector("button");
  function ancora(){
    const fino = Math.min(fatte + PASSO, indici.length);
    let html = "";
    for (let k = fatte; k < fino; k++) html += schedaScuola(indici[k]);
    elenco.insertAdjacentHTML("beforeend", html);
    fatte = fino;
    altre.hidden = fatte >= indici.length;
    bottone.textContent = "Mostra altre " + num(Math.min(PASSO, indici.length - fatte)) + " schede";
  }
  bottone.addEventListener("click", ancora);
  ancora();
}

function famigliaDelleScuole(indici){
  const fam = [0,0,0,0,0,0,0];
  indici.forEach(function(i){ fam[A.iFam[i]]++; });
  return fam;
}

/* --- apertura ------------------------------------------------------------ */
function vistaApertura(){
  const S = SINTESI;
  const regioni = S.elencoRegioni.slice().sort(function(a,b){ return b.tot - a.tot; });
  vista.innerHTML =
    '<section class="blocco"><div class="guscio">'
    + '<p class="occhiello">Anno scolastico ' + annoLeggibile(S.anno) + "</p>"
    + '<h1 class="titolo">Ogni scuola statale italiana, con dentro tutto quello che il ministero ne dichiara</h1>'
    + '<p class="strillo"><b>' + num(S.totale) + "</b> sedi scolastiche in <b>" + num(S.comuni)
    + "</b> comuni, raccolte in <b>" + num(S.istituti) + "</b> istituti. "
    + "Si parte dalla mappa, dai numeri o dal nome di una scuola: si arriva sempre alla sua scheda.</p>"
    + '<div class="pastiglie" style="margin-top:20px">'
    +   '<a class="pastiglia" href="#/cerca"><b>Cerca una scuola</b></a>'
    +   '<a class="pastiglia" href="#/mappa"><b>Apri la mappa</b></a>'
    +   '<a class="pastiglia" href="#/numeri"><b>Guarda i numeri</b></a>'
    + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + numeri([
        { et:"Sedi scolastiche", vl:num(S.totale), nota:"una scheda per ciascuna" },
        { et:"Istituti", vl:num(S.istituti), nota:"le direzioni a cui fanno capo" },
        { et:"Comuni serviti", vl:num(S.comuni), nota:"su circa 7.900 comuni italiani" },
        { et:"Sedi direttive", vl:num(S.sediDirettive), nota:"dove siede la dirigenza" }
      ])
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Dove stanno</h2>'
    + "<p>Il colore misura quante scuole ci sono. Tocca una regione per entrarci.</p></div>"
    + '<div class="mappa-guscio">'
    +   '<div class="riquadro">' + mappa({ livello:"regioni" }) + "</div>"
    +   '<div class="riquadro"><p class="et" style="margin:0 0 10px">Regioni per numero di scuole</p>'
    +     '<div class="classifica-mappa">' + regioni.map(function(r, k){
            return '<a href="#/regione/' + esc(r.s) + '"><span class="pos">' + (k+1)
              + '</span><span class="nome">' + esc(r.n) + '</span><span class="val">' + num(r.tot) + "</span></a>";
          }).join("") + "</div></div>"
    + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Di che scuole si tratta</h2>'
    + "<p>I quattro gradi in ordine, dal pi&ugrave; piccolo al pi&ugrave; grande. Le altre tre famiglie non sono un grado: "
    + "gli istituti comprensivi sono direzioni, i centri territoriali fanno scuola agli adulti, i convitti ospitano.</p></div>"
    + '<div class="riquadro">' + composizione(S.perFamiglia) + "</div>"
    + "</div></section>";
}

/* --- mappa a tutta pagina ------------------------------------------------ */
let livelloMappa = "regioni";
function vistaMappa(){
  const perComuni = livelloMappa === "comuni";
  const perProvincia = livelloMappa === "province";

  /* Al livello dei paesi servono i punti: 250 KB che si chiedono solo qui. */
  if (perComuni && !COMUNI){
    disegnaMappa(attesa("Carico i punti dei 7.896 comuni"));
    conComuni().then(function(){ if (livelloMappa === "comuni") vistaMappa(); })
      .catch(function(){
        disegnaMappa('<div class="avviso"><strong>Punti dei comuni non raggiungibili</strong>'
          + "Manca il collegamento, oppure il file non &egrave; stato pubblicato.</div>");
      });
    return;
  }

  const elenco = perComuni
    ? SINTESI.topComuni.map(function(c){ return { n:c.n, s:c.c, tot:c.tot, dove:"comune" }; })
    : (perProvincia ? SINTESI.elencoProvince : SINTESI.elencoRegioni)
        .slice().sort(function(a,b){ return b.tot - a.tot; })
        .map(function(v){ return { n:v.n, s:v.s, tot:v.tot, dove: perProvincia ? "provincia" : "regione" }; });

  const disegno = perComuni
    ? mappaComuni({ titolo:"I comuni italiani con le loro scuole" })
    : mappa({ livello: livelloMappa });

  disegnaMappa(disegno, elenco, perComuni
    ? "I sessanta comuni con pi&ugrave; scuole"
    : (perProvincia ? "Province" : "Regioni") + " per numero di scuole");
}

function disegnaMappa(disegno, elenco, titoloElenco){
  const bottoni = [["regioni","Regioni"],["province","Province"],["comuni","Comuni"]];
  vista.innerHTML =
    '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa">'
    +   '<div><p class="occhiello">Mappa</p><h1 class="titolo">L&rsquo;Italia per numero di scuole</h1></div>'
    +   '<div class="interruttore" role="group" aria-label="Livello della mappa">'
    +     bottoni.map(function(b){
            return '<button type="button" data-livello="' + b[0] + '" aria-pressed="'
              + (livelloMappa === b[0]) + '">' + b[1] + "</button>";
          }).join("")
    +   "</div>"
    + "</div>"
    + '<div class="mappa-guscio">'
    +   '<div class="riquadro">' + disegno + "</div>"
    +   (elenco
        ? '<div class="riquadro"><p class="et" style="margin:0 0 10px">' + titoloElenco + "</p>"
          + '<div class="classifica-mappa">' + elenco.map(function(r, k){
              return '<a href="#/' + r.dove + "/" + esc(r.s) + '"><span class="pos">' + (k+1)
                + '</span><span class="nome">' + esc(r.n) + '</span><span class="val">'
                + num(r.tot) + "</span></a>";
            }).join("") + "</div></div>"
        : "")
    + "</div>"
    + '<p class="strillo" style="margin-top:18px">Trentino-Alto Adige e Valle d&rsquo;Aosta gestiscono le proprie '
    + "scuole e non compaiono nell&rsquo;anagrafe statale: sulla mappa restano grigie.</p>"
    + "</div></section>";

  vista.querySelectorAll(".interruttore button").forEach(function(b){
    b.addEventListener("click", function(){
      livelloMappa = b.getAttribute("data-livello");
      vistaMappa();
    });
  });
}

/* --- numeri --------------------------------------------------------------- */
function vistaNumeri(){
  const S = SINTESI;
  const regioni = S.elencoRegioni.slice().sort(function(a,b){ return b.tot - a.tot; });
  const tipologie = S.perTipologia.slice(0, 14);
  const resto = S.perTipologia.slice(14);
  const restoTot = resto.reduce(function(a,b){ return a + b[1]; }, 0);

  const completezza = [
    { nome:"Indirizzo di posta", valore: S.totale - S.mancanti.posta },
    { nome:"Sito internet", valore: S.totale - S.mancanti.sito },
    { nome:"Via e numero civico", valore: S.totale - S.mancanti.indirizzo },
    { nome:"Denominazione", valore: S.totale - S.mancanti.nome },
    { nome:"Posta certificata", valore: S.totale - S.mancanti.pec }
  ];

  vista.innerHTML =
    '<section class="blocco"><div class="guscio">'
    + '<p class="occhiello">Numeri</p>'
    + '<h1 class="titolo">Cosa dicono i dati, contati</h1>'
    + '<p class="strillo">Tutti i conteggi vengono dall&rsquo;anagrafe ministeriale dell&rsquo;anno '
    + annoLeggibile(S.anno) + ". Nessuna stima, nessun arrotondamento.</p>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Composizione per grado</h2>'
    + "<p>La barra &egrave; l&rsquo;Italia intera: ogni pezzo una famiglia di scuole.</p></div>"
    + '<div class="riquadro">' + composizione(S.perFamiglia) + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Le regioni</h2>'
    + "<p>Quante sedi scolastiche ha ciascuna. Tocca una barra per aprire la regione.</p></div>"
    + '<div class="riquadro">' + classifica(regioni.map(function(r){
        return { nome:r.n, sotto:r.prov + " province, " + num(r.com) + " comuni",
                 valore:r.tot, href:"#/regione/" + r.s };
      })) + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Le quaranta tipologie del ministero</h2>'
    + "<p>Dalla scuola dell&rsquo;infanzia all&rsquo;istituto nautico. Le prime quattordici; il resto sta nella tavola.</p></div>"
    + '<div class="riquadro">' + classifica(tipologie.map(function(t){
        return { nome: tondo(t[0]), valore: t[1] };
      })) + "</div>"
    + '<div class="riquadro" style="margin-top:14px"><div class="tavola-guscio"><table class="tabellina">'
    + "<caption>Le altre " + resto.length + " tipologie, " + num(restoTot) + " sedi in tutto</caption>"
    + "<thead><tr><th>Tipologia</th><th style=\"text-align:right\">Sedi</th></tr></thead><tbody>"
    + resto.map(function(t){
        return "<tr><td>" + esc(tondo(t[0])) + '</td><td class="n">' + num(t[1]) + "</td></tr>";
      }).join("")
    + "</tbody></table></div></div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Com&rsquo;&egrave; tenuta l&rsquo;anagrafe</h2>'
    + "<p>Quante sedi hanno il campo compilato, su " + num(S.totale) + ". La posta certificata "
    + "risulta depositata per " + num(S.totale - S.mancanti.pec) + " sedi: il campo esiste, quasi nessuno lo riempie.</p></div>"
    + '<div class="riquadro">' + classifica(completezza) + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="griglia due">'
    +   '<div class="riquadro"><p class="et" style="margin:0 0 12px">I venti comuni con piu&rsquo; scuole</p>'
    +     classifica(S.topComuni.slice(0,20).map(function(c){
            return { nome: c.n, sotto: c.p, valore: c.tot, href:"#/comune/" + c.c };
          })) + "</div>"
    +   '<div class="riquadro"><p class="et" style="margin:0 0 12px">I venti istituti con piu&rsquo; sedi</p>'
    +     classifica(S.topIstituti.slice(0,20).map(function(c){
            return { nome: tondo(c.n) || c.c, sotto: c.m, valore: c.tot, href:"#/istituto/" + c.c };
          })) + "</div>"
    + "</div>"
    + "</div></section>";
}

/* --- elenco dei territori ------------------------------------------------- */
function vistaTerritori(){
  const S = SINTESI;
  const regioni = S.elencoRegioni.slice().sort(function(a,b){ return a.n < b.n ? -1 : 1; });
  vista.innerHTML =
    '<section class="blocco"><div class="guscio">'
    + '<p class="occhiello">Territori</p>'
    + '<h1 class="titolo">Regioni e province</h1>'
    + '<p class="strillo">Diciotto regioni e ' + S.province + " province nell&rsquo;anagrafe statale. "
    + "Ogni riquadro porta alla pagina della regione; le sigle alle singole province.</p>"
    + "</div></section>"
    + '<section class="blocco"><div class="guscio"><div class="griglia due">'
    + regioni.map(function(r){
        const prov = S.elencoProvince.filter(function(p){ return p.rs === r.s; })
          .sort(function(a,b){ return a.n < b.n ? -1 : 1; });
        return '<div class="riquadro">'
          + '<h2 class="sezione" style="font-size:20px"><a href="#/regione/' + esc(r.s)
          + '" style="text-decoration:none">' + esc(r.n) + "</a></h2>"
          + '<p class="nota" style="color:var(--testo-tenue);font-size:13px;margin:4px 0 12px">'
          + num(r.tot) + " scuole &middot; " + r.prov + " province &middot; " + num(r.com) + " comuni</p>"
          + '<div class="pastiglie">' + prov.map(function(p){
              return '<a class="pastiglia" href="#/provincia/' + esc(p.s) + '"><b>' + esc(p.n)
                + "</b> <span>" + num(p.tot) + "</span></a>";
            }).join("") + "</div></div>";
      }).join("")
    + "</div></div></section>";
}

/* --- una regione ---------------------------------------------------------- */
function vistaRegione(slug){
  const r = SINTESI.elencoRegioni.filter(function(v){ return v.s === slug; })[0];
  if (!r) return vistaNonTrovata("Questa regione non \u00e8 nell'anagrafe statale.");
  const prov = SINTESI.elencoProvince.filter(function(p){ return p.rs === slug; })
    .sort(function(a,b){ return b.tot - a.tot; });

  vista.innerHTML = briciole([{nome:"Apertura", href:"#/"}, {nome:"Regioni", href:"#/territori"}, {nome:r.n}])
    + '<section class="blocco"><div class="guscio">'
    + '<p class="occhiello">Regione &middot; ' + esc(tondo(r.area)) + "</p>"
    + '<h1 class="titolo">' + esc(r.n) + "</h1>"
    + '<p class="strillo"><b>' + num(r.tot) + "</b> sedi scolastiche in <b>" + num(r.com)
    + "</b> comuni, distribuite su <b>" + r.prov + "</b> province. "
    + "Sono il <b>" + pct(r.tot, SINTESI.totale) + "</b> delle scuole statali italiane.</p>"
    + '<div class="pastiglie" style="margin-top:18px">'
    +   '<a class="pastiglia" href="#/cerca?reg=' + esc(slug) + '"><b>Cerca tra queste scuole</b></a>'
    + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Le province</h2>'
    + "<p>Tocca una provincia sulla mappa o nell&rsquo;elenco.</p></div>"
    + '<div class="mappa-guscio">'
    +   '<div class="riquadro">' + mappa({ livello:"province", regione:r.n }) + "</div>"
    +   '<div class="riquadro">' + classifica(prov.map(function(p){
            return { nome:p.n, sotto:num(p.com) + " comuni", valore:p.tot, href:"#/provincia/" + p.s };
          })) + "</div>"
    + "</div>"
    + "</div></section>"

    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Composizione per grado</h2></div>'
    + '<div class="riquadro">' + composizione(r.fam) + "</div>"
    + "</div></section>";
}

function vistaNonTrovata(testo){
  vista.innerHTML = '<section class="blocco"><div class="guscio"><div class="avviso">'
    + "<strong>Non trovata</strong>" + esc(testo || "")
    + '<p style="margin-top:16px"><a class="pastiglia" href="#/">Torna all&rsquo;apertura</a></p>'
    + "</div></div></section>";
}

/* --- attesa dell'anagrafe -------------------------------------------------
   Quattro megabyte e mezzo non arrivano istantanei: meglio dirlo che lasciare
   la pagina bianca. */
function attesa(testo){
  return '<div class="attesa"><span class="rotella"></span><span>' + esc(testo) + "</span></div>";
}
function conAttesa(dentro, poi){
  dentro.innerHTML = attesa("Carico l'anagrafe delle 50.273 scuole, un momento solo");
  conAnagrafe().then(poi).catch(function(){
    dentro.innerHTML = '<div class="avviso"><strong>Anagrafe non raggiungibile</strong>'
      + "Manca il collegamento, oppure il file dei dati non &egrave; stato pubblicato.</div>";
  });
}

/* --- una provincia -------------------------------------------------------- */
function vistaProvincia(slug){
  const p = SINTESI.elencoProvince.filter(function(v){ return v.s === slug; })[0];
  if (!p) return vistaNonTrovata("Questa provincia non \u00e8 nell'anagrafe statale.");

  vista.innerHTML = briciole([
      {nome:"Apertura", href:"#/"}, {nome:"Regioni", href:"#/territori"},
      {nome:p.r, href:"#/regione/" + p.rs}, {nome:p.n}])
    + '<section class="blocco"><div class="guscio">'
    + '<p class="occhiello">Provincia di ' + esc(p.r) + "</p>"
    + '<h1 class="titolo">' + esc(p.n) + "</h1>"
    + '<p class="strillo"><b>' + num(p.tot) + "</b> sedi scolastiche in <b>" + num(p.com)
    + "</b> comuni. Sigla automobilistica <b>" + esc(p.a) + "</b>.</p>"
    + '<div class="pastiglie" style="margin-top:18px">'
    +   '<a class="pastiglia" href="#/cerca?prov=' + esc(slug) + '"><b>Cerca tra queste scuole</b></a>'
    + "</div>"
    + "</div></section>"
    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">Composizione per grado</h2></div>'
    + '<div class="riquadro">' + composizione(p.fam) + "</div>"
    + "</div></section>"
    + '<section class="blocco"><div class="guscio">'
    + '<div class="sezione-testa"><h2 class="sezione">I paesi della provincia</h2>'
    + "<p>Ogni cerchio &egrave; un comune, grande quanto le scuole che ha. Toccalo per entrarci.</p></div>"
    + '<div class="riquadro" id="paesi-provincia"></div>'
    + "</div></section>"
    + '<section class="blocco"><div class="guscio" id="dettaglio-provincia"></div></section>';

  const riquadroPaesi = document.getElementById("paesi-provincia");
  riquadroPaesi.innerHTML = attesa("Carico i punti dei comuni");
  conComuni().then(function(){
    if (document.getElementById("paesi-provincia") === riquadroPaesi){
      riquadroPaesi.innerHTML = mappaComuni({ provincia: slug, titolo: "I comuni della provincia di " + p.n });
    }
  }).catch(function(){
    riquadroPaesi.innerHTML = '<div class="avviso"><strong>Punti dei comuni non raggiungibili</strong></div>';
  });

  conAttesa(document.getElementById("dettaglio-provincia"), function(){
    const ip = A.PROV.findIndex(function(v){ return v[1] === slug; });
    const indici = A.perProvincia.get(ip) || [];
    const perComune = new Map(), perIstituto = new Map();
    indici.forEach(function(i){
      perComune.set(A.iCom[i], (perComune.get(A.iCom[i]) || 0) + 1);
      perIstituto.set(A.iIst[i], (perIstituto.get(A.iIst[i]) || 0) + 1);
    });
    const comuni = Array.from(perComune.entries())
      .map(function(e){ return { nome: A.COM[e[0]][1], valore: e[1], href:"#/comune/" + A.COM[e[0]][0] }; })
      .sort(function(a,b){ return b.valore - a.valore || (a.nome < b.nome ? -1 : 1); });
    const istituti = Array.from(perIstituto.entries())
      .map(function(e){ return { nome: tondo(A.IST[e[0]][1]) || A.IST[e[0]][0], valore: e[1],
                                 href:"#/istituto/" + A.IST[e[0]][0] }; })
      .sort(function(a,b){ return b.valore - a.valore; }).slice(0, 20);

    document.getElementById("dettaglio-provincia").innerHTML =
      '<div class="griglia due">'
      + '<div class="riquadro"><p class="et" style="margin:0 0 12px">Tutti i ' + comuni.length
      +   " comuni, per numero di scuole</p>" + classifica(comuni) + "</div>"
      + '<div class="riquadro"><p class="et" style="margin:0 0 12px">I venti istituti con piu&rsquo; sedi</p>'
      +   classifica(istituti) + "</div>"
      + "</div>";
  });
}

/* --- la mappa di Google, quando c'e' la chiave ---------------------------
   La Maps Embed API vuole l'indirizzo scritto, non le coordinate: e' Google
   a cercare il posto. Vuol dire che non serve tradurre in latitudine e
   longitudine cinquantamila indirizzi - che sarebbe la parte cara - per
   avere la mappa vera di una singola scuola.
   Senza chiave la funzione restituisce niente e resta il localizzatore. */
function mappaGoogle(s){
  if (typeof CHIAVE_GOOGLE === "undefined" || !CHIAVE_GOOGLE) return "";
  const posto = (s.indirizzo ? s.indirizzo + ", " : "") + (s.cap ? s.cap + " " : "")
    + s.comune + ", " + s.provincia + ", Italia";
  const sorgente = "https://www.google.com/maps/embed/v1/place?key=" + encodeURIComponent(CHIAVE_GOOGLE)
    + "&q=" + encodeURIComponent(posto) + "&language=it&region=IT&zoom=16";
  return '<div class="google"><iframe src="' + esc(sorgente) + '" loading="lazy"'
    + ' referrerpolicy="no-referrer-when-downgrade" allowfullscreen'
    + ' title="Mappa di Google sull&rsquo;indirizzo della scuola"></iframe></div>'
    + '<p class="nota-mappa">Mappa di Google sull&rsquo;indirizzo depositato in anagrafe. '
    + "Se l&rsquo;indirizzo &egrave; scritto male, sbaglia anche lei: il posto lo cerca da quella riga.</p>";
}

/* Dove sta il paese, dentro la sua provincia. Non e' la via: e' il colpo
   d'occhio che dice "e' quassu' in montagna" o "e' sulla costa". Per la via
   c'e' il pulsante che apre il navigatore. */
function localizzatore(dentro, provinciaSlug, codiceComune, nomeProvincia){
  dentro.innerHTML = attesa("Carico i punti dei comuni");
  conComuni().then(function(){
    if (!dentro.isConnected) return;
    dentro.innerHTML = mappaComuni({
      provincia: provinciaSlug,
      evidenzia: codiceComune,
      titolo: "Dove sta il comune nella provincia di " + nomeProvincia
    });
  }).catch(function(){
    dentro.innerHTML = '<div class="avviso"><strong>Punti dei comuni non raggiungibili</strong></div>';
  });
}

/* --- un comune ------------------------------------------------------------ */
function vistaComune(codice){
  vista.innerHTML = '<section class="blocco"><div class="guscio" id="contenuto-comune"></div></section>';
  conAttesa(document.getElementById("contenuto-comune"), function(){
    const ic = A.comuneDaCodice.get(codice);
    if (ic === undefined) return vistaNonTrovata("Nessun comune con questo codice catastale.");
    const indici = (A.perComune.get(ic) || []).slice()
      .sort(function(a,b){ return A.rango[a] - A.rango[b]; });
    const uno = scuola(indici[0]);
    vista.innerHTML = briciole([
        {nome:"Apertura", href:"#/"}, {nome:uno.regione, href:"#/regione/" + uno.regioneSlug},
        {nome:uno.provincia, href:"#/provincia/" + uno.provinciaSlug}, {nome:uno.comune}])
      + '<section class="blocco"><div class="guscio">'
      + '<p class="occhiello">Comune &middot; ' + esc(uno.provincia) + "</p>"
      + '<h1 class="titolo">' + esc(uno.comune) + "</h1>"
      + '<p class="strillo"><b>' + num(indici.length) + "</b> "
      + (indici.length === 1 ? "sede scolastica statale" : "sedi scolastiche statali")
      + ". Codice catastale <b>" + esc(codice) + "</b>.</p>"
      + "</div></section>"
      + '<section class="blocco"><div class="guscio">'
      + '<div class="locatore">'
      +   '<div class="riquadro" id="dove-comune"></div>'
      +   '<div class="riquadro">' + composizione(famigliaDelleScuole(indici)) + "</div>"
      + "</div>"
      + '<div id="schede-comune"></div>'
      + "</div></section>";
    localizzatore(document.getElementById("dove-comune"), uno.provinciaSlug, codice, uno.provincia);
    elencoSchede(document.getElementById("schede-comune"), indici);
  });
}

/* --- un istituto ---------------------------------------------------------- */
function vistaIstituto(codice){
  vista.innerHTML = '<section class="blocco"><div class="guscio" id="contenuto-istituto"></div></section>';
  conAttesa(document.getElementById("contenuto-istituto"), function(){
    const ii = A.istitutoDaCodice.get(codice);
    if (ii === undefined) return vistaNonTrovata("Nessun istituto con questo codice meccanografico.");
    const indici = (A.perIstituto.get(ii) || []).slice();
    const uno = scuola(indici[0]);
    const direttiva = indici.filter(function(i){ return A.RIGHE[i].split("\t")[9].charAt(0) === "1"; })[0];
    vista.innerHTML = briciole([
        {nome:"Apertura", href:"#/"}, {nome:uno.regione, href:"#/regione/" + uno.regioneSlug},
        {nome:uno.provincia, href:"#/provincia/" + uno.provinciaSlug},
        {nome:uno.comune, href:"#/comune/" + uno.comuneCod}, {nome:"Istituto"}])
      + '<section class="blocco"><div class="guscio">'
      + '<p class="occhiello">Istituto di riferimento</p>'
      + '<h1 class="titolo">' + esc(tondo(uno.istNome) || codice) + "</h1>"
      + '<p class="strillo">Codice <b>' + esc(codice) + "</b>. Da questa direzione dipendono <b>"
      + num(indici.length) + "</b> "
      + (indici.length === 1 ? "sede" : "sedi")
      + (direttiva !== undefined
          ? ", con la sede direttiva a " + esc(scuola(direttiva).comune) : "")
      + ".</p>"
      + "</div></section>"
      + '<section class="blocco"><div class="guscio">'
      + '<div class="riquadro">' + composizione(famigliaDelleScuole(indici)) + "</div>"
      + '<div id="schede-istituto"></div>'
      + "</div></section>";
    elencoSchede(document.getElementById("schede-istituto"), indici);
  });
}

/* --- una scuola ----------------------------------------------------------- */
function vistaScuola(codice){
  vista.innerHTML = '<section class="blocco"><div class="guscio" id="contenuto-scuola"></div></section>';
  conAttesa(document.getElementById("contenuto-scuola"), function(){
    const i = A.perCodice.get(codice);
    if (i === undefined) return vistaNonTrovata("Nessuna scuola con questo codice meccanografico.");
    const s = scuola(i);
    const sorelle = (A.perIstituto.get(A.iIst[i]) || []).filter(function(k){ return k !== i; });
    vista.innerHTML = briciole([
        {nome:"Apertura", href:"#/"}, {nome:s.regione, href:"#/regione/" + s.regioneSlug},
        {nome:s.provincia, href:"#/provincia/" + s.provinciaSlug},
        {nome:s.comune, href:"#/comune/" + s.comuneCod}, {nome:tondo(s.nome) || s.codice}])
      + '<section class="blocco"><div class="guscio">'
      + '<div class="locatore">'
      +   "<div>" + schedaScuola(i) + "</div>"
      +   '<div class="riquadro" id="dove-scuola"></div>'
      + "</div>"
      + "</div></section>"
      + (sorelle.length
        ? '<section class="blocco"><div class="guscio">'
          + '<div class="sezione-testa"><h2 class="sezione">Le altre sedi dello stesso istituto</h2>'
          + '<p><a href="#/istituto/' + esc(s.istCod) + '">' + esc(tondo(s.istNome) || s.istCod)
          + "</a> ne ha " + num(sorelle.length + 1) + " in tutto.</p></div>"
          + '<div class="pastiglie">' + sorelle.map(function(k){
              const t = scuola(k);
              return '<a class="pastiglia" href="#/scuola/' + esc(t.codice) + '"><b>'
                + esc(tondo(t.nome) || t.codice) + "</b> <span>" + esc(tondo(t.tipologia)) + "</span></a>";
            }).join("") + "</div>"
          + "</div></section>"
        : "");
    const riquadroGoogle = mappaGoogle(s);
    if (riquadroGoogle){
      document.getElementById("dove-scuola").innerHTML = riquadroGoogle;
      const sotto = document.createElement("div");
      sotto.className = "riquadro";
      sotto.style.marginTop = "14px";
      document.getElementById("dove-scuola").after(sotto);
      localizzatore(sotto, s.provinciaSlug, s.comuneCod, s.provincia);
    } else {
      localizzatore(document.getElementById("dove-scuola"), s.provinciaSlug, s.comuneCod, s.provincia);
    }
  });
}

/* --- ricerca --------------------------------------------------------------
   I comandi si disegnano subito, con i soli dati della sintesi: si puo'
   cominciare a scrivere mentre l'anagrafe sta ancora arrivando. */
const F = { q:"", reg:"", prov:"", fam:-1 };
const PASSO = 24;
let risultati = [], mostrate = 0;

function vistaCerca(par){
  F.q = par.get("q") || "";
  F.reg = par.get("reg") || "";
  F.prov = par.get("prov") || "";
  F.fam = par.has("g") ? parseInt(par.get("g"), 10) : -1;

  const regioni = SINTESI.elencoRegioni.slice().sort(function(a,b){ return a.n < b.n ? -1 : 1; });
  vista.innerHTML =
    '<div class="comandi"><div class="guscio">'
    + '<div class="cerca">'
    +   '<input id="q" type="search" inputmode="search" autocomplete="off" value="' + esc(F.q) + '"'
    +   ' placeholder="Cerca scuola, comune o codice" aria-label="Cerca scuola, comune o codice">'
    +   '<button class="pulisci" id="pulisci" type="button"' + (F.q ? "" : " hidden") + ">Pulisci</button>"
    + "</div>"
    + '<div class="filtri">'
    +   '<select id="freg" aria-label="Regione"><option value="">Tutte le regioni</option>'
    +     regioni.map(function(r){
            return '<option value="' + esc(r.s) + '"' + (r.s === F.reg ? " selected" : "") + ">"
              + esc(r.n) + "</option>";
          }).join("") + "</select>"
    +   '<select id="fprov" aria-label="Provincia"></select>'
    + "</div>"
    + '<div class="gradi" id="gradi" role="group" aria-label="Grado di istruzione"></div>'
    + "</div></div>"
    + '<div class="guscio">'
    + '<p class="esito"><span><b id="conteggio">&mdash;</b> <span id="parola">scuole</span></span>'
    + '<span>in ordine di comune</span></p>'
    + '<div class="elenco" id="elenco"></div>'
    + '<div id="stato"></div>'
    + '<div class="altre" id="altre" hidden><button type="button" id="ancora">Mostra altre schede</button></div>'
    + "</div>";

  const gradi = document.getElementById("gradi");
  SINTESI.famiglie.forEach(function(nome, k){
    if (k === 4) gradi.insertAdjacentHTML("beforeend", '<span class="stacco" aria-hidden="true"></span>');
    const b = document.createElement("button");
    b.type = "button";
    b.className = "grado";
    b.setAttribute("aria-pressed", k === F.fam ? "true" : "false");
    /* Solo i primi quattro portano il pallino: gli altri tre non stanno
       sulla scala dei gradi, e fingerlo sarebbe una bugia grafica. */
    b.innerHTML = (k < 4 ? '<span class="pallino" style="background:' + COLORE_FAMIGLIA[k] + '"></span>' : "")
      + esc(nome);
    b.addEventListener("click", function(){
      F.fam = (F.fam === k) ? -1 : k;
      scriviIndirizzo();
    });
    gradi.appendChild(b);
  });

  popolaProvince();
  document.getElementById("freg").addEventListener("change", function(){
    F.reg = this.value; F.prov = ""; scriviIndirizzo();
  });
  document.getElementById("fprov").addEventListener("change", function(){
    F.prov = this.value; scriviIndirizzo();
  });
  const campo = document.getElementById("q");
  let attesaTasti = 0;
  campo.addEventListener("input", function(){
    clearTimeout(attesaTasti);
    attesaTasti = setTimeout(function(){ F.q = campo.value.trim(); scriviIndirizzo(true); }, 160);
  });
  document.getElementById("pulisci").addEventListener("click", function(){
    campo.value = ""; F.q = ""; scriviIndirizzo(true); campo.focus();
  });
  document.getElementById("ancora").addEventListener("click", disegnaAltre);

  if (A) aggiornaRicerca();
  else {
    document.getElementById("stato").innerHTML = attesa("Carico l'anagrafe delle 50.273 scuole");
    conAnagrafe().then(function(){
      if (document.getElementById("elenco")) aggiornaRicerca();
    }).catch(function(){
      const st = document.getElementById("stato");
      if (st) st.innerHTML = '<div class="avviso"><strong>Anagrafe non raggiungibile</strong>'
        + "Manca il collegamento, oppure il file dei dati non &egrave; stato pubblicato.</div>";
    });
  }
}

function popolaProvince(){
  const sel = document.getElementById("fprov");
  if (!sel) return;
  const lista = SINTESI.elencoProvince
    .filter(function(p){ return !F.reg || p.rs === F.reg; })
    .sort(function(a,b){ return a.n < b.n ? -1 : 1; });
  sel.innerHTML = '<option value="">Tutte le province</option>'
    + lista.map(function(p){
        return '<option value="' + esc(p.s) + '"' + (p.s === F.prov ? " selected" : "") + ">"
          + esc(p.n) + "</option>";
      }).join("");
  if (!lista.some(function(p){ return p.s === F.prov; })) F.prov = "";
}

/* L'indirizzo tiene lo stato della ricerca: si puo' salvare un risultato o
   mandarlo a qualcuno, e il tasto indietro fa quello che ci si aspetta. */
let ignoraProssimoIndirizzo = false;
function scriviIndirizzo(sostituisci){
  const par = new URLSearchParams();
  if (F.q) par.set("q", F.q);
  if (F.reg) par.set("reg", F.reg);
  if (F.prov) par.set("prov", F.prov);
  if (F.fam >= 0) par.set("g", String(F.fam));
  const testo = "#/cerca" + (par.toString() ? "?" + par.toString() : "");
  ignoraProssimoIndirizzo = true;
  if (sostituisci) history.replaceState(null, "", testo);
  else history.pushState(null, "", testo);
  /* Cambiato l'indirizzo, si aggiorna a mano: l'instradatore non deve
     ridisegnare i comandi mentre si sta scrivendo dentro. */
  popolaProvince();
  document.querySelectorAll("#gradi .grado").forEach(function(b, k){
    b.setAttribute("aria-pressed", k === F.fam ? "true" : "false");
  });
  const pul = document.getElementById("pulisci");
  if (pul) pul.hidden = !F.q;
  if (A) aggiornaRicerca();
}

function filtra(){
  const parole = F.q.toLowerCase().split(/\s+/).filter(Boolean);
  const reg = F.reg ? A.REG.findIndex(function(r){ return r[1] === F.reg; }) : -1;
  const prov = F.prov ? A.PROV.findIndex(function(p){ return p[1] === F.prov; }) : -1;
  const out = [];
  for (let k = 0; k < A.ordine.length; k++){
    const i = A.ordine[k];
    if (prov >= 0 && A.iProv[i] !== prov) continue;
    if (reg >= 0 && n36(A.PROV[A.iProv[i]][3]) !== reg) continue;
    if (F.fam >= 0 && A.iFam[i] !== F.fam) continue;
    if (parole.length){
      const c = A.chiave[i];
      let ok = true;
      for (let p = 0; p < parole.length; p++){
        if (c.indexOf(parole[p]) < 0){ ok = false; break; }
      }
      if (!ok) continue;
    }
    out.push(i);
  }
  return out;
}

function disegnaAltre(){
  const elenco = document.getElementById("elenco");
  const fino = Math.min(mostrate + PASSO, risultati.length);
  let html = "";
  for (let k = mostrate; k < fino; k++) html += schedaScuola(risultati[k]);
  elenco.insertAdjacentHTML("beforeend", html);
  mostrate = fino;
  const altre = document.getElementById("altre");
  altre.hidden = mostrate >= risultati.length;
  document.getElementById("ancora").textContent =
    "Mostra altre " + num(Math.min(PASSO, risultati.length - mostrate)) + " schede";
}

function aggiornaRicerca(){
  const elenco = document.getElementById("elenco");
  if (!elenco) return;
  risultati = filtra();
  mostrate = 0;
  elenco.innerHTML = "";
  document.getElementById("stato").innerHTML = "";
  document.getElementById("conteggio").textContent = num(risultati.length);
  document.getElementById("parola").textContent = risultati.length === 1 ? "scuola" : "scuole";
  if (!risultati.length){
    document.getElementById("stato").innerHTML =
      '<div class="avviso"><strong>Nessuna scuola con questi filtri</strong>'
      + "Prova con meno parole, o togli la provincia.</div>";
    document.getElementById("altre").hidden = true;
    return;
  }
  disegnaAltre();
}

/* ===========================================================================
   Instradamento
   =========================================================================== */
function instrada(){
  const grezzo = location.hash.replace(/^#/, "") || "/";
  const taglio = grezzo.indexOf("?");
  const percorso = taglio < 0 ? grezzo : grezzo.slice(0, taglio);
  const par = new URLSearchParams(taglio < 0 ? "" : grezzo.slice(taglio + 1));
  const p = percorso.split("/").filter(Boolean);

  document.querySelectorAll("#menu a").forEach(function(a){
    const suo = a.getAttribute("href").replace(/^#/, "").split("/").filter(Boolean);
    const attivo = (suo.length === 0 && p.length === 0) || (suo.length && suo[0] === p[0]);
    if (attivo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  switch (p[0]){
    case undefined: vistaApertura(); break;
    case "mappa": vistaMappa(); break;
    case "numeri": vistaNumeri(); break;
    case "territori": vistaTerritori(); break;
    case "cerca": vistaCerca(par); break;
    case "regione": vistaRegione(decodeURIComponent(p[1] || "")); break;
    case "provincia": vistaProvincia(decodeURIComponent(p[1] || "")); break;
    case "comune": vistaComune(decodeURIComponent(p[1] || "")); break;
    case "istituto": vistaIstituto(decodeURIComponent(p[1] || "")); break;
    case "scuola": vistaScuola(decodeURIComponent(p[1] || "")); break;
    default: vistaNonTrovata("Questo indirizzo non corrisponde a niente.");
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", function(){
  /* Se il cambio d'indirizzo l'ha scritto la ricerca stessa, i comandi
     restano dove sono e non si perde il testo mentre si scrive. */
  if (ignoraProssimoIndirizzo){ ignoraProssimoIndirizzo = false; return; }
  instrada();
});
window.addEventListener("popstate", function(){
  ignoraProssimoIndirizzo = false;
  instrada();
});

/* --- gesti comuni a tutte le pagine --------------------------------------- */
document.addEventListener("click", function(e){
  const b = e.target.closest && e.target.closest(".codice");
  if (b && navigator.clipboard){
    const testo = b.getAttribute("data-codice");
    navigator.clipboard.writeText(testo).then(function(){ avvisoCopia("Copiato " + testo); }, function(){});
  }
});
document.addEventListener("mouseover", function(e){
  const t = e.target.closest && e.target.closest("[data-sugg]");
  if (t) mostraSugg(e, t.getAttribute("data-sugg"));
});
document.addEventListener("mousemove", function(e){
  const t = e.target.closest && e.target.closest("[data-sugg]");
  if (t) mostraSugg(e, t.getAttribute("data-sugg"));
  else nascondiSugg();
});
document.addEventListener("mouseleave", nascondiSugg);
window.addEventListener("blur", nascondiSugg);

sorvegliaMappe();
instrada();
