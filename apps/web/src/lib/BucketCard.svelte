<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- One bucket in the month: icon, name and rule, what is left, a bar and its state (docs/SPEC.md §9.2). -->
<script lang="ts">
  import { formatCents, type BucketView } from '@cashket/shared';
  import CategoryIcon from './CategoryIcon.svelte';
  import Icon from './Icon.svelte';
  import { fillText } from './buckets';

  let { bucket }: { bucket: BucketView } = $props();

  const available = $derived(bucket.balanceCents + bucket.spentCents);
  const pct = $derived(
    bucket.kind === 'saving'
      ? bucket.goalCents
        ? Math.min(100, Math.max(0, (bucket.balanceCents / bucket.goalCents) * 100))
        : null
      : bucket.balanceCents < 0
        ? 100
        : available > 0
          ? Math.min(100, (bucket.spentCents / available) * 100)
          : 0
  );
  const statusText = $derived(
    bucket.status === 'over'
      ? `Sforato di ${formatCents(-bucket.balanceCents)}`
      : bucket.status === 'saving'
        ? bucket.goalCents
          ? `In accumulo · ${Math.round(pct ?? 0)}% dell'obiettivo`
          : 'In accumulo'
        : 'Nel budget'
  );
</script>

<a class="card bucket" href="/profilo/bucket/{bucket.id}">
  <div class="head">
    <CategoryIcon icon={bucket.icon} size={44} />
    <div class="titles">
      <p class="name">{bucket.name}</p>
      <p class="muted small">{fillText(bucket)}</p>
    </div>
    <div class="amount">
      <p class="big">{formatCents(bucket.balanceCents)}</p>
      <p class="muted small">
        {#if bucket.kind === 'saving' && bucket.goalCents}di {formatCents(bucket.goalCents)}{:else if bucket.status === 'over'}sforato{:else}restano{/if}
      </p>
    </div>
  </div>
  {#if pct != null}
    <div class="bar"><span class="status-{bucket.status}" style:width="{pct}%"></span></div>
  {/if}
  <p class="state status-ink-{bucket.status}">
    <Icon name={bucket.status === 'ok' ? 'check' : 'up'} size={16} stroke={2.5} />{statusText}
  </p>
</a>

<style>
  .bucket {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: inherit;
    text-decoration: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
  }
  .amount {
    text-align: right;
  }
  .big {
    font-size: 20px;
    font-weight: 700;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }
</style>
