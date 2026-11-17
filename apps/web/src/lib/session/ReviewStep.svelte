<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 4: what the app decided by itself, what deserves a second look, and what the session does to the
     buckets. "Chiudi sessione" confirms everything (docs/SPEC.md §5.3). -->
<script lang="ts">
  import { formatCents, type Bucket, type SessionView } from '@cashket/shared';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import Icon from '$lib/Icon.svelte';

  let { view, buckets, busy, ongoto, onclose }: { view: SessionView; buckets: Bucket[]; busy: boolean; ongoto: (step: number) => void; onclose: () => void } = $props();

  const autoMatches = $derived(view.lines.filter((l) => l.capture?.matchedBy === 'auto' && !l.fromCash));
  const byRule = $derived(view.lines.filter((l) => l.assignedBy === 'rule'));
  const recheck = $derived(view.lines.filter((l) => l.newRule || (l.capture?.matchedBy === 'auto' && l.capture.score < 90 && !l.fromCash)));
  const bucket = (id: number | null) => buckets.find((b) => b.id === id);
</script>

<div class="stack" style="gap: 12px">
  <section class="card">
    <h2 class="section-title">Cosa ha deciso l'app</h2>
    <div class="list-row">
      <Icon name="right" /><span class="grow">{autoMatches.length} abbinamenti automatici</span>
      <button class="btn btn-ghost" type="button" onclick={() => ongoto(2)}>Rivedi</button>
    </div>
    <div class="list-row">
      <Icon name="sparkle" /><span class="grow">{byRule.length} assegnazioni da regole</span>
      <button class="btn btn-ghost" type="button" onclick={() => ongoto(3)}>Rivedi</button>
    </div>
  </section>

  {#if recheck.length}
    <section class="card">
      <h2 class="section-title over"><Icon name="alert" size={20} />Da ricontrollare · {recheck.length}</h2>
      {#each recheck as l (l.id)}
        {@const b = bucket(l.bucketId)}
        <div class="list-row">
          {#if b}<CategoryIcon icon={b.icon} size={40} />{/if}
          <div class="grow">
            <p>{l.description}{b ? ` → ${b.name}` : ''}</p>
            <p class="muted small">{l.newRule ? 'Regola nuova' : 'Abbinamento automatico incerto'}</p>
          </div>
          <strong>{formatCents(l.amountCents)}</strong>
        </div>
      {/each}
    </section>
  {/if}

  <section class="card">
    <h2 class="section-title">Effetto sui bucket</h2>
    {#each view.effect as e (e.bucketId)}
      {@const b = bucket(e.bucketId)}
      <div class="list-row">
        {#if b}<CategoryIcon icon={b.icon} size={36} />{/if}
        <span class="grow">{b?.name ?? 'Bucket'}</span>
        <strong>{formatCents(e.cents)}</strong>
      </div>
    {:else}
      <p class="muted">Nessuna spesa assegnata in questa sessione.</p>
    {/each}
  </section>

  {#if view.open}
    <p class="notice">Mancano {view.open} {view.open === 1 ? 'riga' : 'righe'} da assegnare. <button class="link" type="button" onclick={() => ongoto(3)}>Vai ad Assegna</button></p>
  {/if}
  <button class="btn btn-primary btn-block" type="button" disabled={busy || view.open > 0 || !view.lines.length} onclick={onclose}><Icon name="check" />Chiudi sessione</button>
</div>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .over {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--over-ink);
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: var(--accent-ink);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
