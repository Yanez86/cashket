<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Bank connections through Enable Banking (docs/SPEC.md §7.5): the person's own application, the banks
     linked to it, which Cashket account each bank account feeds, and when consent ends. -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { Account, Aspsp, BankApp, BankConnection } from '@cashket/shared';
  import { del, get, patch, post, put } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import Picker from '$lib/Picker.svelte';
  import { accountImg } from '$lib/accounts';

  let bank = $state<BankApp | null>(null);
  let connections = $state<BankConnection[]>([]);
  let accounts = $state<Account[]>([]);
  let aspsps = $state<Aspsp[]>([]);
  let search = $state('');
  let appId = $state('');
  let privateKey = $state('');
  let editingApp = $state(false);
  let error = $state('');
  let message = $state('');
  let busy = $state(false);

  const outcome = page.url.searchParams.get('esito');
  if (outcome === 'collegato') message = 'Banca collegata. Ora scegli in quale conto di Cashket arrivano i movimenti.';
  else if (outcome === 'annullato') error = 'Collegamento annullato dalla banca.';
  else if (outcome === 'errore') error = 'Il collegamento non è andato a buon fine: riprova.';

  async function load() {
    try {
      [bank, accounts] = await Promise.all([get<BankApp>('/banking/app'), get<Account[]>('/accounts')]);
      if (bank.configured) connections = await get<BankConnection[]>('/banking/connections');
    } catch (e) {
      error = errorMessage(e);
    }
  }
  $effect(() => {
    void load();
  });

  async function run(fn: () => Promise<void>) {
    busy = true;
    error = '';
    message = '';
    try {
      await fn();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function onKeyFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) privateKey = await file.text();
  }

  const saveApp = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      bank = await put<BankApp>('/banking/app', { appId, privateKey });
      privateKey = '';
      editingApp = false;
      message = 'Applicazione salvata.';
      connections = await get<BankConnection[]>('/banking/connections');
    });
  };

  const loadBanks = () => run(async () => void (aspsps = await get<Aspsp[]>('/banking/aspsps?country=IT')));

  const link = (a: Pick<Aspsp, 'name' | 'country' | 'maxConsentDays'>) =>
    run(async () => {
      const { url } = await post<{ url: string }>('/banking/connections', { name: a.name, country: a.country, maxConsentDays: a.maxConsentDays });
      window.location.href = url;
    });

  const map = (c: BankConnection, uid: string, accountId: number | null) =>
    run(async () => {
      const updated = await patch<BankConnection>(`/banking/connections/${c.id}/accounts`, { uid, accountId });
      connections = connections.map((x) => (x.id === c.id ? updated : x));
    });

  const sync = (c: BankConnection) =>
    run(async () => {
      const { added } = await post<{ added: number }>(`/banking/connections/${c.id}/sync`);
      message = added ? `${added} movimenti nuovi: li trovi nella prossima sessione.` : 'Nessun movimento nuovo.';
      connections = await get<BankConnection[]>('/banking/connections');
    });

  const unlink = (c: BankConnection) => {
    if (!confirm(`Scollegare ${c.aspspName}? I movimenti già scaricati restano.`)) return;
    return run(async () => {
      await del(`/banking/connections/${c.id}`);
      connections = connections.filter((x) => x.id !== c.id);
    });
  };

  const shown = $derived(aspsps.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30));
  const importable = $derived(accounts.filter((a) => !a.archived && a.kind !== 'cash'));
  const daysLeft = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 864e5) : null);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'mai');
</script>

