<p align="center"><img src="apps/web/static/logo.svg" width="96" alt="Cashket"></p>

# Cashket

Budget di casa **a bucket**, **self-hosted**, **multiutente**, installabile come **PWA** sul telefono.
Durante la giornata metti le spese in coda con due tocchi; quando vuoi carichi l'estratto conto, Cashket
abbina le spese ai movimenti della banca e tu le assegni ai bucket.

## Stato

**Fase 1 di 6.** Si può già entrare, invitare la famiglia, creare conti e bucket, registrare le entrate,
riempire i bucket del mese e chiuderlo. Mancano ancora le spese: arrivano con la coda e la sessione.

- Specifica completa: **[docs/SPEC.md](docs/SPEC.md)**
- Stack e struttura: gli stessi di [Mealler](https://github.com/Yanez86/mealler)

| Funzione | Stato |
| --- | --- |
| Scheletro: server, PWA, Docker, schema del database | ✅ |
| Utenti, inviti, accesso, link per la nuova password | ✅ |
| Conti, bucket fissi / a percentuale / resto, entrate, assegnazione e chiusura del mese | ✅ |
| Cattura rapida con coda offline | ⏳ |
| Sessione: import CSV, abbinamento, regole, revisione | ⏳ |
| Promemoria (badge e push) | ⏳ |
| Import automatico (open banking Enable Banking) | ⏳ |
| Andamento | ⏳ |

## Struttura

```
apps/server     Fastify + SQLite (better-sqlite3, Drizzle), migrazioni SQL numerate
apps/web        SvelteKit (adapter-static) come PWA
packages/shared tipi, categorie e costanti condivisi
docs/           specifica
```

## Sviluppo

Serve Node 22 e pnpm 10.

```bash
pnpm install
pnpm dev          # server su :3000, web su :5173 con proxy verso /api
pnpm typecheck
pnpm test
```

I test dei servizi (`apps/server/test/services.test.ts`, `access.test.ts`) girano sul SQLite integrato in Node
e non hanno bisogno di dipendenze native; `app.test.ts` prova l'API HTTP intera.

Amministratore senza accesso: `docker exec cashket node dist/index.js reset-password nome@esempio.it`
stampa un link per scegliere una nuova password.

## Installazione con Docker

```bash
git clone https://github.com/Yanez86/cashket.git
cd cashket
cp .env.example .env
docker compose up -d --build
```

Poi apri `http://IP-DEL-SERVER:3000`. Per l'accesso da fuori e l'installazione della PWA serve HTTPS:
esponi Cashket con Cloudflare Tunnel, imposta `CASHKET_BASE_URL` e `CASHKET_BIND=127.0.0.1`.
I dati stanno nel volume montato su `/data`.
