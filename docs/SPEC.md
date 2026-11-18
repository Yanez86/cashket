# Cashket — specifica

Documento di riferimento per costruire Cashket. Raccoglie le decisioni prese finora; dove una scelta è
ancora aperta è segnata con **Da decidere**.

## 1. Cos'è

Cashket è un'app **personale e self-hosted** per gestire le spese di casa con il **budgeting a bucket**:
ogni euro che entra viene assegnato a un bucket con uno scopo (spesa, bollette, vacanza…) e ogni spesa
si registra contro un bucket. Il saldo di un bucket dice quanto resta da spendere.

- **PWA mobile**, installabile sul telefono, usabile anche offline per l'inserimento.
- **Self-hosted con Docker**, raggiungibile da fuori tramite **Cloudflare Tunnel**.
- **Multiutente per una casa**: poche utenze, non un servizio pubblico.
- Stesso stack, stessa struttura e stesse regole grafiche di [Mealler](https://github.com/Yanez86/mealler).

### Fuori scope (per ora)

- Pagamenti, bonifici o qualunque operazione che muova denaro: Cashket legge e basta.
- Investimenti, titoli, criptovalute.
- Più valute nello stesso bucket (tutto in euro; una spesa in valuta estera si registra al controvalore addebitato).
- Uso da parte di più case sulla stessa installazione.

## 2. Utenti e privacy

- Al primo avvio si crea l'**amministratore** (come in Mealler); gli altri entrano su **invito**.
- I **bucket sono personali**: ognuno vede e gestisce solo i propri bucket, conti, spese e regole.
- L'amministratore gestisce le utenze, non legge i dati degli altri.
- **Da decidere**: bucket condivisi di casa (es. "Spesa di casa" alimentato da più persone) in una versione successiva.

## 3. Concetti

| Concetto | Significato |
| --- | --- |
| **Conto** | Da dove escono o entrano i soldi: conto corrente, carta di credito, PayPal, contanti. |
| **Movimento** | Una riga di denaro su un conto: spesa, entrata, giroconto. |
| **Bucket** | Un contenitore di budget con uno scopo e una regola di riempimento. |
| **Categoria** | L'icona e il nome di un bucket (24 pronte + personalizzata). |
| **Periodo** | Il mese di budget. Le assegnazioni avvengono per periodo. |
| **Coda** | Le spese inserite a mano durante la giornata, non ancora sistemate. |
| **Sessione** | Il momento in cui importi l'estratto, abbini, assegni e controlli. |
| **Lotto** | Un import (file CSV o scaricamento automatico), annullabile per intero. |
| **Regola** | "Descrizione che contiene X → bucket Y", creata confermando un'assegnazione. |

## 4. Bucket

### 4.1 Tipi

- **Spesa**: si ricarica a ogni periodo (spesa, bollette, svago…).
- **Accumulo**: non si azzera, ha un **obiettivo** facoltativo (vacanza 1.500 €, fondo emergenze…).

### 4.2 Come si riempie un bucket

Ogni bucket ha **una** regola di riempimento:

- **Fisso**: un importo in euro per periodo.
- **Percentuale**: una quota delle **entrate base** del periodo.
- **Resto**: riceve ciò che avanza dopo gli altri. Al massimo un bucket "resto" per utente (di solito Risparmio).

Ordine di assegnazione: **fissi → percentuali → resto**. Se le entrate non bastano a coprire fissi e
percentuali, l'app lo segnala e lascia la differenza "da assegnare" negativa: non taglia nulla da sola.

### 4.3 Entrate base

Solo le entrate con il flag **base budget** contano per le percentuali (lo stipendio sì; un rimborso, un
giroconto o una vendita usata no). Il flag si imposta sull'entrata o tramite una regola.

Le percentuali si calcolano sulle entrate del **mese precedente** (predefinito, più stabile se lo stipendio
arriva a fine mese) o del **mese in corso**: è un'impostazione del profilo.

### 4.4 Fine periodo

Ogni bucket ha una **politica per il residuo**:

- **Riporta** al periodo successivo (predefinita per Accumulo).
- **Sposta** in un altro bucket, con una percentuale (es. 100% o 50% verso Risparmio).
- **Azzera**: il residuo torna "da assegnare".

E una **politica per lo sforamento**:

- **Riporta in negativo** al periodo successivo (predefinita).
- **Copri da** un bucket scelto.

La chiusura del periodo crea movimenti interni di tipo `rollover` nel mese successivo, visibili e annullabili
(si può riaprire un mese finché il successivo è aperto). La parte di residuo che una regola "Sposta" non sposta
torna da assegnare.

### 4.5 Saldo come somma di movimenti

Nessun saldo è salvato come numero: il saldo di un bucket è la **somma dei suoi movimenti di budget**
(assegnazioni, spese, spostamenti, rollover). Ogni cifra è spiegabile e un periodo si può riaprire senza
rompere niente.

## 5. Flusso d'uso

### 5.1 Durante la giornata: cattura

- Una spesa si inserisce in **1–2 tocchi**: importo dal tastierino, poi "Aggiungi alla coda".
- **Facoltativi**: conto usato (default: l'ultimo), nota. **Il bucket non si chiede qui.**
- La spesa finisce nella **Coda** con stato `catturata`.
- Funziona **offline**: la coda locale si sincronizza al ritorno della rete (come gli inserimenti di Mealler).
- La home mostra una stima "−85 € in coda" per non dare un saldo troppo ottimista.

### 5.2 Promemoria

- Un **badge** sulla tab Coda con il numero di spese in attesa.
- Una **notifica push** facoltativa (PWA installata) a cadenza scelta dall'utente, es. ogni domenica sera
  o dopo N giorni dall'ultima sessione.

### 5.3 Sessione di riconciliazione (4 passi)

1. **Importa** — carica i CSV (o, con l'import automatico, trova già i movimenti scaricati).
2. **Abbina** — collega le spese in coda ai movimenti della banca.
   - Gli abbinamenti sicuri sono fatti dall'app, mostrati e annullabili.
   - Quelli incerti chiedono una conferma con un tocco ("Conferma" / "Non è questa"), in cima alla lista.
   - Le spese in contanti non si abbinano: diventano movimenti del conto Contanti.
3. **Assegna** — ogni movimento riceve un bucket.
   - Le **regole** propongono il bucket; il tag "Regola" lo segnala.
   - Per gli altri si sceglie un bucket; la casella "Ricorda per ESERCENTE" crea una regola.
   - I movimenti della banca senza spesa in coda (quelli non inseriti a mano) compaiono qui come nuovi.
4. **Controlla** — riepilogo di ciò che l'app ha deciso da sola, con le voci a bassa confidenza in cima,
   e l'effetto sui bucket. "Chiudi sessione" conferma tutto.

### 5.4 Spese in coda mai abbinate

Dopo una finestra (predefinita **10 giorni**) una spesa in coda senza riga bancaria viene segnalata:
può essere contante, un importo diverso o una spesa non ancora contabilizzata. Non blocca nulla.

## 6. Abbinamento

### 6.1 Fonte di verità

Quando una spesa in coda viene abbinata a un movimento bancario, **importo e data validi sono quelli
della banca**; bucket e nota restano quelli dell'utente.

### 6.2 Punteggio di confidenza

| Segnale | Peso indicativo |
| --- | --- |
| Importo identico | alto |
| Importo entro la tolleranza (mance, arrotondamenti: ±5% o ±2 €) | medio |
| Data entro la finestra (−1 / +5 giorni) | medio, decresce con la distanza |
| Stesso conto o carta indicato in cattura | alto |
| Nota simile alla descrizione (es. "pranzo" ↔ ristorante) | basso |

- **Alta confidenza** (≥ 80, senza un'altra candidata entro 10 punti) → abbinata in automatico, segnalata
  nel passo Controlla.
- **Media** (≥ 45, o una sicura con una rivale vicina, come due caffè uguali) → in "Da verificare".
- **Bassa** → nessun abbinamento proposto.

Un movimento bancario si abbina a **una sola** spesa in coda e viceversa.

### 6.3 Casi noti

- **Addebito mensile della carta** sul conto corrente (es. "ADDEBITO NEXI"): è un **giroconto**, non una
  spesa, perché le singole spese arrivano dall'estratto della carta. Proposto in automatico quando il totale
  dell'estratto carta coincide.
- **PayPal**: la stessa spesa compare nell'export PayPal e sulla carta/conto che l'ha pagata. Si abbinano
  tra loro e si conta una volta. Le righe tecniche di PayPal (conversioni, ricariche, trattenute) si scartano.
- **Prelievo**: giroconto conto → Contanti.

## 7. Importazione

### 7.1 Import manuale (prima versione)

Ogni fonte ha un **profilo d'import** salvato:

- formato: CSV, Excel (XLS/XLSX), OFX, CAMT.053;
- colonne: data contabile, data valuta, descrizione, importo **oppure** Dare/Avere, ID movimento se c'è;
- convenzioni: formato data (`gg/mm/aaaa`), separatore decimale e delle migliaia, codifica;
- righe da saltare in testa e in coda;
- segno: se le spese sono positive (comune negli estratti carta) si invertono.

La prima volta si abbinano le colonne guardando l'**anteprima**; dopo, Cashket riconosce il file dalle
intestazioni e applica il profilo. L'anteprima mostra gli errori riga per riga prima di salvare.

**Da fare**: definire i profili esatti di YouWeb (Banco BPM), area personale Nexi e PayPal partendo da un
file di esempio anonimizzato per ciascuno.

### 7.2 Pulizia

- **Descrizione pulita** ("POS 16/11 ESSELUNGA MILANO 0431 CARTA *1234" → "Esselunga") accanto
  all'**originale**, che resta salvato e serve alle regole.
- Si tengono **data contabile** e **data valuta**; per l'abbinamento conta la data dell'operazione.

### 7.3 Doppioni

Ogni movimento ha un'**impronta** = hash di conto + data + importo + descrizione originale + numero di
occorrenza nel file (per due movimenti identici nello stesso giorno). Se la banca fornisce un ID, vince l'ID.
I movimenti con impronta già presente si saltano e si contano nel riepilogo ("3 già importati").

### 7.4 Lotti

Ogni import è un lotto con fonte, data, numero di righe e hash del file. Un lotto si **annulla per intero**.
Il file originale non si conserva.

### 7.5 Import automatico (versione successiva)

**Open banking PSD2 tramite Enable Banking**, in modalità *restricted* (gratuita, solo i conti collegati da
te nel portale Enable Banking):

- Banco BPM è supportato; la conferma (SCA) si fa nell'app YouApp. Da marzo 2026 Enable Banking dichiara
  anche i conti carta di Banco BPM: da verificare se include la carta Nexi.
- Il server scarica i movimenti nuovi 1–2 volte al giorno e li manda nella **stessa pipeline** dell'import
  CSV (pulizia, doppioni, giroconti, lotti), con fonte `api`.
- Il consenso scade (circa 180 giorni): Cashket avvisa in anticipo e mostra lo stato nella schermata
  **Connessioni**.
- Serve un indirizzo HTTPS di ritorno (`CASHKET_BASE_URL`, già presente con Cloudflare).
- La chiave privata dell'app Enable Banking è un **segreto** del container, mai nel database in chiaro.

**Email di notifica** (soprattutto per PayPal): una casella dedicata letta via IMAP; ogni email diventa
un movimento **provvisorio**, confermato poi dal movimento definitivo.

**Da escludere**: screen scraping e servizi che chiedono le credenziali dell'home banking.

## 8. Modello dati

SQLite (better-sqlite3 + Drizzle), migrazioni SQL numerate come in Mealler. Importi in **centesimi interi**
(`amount_cents`, negativo = uscita). Date in ISO `YYYY-MM-DD`, timestamp ISO UTC.

| Tabella | Contenuto principale |
| --- | --- |
| `users` | nome, email, hash password, ruolo, lingua, fuso, impostazioni |
| `sessions`, `invites`, `password_resets` | come Mealler |
| `accounts` | utente, nome, tipo (`checking`, `card`, `paypal`, `cash`), conto di addebito (per le carte) |
| `buckets` | utente, nome, categoria (o personalizzata: lettera + colore), tipo, regola di riempimento, obiettivo, politiche di fine periodo, ordine, archiviato |
| `periods` | utente, mese, stato (`open`, `closed`), quando e su quale entrata è stato assegnato |
| `captures` | spese in coda: utente, importo, data/ora, conto facoltativo, nota, stato (`queued`, `matched`, `cash`, `discarded`), id client per la sync offline |
| `import_batches` | utente, fonte (`csv`, `api`, `email`), profilo, hash file, righe lette/nuove/saltate, annullato |
| `transactions` | movimento: utente, conto, lotto, data operazione, data valuta, importo, descrizione originale e pulita, id esterno, impronta, tipo (`expense`, `income`, `transfer`), flag base budget, stato (`pending`, `reviewed`) |
| `matches` | collega `captures` ↔ `transactions`, con punteggio e origine (`auto`, `user`) |
| `transfer_links` | coppie di movimenti che formano un giroconto (addebito carta, prelievo, PayPal) |
| `budget_entries` | il registro dei bucket: bucket, periodo, importo, tipo (`allocation`, `spend`, `move`, `rollover`), riferimento al movimento |
| `rules` | utente, condizione sulla descrizione, bucket o flag da applicare, conteggio d'uso |
| `import_profiles` | utente, conto, formato e mappatura delle colonne (JSON) |
| `bank_connections` | utente, provider, conti collegati, scadenza consenso, ultimo scaricamento |
| `push_subscriptions` | come Mealler |

La prima migrazione (`apps/server/migrations/0001_init.sql`) contiene queste tabelle.

## 9. Interfaccia

Mockup sul canvas: *Cashket · mockup* (schermate, splash, icone, palette).

### 9.1 Navigazione

Tab bar in basso come Mealler, con pillola sull'elemento attivo: **Bucket · Coda · Andamento · Profilo**.
La tab Coda ha un badge con il numero di spese in attesa. Il pulsante "+" nella barra in alto apre la cattura.

### 9.2 Schermate

- **Home / Bucket**: totale che resta, barra, stato; collegamento alla coda; card per bucket con regola,
  residuo, barra e stato (nel budget / in accumulo / sforato).
- **Nuova spesa**: importo grande, conto a chip, nota, tastierino numerico, "Aggiungi alla coda".
- **Coda**: invito alla sessione, spese raggruppate per giorno.
- **Sessione**: Importa → Abbina → Assegna → Controlla, con indicatore a 4 segmenti.
- **Connessioni** (con l'import automatico): stato di ogni conto e scadenza del consenso.
- **Profilo**: account, conti, bucket, categorie personalizzate, regole, promemoria, utenti (admin).

### 9.3 Regole grafiche

Si seguono quelle di Mealler: font Inter, numeri tabulari, card con raggio 20 px, pulsanti a pillola
(48–52 px), chip, target di almeno 44 px, contrasto WCAG 2.2 AA, tema chiaro e scuro, transizioni tra le pagine.

**Palette D · Albicocca e mare** (fondo bianco, colori smorzati):

| Token | Chiaro | Scuro |
| --- | --- | --- |
| `--bg` | `#ffffff` | `#111214` |
| `--surface` | `#ffffff` | `#1a1b1e` |
| `--surface-2` | `#eeeef0` | `#2a2c30` |
| `--border` | `#e4e4e7` | `#2e3034` |
| `--text` | `#18181b` | `#eeeef0` |
| `--text-2` | `#52525b` | `#adafb5` |
| `--accent` | `#e2874a` | `#eda070` |
| `--on-accent` | `#2a1203` | `#2a1203` |
| `--accent-soft` | `#fcebdf` | `#3a271b` |
| `--accent-ink` | `#a9521f` | `#f4bf99` |
| `--ok` (nel budget) | `#4f9a6c` | `#6fbf8e` |
| `--under` (in accumulo) | `#4a8db0` | `#6aaed0` |
| `--over` (sforato) | `#c95f86` | `#e083a6` |

Il testo sui pulsanti arancioni è marrone scuro (`--on-accent`): il bianco su albicocca non raggiunge il contrasto minimo.

### 9.4 Illustrazioni

Stesso linguaggio di Mealler: forme piatte, contorno `#17151F`, riflesso chiaro, oggetto principale
inclinato con un dettaglio colorato davanti.

- **Logo**: secchio inclinato con bordo albicocca e moneta d'oro con l'euro davanti.
- **Wordmark**: lettere a tratti arrotondati; la "s" è in oro, tagliata come il simbolo del dollaro.
- **Disegni di sezione** nella barra in alto: Coda (vassoio di scontrini + orologio), Sessione (estratto
  conto + lente), Andamento, Profilo.
- **Splash**: griglia inclinata di icone delle categorie, logo in un riquadro bianco, wordmark, moneta in
  basso, versione e "Happy Squid inc".

### 9.5 Categorie

24 icone pronte in cerchi tinti (16% chiaro, 26% scuro):

Spesa, Ristoranti, Bar e caffè, Casa, Bollette, Trasporti, Carburante, Auto, Salute, Sport, Svago,
Abbonamenti, Telefono e internet, Abbigliamento, Regali, Animali, Istruzione, Cura personale, Vacanze,
Risparmio, Tasse, Assicurazioni, Bambini, Stipendio.

Icone dei conti: Contanti, Carta, Conto.

**Categoria personalizzata**: un'etichetta con l'**iniziale** del nome e un **colore** scelto tra 10 tinte
coordinate. Niente emoji, per restare nello stile.

## 10. Sicurezza

Come Mealler: password con Argon2, cookie di sessione `HttpOnly`/`SameSite`, controllo `Sec-Fetch-Site`
sulle scritture, intestazioni di sicurezza, rate limit sull'accesso, segreti cifrati con una chiave fuori dal
database, `MEALLER_TRUST_PROXY` → `CASHKET_TRUST_PROXY` per Cloudflare. Container senza privilegi.

## 11. Roadmap

1. **Fondamenta** ✅: scheletro, utenti e accesso, conti, bucket e periodi, registro dei movimenti di budget,
   entrate inserite a mano.
2. **Uso quotidiano** ✅: cattura con tastierino e coda offline (service worker, invio con `clientId`),
   pagina Coda con modifica ed eliminazione, badge sulla tab, stima della coda nella home, spostamenti tra
   bucket, chiusura del periodo.
3. **Sessione** ✅: import CSV con mappatura delle colonne salvata e riconosciuta dalle intestazioni,
   doppioni, giroconti (addebito carta, prelievi, PayPal), contanti, abbinamento con punteggio, regole che
   imparano, revisione, lotti annullabili. Excel, OFX e CAMT.053 non ancora: per ora si salva come CSV.
   Profili pronti per YouWeb e Nexi quando ci saranno i file di esempio.
4. **Promemoria** ✅: numero sull'icona dell'app e sulla tab Coda; notifica push una volta al giorno, dall'ora
   scelta, quando ci sono spese in coda e l'ultima sessione è più vecchia dell'intervallo scelto.
5. **Import automatico**: Enable Banking, schermata Connessioni; poi email di notifica per PayPal.
6. **Andamento**: grafici per bucket e per mese.
