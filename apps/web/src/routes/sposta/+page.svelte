<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Move money between two buckets inside a month (docs/SPEC.md §4.4). -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { formatCents, isMonth, monthOf, type BudgetView } from '@cashket/shared';
  import { get, post } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import MoneyField from '$lib/MoneyField.svelte';
  import { monthLabel } from '$lib/buckets';

  const fromUrl = page.url.searchParams.get('month') ?? '';
  const month = isMonth(fromUrl) ? fromUrl : monthOf(new Date(), app.user?.timezone);
  let view = $state<BudgetView | null>(null);
  let fromId = $state<number | null>(null);
  let toId = $state<number | null>(null);
  let amountCents = $state<number | null>(null);
  let note = $state('');
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    get<BudgetView>(`/budget/${month}`).then(
      (v) => {
        view = v;
        const active = v.buckets.filter((b) => !b.archived);
        fromId = active.find((b) => b.fill.type === 'remainder')?.id ?? active[0]?.id ?? null;
        toId = active.find((b) => b.status === 'over')?.id ?? active.find((b) => b.id !== fromId)?.id ?? null;
      },
      (e) => (error = errorMessage(e))
    );
  });

  const buckets = $derived(view?.buckets.filter((b) => !b.archived) ?? []);
  const balance = (id: number | null) => buckets.find((b) => b.id === id)?.balanceCents ?? 0;

  async function move(event: SubmitEvent) {
    event.preventDefault();
    if (!fromId || !toId || !amountCents) return;
    busy = true;
    error = '';
    try {
      await post(`/budget/${month}/move`, { fromBucketId: fromId, toBucketId: toId, amountCents, note: note.trim() || null });
      await goto('/');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sposta · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Sposta tra bucket" subtitle={monthLabel(month)} />
  {#if view}
    <form class="card stack" onsubmit={move}>
      <div class="field">
        <label for="from">Da</label>
        <select id="from" bind:value={fromId}>
          {#each buckets as b (b.id)}<option value={b.id}>{b.name} · {formatCents(b.balanceCents)}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="to">A</label>
        <select id="to" bind:value={toId}>
          {#each buckets as b (b.id)}<option value={b.id} disabled={b.id === fromId}>{b.name} · {formatCents(b.balanceCents)}</option>{/each}
        </select>
      </div>
      <MoneyField id="amount" label="Importo" bind:cents={amountCents} required />
      {#if amountCents && amountCents > balance(fromId)}
        <p class="help">Il bucket di partenza andrà in negativo.</p>
      {/if}
      <div class="field">
        <label for="note">Nota <span class="muted">(facoltativa)</span></label>
        <input id="note" maxlength="200" bind:value={note} />
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy || !amountCents || !fromId || !toId || fromId === toId}>Sposta</button>
    </form>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</main>
