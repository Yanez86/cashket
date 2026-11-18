<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A bucket's spending month by month, in miniature: one series, so no legend; the last month stands out. -->
<script lang="ts">
  let { values, label }: { values: number[]; label: string } = $props();
  const max = $derived(Math.max(1, ...values));
</script>

<svg viewBox="0 0 {values.length * 10} 32" preserveAspectRatio="none" role="img" aria-label={label}>
  {#each values as v, i (i)}
    {@const h = v > 0 ? Math.max(2, (v / max) * 32) : 0}
    {#if h}<rect x={i * 10 + 1} y={32 - h} width="8" height={h} rx="2" class:last={i === values.length - 1} />{/if}
  {/each}
  <line x1="0" x2={values.length * 10} y1="32" y2="32" vector-effect="non-scaling-stroke" />
</svg>

<style>
  svg {
    width: 84px;
    height: 32px;
    flex: none;
    display: block;
  }
  rect {
    fill: var(--series-spent);
    opacity: 0.45;
  }
  rect.last {
    opacity: 1;
  }
  line {
    stroke: var(--field);
    stroke-width: 1;
  }
</style>
