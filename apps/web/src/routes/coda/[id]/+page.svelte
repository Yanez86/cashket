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

  const id = Number(page.params.id);
  let loaded = $state(false);
  let accounts = $state<Account[]>([]);
  let amountCents = $state<number | null>(null);
  let accountId = $state<number | null>(null);
  let note = $state('');
  let when = $state('');
  let error = $state('');
  let busy = $state(false);

  /** ISO → value for a datetime-local input, in the device's time. */
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

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
        when = toLocal(c.spentAt);
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
      await patch(`/captures/${id}`, { amountCents, accountId, note: note.trim() || null, spentAt: new Date(when).toISOString() });
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
        <label for="account">Conto</label>
        <select id="account" bind:value={accountId}>
          <option value={null}>Non indicato</option>
          {#each accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="note">Nota</label>
        <input id="note" maxlength="200" bind:value={note} />
      </div>
      <div class="field">
        <label for="when">Quando</label>
        <input id="when" type="datetime-local" required bind:value={when} />
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy || !amountCents}>Salva</button>
      <button class="btn btn-danger" type="button" onclick={remove}>Elimina</button>
    </form>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</main>
