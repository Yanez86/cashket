<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Fix or delete an expense still in the queue. -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { Account, Capture } from '@cashket/shared';
  import { del, get, patch } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import { refreshQueue } from '$lib/offline.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import MoneyField from '$lib/MoneyField.svelte';
  import DateField from '$lib/DateField.svelte';
  import { accountImg } from '$lib/accounts';

  const id = Number(page.params.id);
  let loaded = $state(false);
  let accounts = $state<Account[]>([]);
  let amountCents = $state<number | null>(null);
  let accountId = $state<number | null>(null);
  let note = $state('');
  let when = $state('');
  let error = $state('');
  let busy = $state(false);


  $effect(() => {
    Promise.all([get<Capture[]>('/captures'), get<Account[]>('/accounts')])
      .then(([list, accs]) => {
        accounts = accs.filter((a) => !a.archived);
        const c = list.find((x) => x.id === id);
        if (!c) {
          error = 'Questa spesa non è più in coda.';
          return;
        }
        amountCents = c.amountCents;
        accountId = c.accountId;
        note = c.note ?? '';
        when = c.spentAt;
        loaded = true;
      })
      .catch((e) => (error = errorMessage(e)));
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!amountCents) return;
    busy = true;
    error = '';
    try {
      await patch(`/captures/${id}`, { amountCents, accountId, note: note.trim() || null, spentAt: when });
      await refreshQueue();
      await goto('/coda');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!confirm('Eliminare questa spesa dalla coda?')) return;
    try {
      await del(`/captures/${id}`);
      await refreshQueue();
      await goto('/coda');
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>Spesa in coda · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Spesa in coda" section="queue" />
  {#if loaded}
    <form class="card stack" onsubmit={save}>
      <MoneyField id="amount" label="Importo" bind:cents={amountCents} required />
      <div class="field">
        <span class="label" id="account">Conto</span>
        <div class="chips" role="group" aria-labelledby="account">
          <button class="chip" type="button" aria-pressed={accountId == null} onclick={() => (accountId = null)}>Non indicato</button>
          {#each accounts as a (a.id)}
            <button class="chip" type="button" aria-pressed={accountId === a.id} onclick={() => (accountId = a.id)}>
              <img src={accountImg(a)} alt="" width="22" height="22" />{a.name}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <label for="note">Nota</label>
        <input id="note" maxlength="200" bind:value={note} />
      </div>
      <DateField id="when" label="Quando" time bind:value={when} />
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy || !amountCents}>Salva</button>
      <button class="btn btn-danger" type="button" onclick={remove}>Elimina</button>
    </form>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</main>
