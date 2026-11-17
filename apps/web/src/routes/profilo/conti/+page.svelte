<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Where money comes from and goes to. A card has the account its statement is charged to (docs/SPEC.md §6.3). -->
<script lang="ts">
  import { ACCOUNT_ICONS, type Account, type AccountKind } from '@cashket/shared';
  import { get, patch, post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const KINDS: { value: AccountKind; label: string }[] = [
    { value: 'checking', label: 'Conto corrente' },
    { value: 'card', label: 'Carta' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'cash', label: 'Contanti' }
  ];
  const kindLabel = (k: AccountKind) => KINDS.find((x) => x.value === k)?.label ?? k;

  let accounts = $state<Account[]>([]);
  let error = $state('');
  let name = $state('');
  let kind = $state<AccountKind>('checking');
  let settlesTo = $state<number | null>(null);
  let busy = $state(false);

  $effect(() => {
    get<Account[]>('/accounts').then((list) => (accounts = list), (e) => (error = errorMessage(e)));
  });

  const settleOptions = $derived(accounts.filter((a) => !a.archived && a.kind !== 'card'));
  const nameOf = (id: number | null) => accounts.find((a) => a.id === id)?.name;

  async function add(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const account = await post<Account>('/accounts', { name, kind, settlesToAccountId: kind === 'card' ? settlesTo : null });
      accounts = [...accounts, account];
      name = '';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function toggleArchive(a: Account) {
    try {
      const updated = await patch<Account>(`/accounts/${a.id}`, { archived: !a.archived });
      accounts = accounts.map((x) => (x.id === a.id ? updated : x));
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>Conti · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Conti" section="profile" />
  <div class="stack">
    <section class="card">
      {#each accounts as a (a.id)}
        <div class="list-row" class:archived={a.archived}>
          <img src="/accounts/{ACCOUNT_ICONS[a.kind]}.svg" alt="" width="40" height="40" />
          <div style="flex: 1; min-width: 0">
            <p>{a.name}</p>
            <p class="muted small">{kindLabel(a.kind)}{a.settlesToAccountId ? ` · addebitata su ${nameOf(a.settlesToAccountId)}` : ''}{a.archived ? ' · archiviato' : ''}</p>
          </div>
          <button class="btn btn-ghost" type="button" onclick={() => toggleArchive(a)}>{a.archived ? 'Ripristina' : 'Archivia'}</button>
        </div>
      {/each}
    </section>

    <form class="card stack" onsubmit={add}>
      <h2 class="section-title">Nuovo conto</h2>
      <div class="field">
        <label for="name">Nome</label>
        <input id="name" required maxlength="100" placeholder="Conto BPM, Carta Nexi…" bind:value={name} />
      </div>
      <div class="field">
        <span class="label" id="kind">Tipo</span>
        <div class="chips" role="group" aria-labelledby="kind">
          {#each KINDS as k (k.value)}
            <button class="chip" type="button" aria-pressed={kind === k.value} onclick={() => (kind = k.value)}>{k.label}</button>
          {/each}
        </div>
      </div>
      {#if kind === 'card'}
        <div class="field">
          <label for="settles">Addebitata su</label>
          <select id="settles" bind:value={settlesTo}>
            <option value={null}>Nessun conto</option>
            {#each settleOptions as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </select>
          <p class="help">L'addebito mensile della carta su quel conto sarà un giroconto, non una spesa.</p>
        </div>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Aggiungi</button>
    </form>
  </div>
</main>

<style>
  .archived {
    opacity: 0.6;
  }
</style>
