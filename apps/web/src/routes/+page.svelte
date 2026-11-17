<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The buckets of a month (docs/SPEC.md §9.2): what is left, filling from income, the cards, closing. -->
<script lang="ts">
  import { addMonths, formatCents, monthOf, type BudgetView } from '@cashket/shared';
  import { get, post } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import BucketCard from '$lib/BucketCard.svelte';
  import { monthLabel } from '$lib/buckets';

  const current = monthOf(new Date(), app.user?.timezone);
  let month = $state(current);
  let view = $state<BudgetView | null>(null);
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    const m = month;
    error = '';
    get<BudgetView>(`/budget/${m}`)
      .then((v) => {
        if (m === month) view = v;
      })
      .catch((e) => (error = errorMessage(e)));
  });

  async function act(path: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    busy = true;
    error = '';
    try {
      view = await post<BudgetView>(`/budget/${month}/${path}`);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  const spendBuckets = $derived(view?.buckets.filter((b) => b.kind === 'spend') ?? []);
  const left = $derived(spendBuckets.reduce((t, b) => t + b.balanceCents, 0));
  const assigned = $derived(spendBuckets.reduce((t, b) => t + b.balanceCents + b.spentCents, 0));
  const over = $derived(spendBuckets.filter((b) => b.status === 'over'));
  // Income or rules changed since "Assegna": the plan no longer matches what was allocated.
  const stale = $derived(
    !!view?.allocated && view.plan.some((p) => view!.buckets.find((b) => b.id === p.bucketId)?.allocatedCents !== p.cents)
  );
</script>

<svelte:head><title>Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Cashket" subtitle={monthLabel(month)}>
    {#snippet actions()}
      <button class="icon-btn" type="button" aria-label="Mese precedente" onclick={() => (month = addMonths(month, -1))}><Icon name="left" /></button>
      <button class="icon-btn" type="button" aria-label="Mese successivo" onclick={() => (month = addMonths(month, 1))}><Icon name="right" /></button>
    {/snippet}
  </TopBar>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if view}
    <div class="stack">
      <section class="card">
        <div class="summary">
          <p class="total">{formatCents(left)}</p>
          <div class="muted small right">
            <p>restano nei bucket</p>
            <p>su {formatCents(assigned)} assegnati</p>
          </div>
        </div>
        <div class="bar" style="margin: 14px 0 10px">
          <span class={over.length ? 'status-over' : 'status-ok'} style:width="{assigned > 0 ? Math.min(100, Math.max(0, ((assigned - left) / assigned) * 100)) : 0}%"></span>
        </div>
        {#if over.length}
          <p class="state status-ink-over"><Icon name="up" size={16} stroke={2.5} />{over.map((b) => b.name).join(', ')} sforat{over.length > 1 ? 'i' : 'o'}</p>
        {:else}
          <p class="state status-ink-ok"><Icon name="check" size={16} stroke={2.5} />Nel budget</p>
        {/if}
      </section>

      {#if view.status === 'closed'}
        <p class="notice">Mese chiuso: i residui sono passati al mese successivo.</p>
      {:else if !view.allocated || stale}
        <section class="card stack" style="gap: 12px">
          <p>
            {#if stale}Le entrate o le regole dei bucket sono cambiate da quando hai assegnato.{:else}Il mese non è ancora stato assegnato ai bucket.{/if}
            Entrate base di {monthLabel(view.incomeMonth)}: <strong>{formatCents(view.incomeCents)}</strong>.
          </p>
          {#if view.unassignedCents < 0}
            <p class="error">Le entrate non coprono i bucket fissi e a percentuale: mancano {formatCents(-view.unassignedCents)}.</p>
          {/if}
          <div class="row">
            <button class="btn btn-primary" type="button" disabled={busy} onclick={() => act('allocate')}>{stale ? 'Riassegna' : 'Assegna'}</button>
            <a class="btn btn-ghost" href="/entrate?month={view.incomeMonth}">Entrate</a>
          </div>
        </section>
      {/if}

      <div class="list-head">
        <h2 class="section-title">Bucket</h2>
        <a class="small" href="/entrate?month={view.incomeMonth}">Entrate base {formatCents(view.incomeCents)}</a>
      </div>
      <div class="stack" style="gap: 12px">
        {#each view.buckets as bucket (bucket.id)}
          <BucketCard {bucket} />
        {/each}
        <a class="btn btn-block" href="/profilo/bucket/nuovo"><Icon name="plus" />Nuovo bucket</a>
      </div>

      {#if view.status === 'open'}
        <button class="btn btn-ghost" type="button" disabled={busy} onclick={() => act('close', `Chiudere ${monthLabel(month)}? I residui passano al mese successivo secondo le regole di ogni bucket.`)}>
          Chiudi {monthLabel(month)}
        </button>
      {:else}
        <button class="btn btn-ghost" type="button" disabled={busy} onclick={() => act('reopen')}>Riapri {monthLabel(month)}</button>
      {/if}
    </div>
  {/if}
</main>

<style>
  .summary {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .total {
    font-size: 40px;
    line-height: 44px;
    font-weight: 700;
  }
  .right {
    text-align: right;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
</style>