<svelte:head><title>Connessioni · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Connessioni" subtitle="Movimenti dalla banca, in automatico" section="profile" />
  <div class="stack">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if message}<p class="notice" role="status">{message}</p>{/if}

    {#if bank && (!bank.configured || editingApp)}
      <section class="card stack">
        <h2 class="section-title">1 · La tua applicazione Enable Banking</h2>
        <ol class="steps">
          <li>Crea un account gratuito su <a href="https://enablebanking.com/cp" target="_blank" rel="noopener">enablebanking.com</a>.</li>
          <li>Registra un'applicazione in ambiente <strong>Production</strong>, modalità <strong>Restricted</strong>: è gratuita e legge solo i tuoi conti. Lascia generare la chiave al portale e scarica il file <code>.pem</code>.</li>
          <li>Come indirizzo di ritorno (redirect URL) inserisci:<br /><code class="url">{bank.redirectUrl}</code></li>
          <li>Nel portale collega i tuoi conti all'applicazione ("Link accounts"), poi incolla qui l'ID dell'applicazione e la chiave.</li>
        </ol>
        <form class="stack" style="gap: 12px" onsubmit={saveApp}>
          <div class="field">
            <label for="appid">ID dell'applicazione</label>
            <input id="appid" required autocomplete="off" placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" bind:value={appId} />
          </div>
          <div class="field">
            <label for="key">Chiave privata (.pem)</label>
            <input id="key" type="file" accept=".pem,.key,text/plain" onchange={onKeyFile} />
            <p class="help">{privateKey ? 'Chiave caricata.' : 'Resta cifrata nel database di Cashket.'}</p>
          </div>
          <button class="btn btn-primary btn-block" type="submit" disabled={busy || !appId || !privateKey}>Salva</button>
          {#if bank.configured}<button class="btn btn-ghost" type="button" onclick={() => (editingApp = false)}>Annulla</button>{/if}
        </form>
      </section>
    {:else if bank}
      <section class="card">
        <div class="list-row">
          <div style="flex: 1; min-width: 0">
            <p>Applicazione Enable Banking</p>
            <p class="muted small ellipsis">{bank.appId}</p>
          </div>
          <button class="btn btn-ghost" type="button" onclick={() => (editingApp = true)}>Cambia</button>
        </div>
      </section>

      {#each connections as c (c.id)}
        {@const left = daysLeft(c.consentExpiresAt)}
        <section class="card stack" style="gap: 10px">
          <div class="head">
            <div>
              <h2 class="section-title">{c.aspspName}</h2>
              <p class="muted small">
                Ultimo scaricamento: {when(c.lastFetchedAt)}{#if left != null} · consenso {left > 0 ? `ancora ${left} giorni` : 'scaduto'}{/if}
              </p>
            </div>
            <button class="icon-btn plain" type="button" aria-label="Scollega {c.aspspName}" onclick={() => unlink(c)}><Icon name="trash" size={20} /></button>
          </div>
          {#if c.lastError}<p class="error small">{c.lastError}</p>{/if}
          {#if c.status === 'expired' || (left != null && left <= 7)}
            <button class="btn btn-primary" type="button" disabled={busy} onclick={() => link({ name: c.aspspName, country: c.aspspCountry, maxConsentDays: null })}>Rinnova il consenso</button>
          {/if}
          {#each c.accounts as a (a.uid)}
            <div class="field">
              <label for="acc-{c.id}-{a.uid}">{a.name}{a.iban ? ` · …${a.iban.slice(-4)}` : ''}</label>
              <Picker
                id="acc-{c.id}-{a.uid}"
                label="Movimenti in"
                options={[{ value: null, label: 'Non importare' }, ...importable.map((acc) => ({ value: acc.id as number | null, label: acc.name, img: accountImg(acc) }))]}
                value={a.accountId}
                onchange={(v) => map(c, a.uid, v)} />
            </div>
          {/each}
          {#if c.status === 'active'}
            <button class="btn" type="button" disabled={busy || !c.accounts.some((a) => a.accountId)} onclick={() => sync(c)}>Scarica ora</button>
          {/if}
        </section>
      {/each}

      <section class="card stack" style="gap: 12px">
        <h2 class="section-title">{connections.length ? 'Collega un\'altra banca' : '2 · Collega la tua banca'}</h2>
        {#if !aspsps.length}
          <button class="btn btn-primary" type="button" disabled={busy} onclick={loadBanks}>Scegli la banca</button>
        {:else}
          <input type="search" placeholder="Cerca: Banco BPM, Intesa, Fineco…" aria-label="Cerca la banca" bind:value={search} />
          <div class="banks">
            {#each shown as a (a.name)}
              <button class="list-row bank" type="button" disabled={busy} onclick={() => link(a)}>
                <span>{a.name}</span>
                <Icon name="chevron" size={20} />
              </button>
            {/each}
          </div>
        {/if}
        <p class="help">La banca ti chiede di confermare (per Banco BPM nell'app YouApp). Il consenso dura al massimo 180 giorni: una settimana prima ti avviso per rinnovarlo. I movimenti arrivano da soli ogni 6 ore e li sistemi nella sessione, come quelli dei CSV.</p>
      </section>
    {/if}
  </div>
</main>

<style>
  .steps {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 15px;
  }
  .url {
    word-break: break-all;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .banks {
    max-height: 360px;
    overflow-y: auto;
  }
  .bank {
    width: 100%;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .bank span {
    flex: 1;
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
