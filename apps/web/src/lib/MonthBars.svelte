<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Base income and spending side by side for each month: one axis (euros), two series, thin bars with
     rounded tops, a 2px gap between the pair. Tapping or hovering a month shows its numbers above. -->
<script lang="ts">
  import { formatCents } from '@cashket/shared';

  let { months, label }: { months: { month: string; incomeCents: number; spentCents: number }[]; label: (m: string) => string } = $props();

  let selected = $state<number | null>(null);
  const shownIndex = $derived(selected ?? months.length - 1);
  const shown = $derived(months[shownIndex]);

  const H = 160;
  const max = $derived(Math.max(1, ...months.flatMap((m) => [m.incomeCents, m.spentCents])));
  /** A round top for the axis: 1, 2 or 5 × a power of ten, in euros. */
  const top = $derived.by(() => {
    const euros = max / 100;
    const p = 10 ** Math.floor(Math.log10(euros));
    const step = [1, 2, 5, 10].map((k) => k * p).find((v) => v >= euros) ?? 10 * p;
    return step * 100;
  });
  const ticks = $derived([0, top / 2, top]);
  const y = (cents: number) => H - (cents / top) * H;
  const short = (cents: number) =>
    cents >= 100000 ? `${(cents / 100000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k €` : `${Math.round(cents / 100)} €`;

  /** A bar with its top corners rounded (4px) and its foot square on the baseline. */
  function bar(x: number, w: number, cents: number) {
    const h = Math.max(0, H - y(cents));
    if (h < 1) return '';
    const r = Math.min(4, w / 2, h);
    const t = H - h;
    return `M${x},${H}V${t + r}Q${x},${t} ${x + r},${t}H${x + w - r}Q${x + w},${t} ${x + w},${t + r}V${H}Z`;
  }
  const W = 100; // each month column is 100 units wide; the svg scales to the card
  const BAR = 22;
</script>

<div class="readout" aria-live="polite">
  <p class="month">{label(shown.month)}</p>
  <div class="values">
    <span><i class="key income" aria-hidden="true"></i>Entrate base <strong>{formatCents(shown.incomeCents)}</strong></span>
    <span><i class="key spent" aria-hidden="true"></i>Speso <strong>{formatCents(shown.spentCents)}</strong></span>
  </div>
</div>

<div class="chart">
  <div class="axis" aria-hidden="true">
    {#each [...ticks].reverse() as t (t)}<span>{short(t)}</span>{/each}
  </div>
  <div class="plot">
    <svg viewBox="0 0 {months.length * W} {H}" preserveAspectRatio="none" role="img" aria-label="Entrate base e spese degli ultimi {months.length} mesi">
      {#each ticks as t (t)}
        <line x1="0" x2={months.length * W} y1={y(t)} y2={y(t)} class={t === 0 ? 'base' : 'grid'} vector-effect="non-scaling-stroke" />
      {/each}
      {#each months as m, i (m.month)}
        <g class:dim={i !== shownIndex}>
          <path class="income" d={bar(i * W + W / 2 - BAR - 1, BAR, m.incomeCents)} />
          <path class="spent" d={bar(i * W + W / 2 + 1, BAR, m.spentCents)} />
        </g>
      {/each}
    </svg>
    <div class="hits">
      {#each months as m, i (m.month)}
        <button
          type="button"
          aria-label="{label(m.month)}: entrate {formatCents(m.incomeCents)}, speso {formatCents(m.spentCents)}"
          aria-pressed={i === shownIndex}
          onmouseenter={() => (selected = i)}
          onfocus={() => (selected = i)}
          onclick={() => (selected = i)}
        ></button>
      {/each}
    </div>
    <div class="labels" aria-hidden="true">
      {#each months as m (m.month)}<span>{label(m.month).slice(0, 3)}</span>{/each}
    </div>
  </div>
</div>

<style>
  .readout {
    margin-bottom: 12px;
  }
  .month {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: capitalize;
  }
  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 15px;
  }
  .values span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .key {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .key.income,
  path.income {
    background: var(--series-income);
    fill: var(--series-income);
  }
  .key.spent,
  path.spent {
    background: var(--series-spent);
    fill: var(--series-spent);
  }
  .chart {
    display: flex;
    gap: 8px;
  }
  .axis {
    height: 160px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-2);
    text-align: right;
    transform: translateY(-6px);
  }
  .plot {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  svg {
    display: block;
    width: 100%;
    height: 160px;
    overflow: visible;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
  }
  .base {
    stroke: var(--field);
    stroke-width: 1;
  }
  .dim {
    opacity: 0.45;
  }
  .hits {
    position: absolute;
    inset: 0 0 auto 0;
    height: 184px;
    display: flex;
  }
  .hits button {
    flex: 1;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 8px;
  }
  .hits button:focus-visible {
    outline: 2px solid var(--accent);
  }
  .labels {
    display: flex;
    margin-top: 6px;
  }
  .labels span {
    flex: 1;
    text-align: center;
    font-size: 12px;
    color: var(--text-2);
    text-transform: capitalize;
  }
</style>
