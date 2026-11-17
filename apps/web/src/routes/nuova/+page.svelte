<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Quick capture (docs/SPEC.md §5.1): amount, then "Aggiungi alla coda". Account and note are optional and
     the bucket is chosen later, in the session. Works offline. -->
<script lang="ts">
  import { ACCOUNT_ICONS, formatCents, type Account } from '@cashket/shared';
  import { get } from '$lib/api';
  import { capture, queue } from '$lib/offline.svelte';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';

  const LAST_ACCOUNT = 'cashket-last-account';

  let digits = $state('');
  let accounts = $state<Account[]>([]);
  let accountId = $state<number | null>(null);
  let note = $state('');
  let when = $state<'now' | 'other'>('now');
  let otherTime = $state('');
  let message = $state('');
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    get<Account[]>('/accounts').then((list) => {
      accounts = list.filter((a) => !a.archived);
      const last = Number(localStorage.getItem(LAST_ACCOUNT));
      accountId = accounts.some((a) => a.id === last) ? last : null;
    }, () => {});
  });

  /** The typed amount in cents: "12,5" → 1250. */
  const cents = $derived.by(() => {
    if (!digits) return 0;
    const [whole, dec = ''] = digits.split(',');
    return Number(whole || '0') * 100 + Number((dec + '00').slice(0, 2));
  });
  const shown = $derived(digits ? digits : '0');

  function press(key: string) {
    message = '';
    if (key === 'back') digits = digits.slice(0, -1);
    else if (key === ',') {
      if (!digits.includes(',')) digits = (digits || '0') + ',';
    } else {
      const [whole, dec] = digits.split(',');
      if (dec !== undefined && dec.length >= 2) return;
      if (dec === undefined && whole.length >= 7) return;
      digits = digits === '0' ? key : digits + key;
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === ',' || event.key === '.') press(',');
    else if (event.key === 'Backspace') press('back');
  }

  async function add() {
    if (!cents) return;
    busy = true;
    error = '';
    try {
      const spentAt = when === 'other' && otherTime ? new Date(otherTime).toISOString() : new Date().toISOString();
      const result = await capture({ amountCents: cents, spentAt, accountId, note: note.trim() || null });
      if (accountId != null) localStorage.setItem(LAST_ACCOUNT, String(accountId));
      message = result === 'sent' ? `${formatCents(cents)} in coda.` : `${formatCents(cents)} salvata sul telefono: la invio appena torna la rete.`;
      digits = '';
      note = '';
      when = 'now';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
  const today = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Nuova spesa · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Nuova spesa" subtitle={today}>
    {#snippet actions()}
      <a class="icon-btn" href="/coda" aria-label="Chiudi"><Icon name="close" /></a>
    {/snippet}
  </TopBar>
  <div class="stack" style="gap: 12px">
    <section class="card">
      <p class="label">Importo</p>
      <p class="amount" aria-live="polite"><span>{shown}</span><span class="euro">€</span></p>
    </section>

    {#if accounts.length}
      <div class="field">
        <span class="label" id="account">Conto <span class="muted">(facoltativo)</span></span>
        <div class="chips" role="group" aria-labelledby="account">
          {#each accounts as a (a.id)}
            <button class="chip" type="button" aria-pressed={accountId === a.id} onclick={() => (accountId = accountId === a.id ? null : a.id)}>
              <img src="/accounts/{ACCOUNT_ICONS[a.kind]}.svg" alt="" width="22" height="22" />{a.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="field">
      <label for="note">Nota <span class="muted">(facoltativa)</span></label>
      <input id="note" maxlength="200" autocomplete="off" placeholder="Pranzo, benzina…" bind:value={note} />
    </div>

    <div class="field">
      <span class="label" id="when">Quando</span>
      <div class="chips" role="group" aria-labelledby="when">
        <button class="chip" type="button" aria-pressed={when === 'now'} onclick={() => (when = 'now')}>Adesso</button>
        <button class="chip" type="button" aria-pressed={when === 'other'} onclick={() => (when = 'other')}>Un altro momento</button>
      </div>
      {#if when === 'other'}
        <input type="datetime-local" aria-label="Data e ora della spesa" bind:value={otherTime} />
      {/if}
    </div>

    <div class="keypad">
      {#each KEYS as key (key)}
        <button type="button" class="key" aria-label={key === 'back' ? 'Cancella' : key} onclick={() => press(key)}>
          {#if key === 'back'}<Icon name="left" />{:else}{key}{/if}
        </button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if message}<p class="notice" role="status">{message}</p>{/if}
    {#if queue.rejected.length}<p class="error">Non salvate: {queue.rejected.join(', ')}.</p>{/if}

    <button class="btn btn-primary btn-block" type="button" disabled={!cents || busy} onclick={add}><Icon name="plus" />Aggiungi alla coda</button>
    <p class="muted small" style="text-align: center">Il bucket lo scegli dopo, nella sessione.</p>
  </div>
</main>

<style>
  .amount {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 48px;
    line-height: 56px;
    font-weight: 700;
  }
  .euro {
    margin-left: auto;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-2);
  }
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .key {
    height: 54px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 22px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .key:active {
    background: var(--accent-soft);
  }
</style>
