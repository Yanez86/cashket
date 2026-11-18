<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Andamento: base income against spending month by month, then each bucket's spending with its average. -->
<script lang="ts">
  import { formatCents, monthOf, type Trends } from '@cashket/shared';
  import { get } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import MonthBars from '$lib/MonthBars.svelte';
  import SparkBars from '$lib/SparkBars.svelte';
  import { monthLabel } from '$lib/buckets';

  const current = monthOf(new Date(), app.user?.timezone);
  let count = $state(6);
  let data = $state<Trends | null>(null);
  let error = $state('');

  $effect(() => {
    const n = count;
    get<Trends>(`/trends?to=${current}&months=${n}`).then(
      (t) => {
        if (n === count) data = t;
      },
      (e) => (error = errorMessage(e))
    );
  });

  const total = $derived(data?.months.reduce((t, m) => ({ income: t.income + m.incomeCents, spent: t.spent + m.spentCents }), { income: 0, spent: 0 }));
  const average = (values: number[]) => Math.round(values.slice(0, -1).reduce((t, v) => t + v, 0) / Math.max(1, values.length - 1));
  const hasData = $derived(!!data?.months.some((m) => m.incomeCents || m.spentCents));
</script>

<svelte:head><title>Andamento · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Andamento" subtitle="Ultimi {count} mesi" section="trends" />
  <div class="stack">
    <div class="chips" role="group" aria-label="Periodo">
      {#each [6, 12] as n (n)}
        <button class="chip" type="button" aria-pressed={count === n} onclick={() => (count = n)}>{n} mesi</button>
      {/each}
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if data && !hasData}
      <p class="notice">Ancora niente da mostrare: i grafici si riempiono con le entrate e le spese assegnate nelle sessioni.</p>
    {:else if data && total}
      <section class="card">
        <h2 class="section-title">Entrate e spese</h2>
        <MonthBars months={data.months} label={monthLabel} />
        <p class="muted small" style="margin-top: 12px">
          In {count} mesi: entrate base {formatCents(total.income)}, speso {formatCents(total.spent)}{#if total.income}, cioè il {Math.round((total.spent / total.income) * 100)}% delle entrate{/if}.
        </p>
        <details>
          <summary>Vedi la tabella</summary>
          <table>
            <thead><tr><th scope="col">Mese</th><th scope="col">Entrate base</th><th scope="col">Speso</th><th scope="col">Differenza</th></tr></thead>
            <tbody>
              {#each data.months as m (m.month)}
                <tr>
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td>{formatCents(m.incomeCents)}</td>
                  <td>{formatCents(m.spentCents)}</td>
                  <td>{formatCents(m.incomeCents - m.spentCents)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </details>
      </section>

      <section class="card">
        <h2 class="section-title">Per bucket</h2>
        <p class="muted small">Speso questo mese, e la media dei mesi prima.</p>
        {#each data.buckets as b (b.bucket.id)}
          {@const now = b.spentCents.at(-1) ?? 0}
          {@const avg = average(b.spentCents)}
          <div class="list-row">
            <CategoryIcon icon={b.bucket.icon} size={40} />
            <div style="flex: 1; min-width: 0">
              <p class="ellipsis">{b.bucket.name}</p>
              <p class="muted small">media {formatCents(avg)}{#if avg && now > avg * 1.2} · <span class="status-ink-over">sopra la media</span>{/if}</p>
            </div>
            <SparkBars values={b.spentCents} label="{b.bucket.name}: speso per mese, ultimo {formatCents(now)}" />
            <strong class="amount">{formatCents(now)}</strong>
          </div>
        {/each}
      </section>
    {/if}
  </div>
</main>

<style>
  details {
    margin-top: 12px;
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--accent-ink);
    font-weight: 600;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 6px 4px;
    text-align: right;
    border-bottom: 1px solid var(--border);
  }
  th:first-child {
    text-align: left;
    font-weight: 500;
    text-transform: capitalize;
  }
  thead th {
    color: var(--text-2);
    font-weight: 600;
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .amount {
    min-width: 76px;
    text-align: right;
  }
</style>
