<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A queued expense next to the bank line it may be (mockup "Abbina"). -->
<script lang="ts">
  import { formatCents } from '@cashket/shared';
  import Icon from '$lib/Icon.svelte';

  let {
    note,
    amountCents,
    sub,
    lineTitle,
    lineAmountCents,
    lineSub
  }: { note: string | null; amountCents: number; sub: string; lineTitle: string; lineAmountCents: number; lineSub: string } = $props();

  const differs = $derived(-lineAmountCents !== amountCents);
</script>

<div class="pair">
  <div class="side">
    <p class="tag">LA TUA SPESA</p>
    <p class="title">{note ?? 'Spesa'}</p>
    <p class="amount">{formatCents(amountCents)}</p>
    <p class="muted small">{sub}</p>
  </div>
  <span class="link" aria-hidden="true"><Icon name="right" size={18} stroke={2.5} /></span>
  <div class="side">
    <p class="tag">IN BANCA</p>
    <p class="title">{lineTitle}</p>
    <p class="amount" class:differs>{formatCents(-lineAmountCents)}</p>
    <p class="muted small">{lineSub}</p>
  </div>
</div>
{#if differs}
  <p class="diff">{-lineAmountCents > amountCents ? '+' : '−'}{formatCents(Math.abs(-lineAmountCents - amountCents))} rispetto a quanto hai inserito.</p>
{/if}

<style>
  .pair {
    display: flex;
    align-items: stretch;
    gap: 8px;
  }
  .side {
    flex: 1;
    min-width: 0;
  }
  .tag {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-2);
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .amount {
    font-weight: 700;
  }
  .differs,
  .diff {
    color: var(--over-ink);
  }
  .diff {
    margin-top: 8px;
    font-size: 14px;
    font-weight: 500;
  }
  .link {
    align-self: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
