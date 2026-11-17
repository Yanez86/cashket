<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 3: every line gets a bucket, or is marked as a transfer or as income. Rules propose; "Ricorda"
     makes a new rule for descriptions like this one (docs/SPEC.md §5.3). -->
<script lang="ts">
  import { formatCents, type Account, type Bucket, type SessionLine, type SessionView } from '@cashket/shared';
  import { post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import Icon from '$lib/Icon.svelte';

  let { view = $bindable(), accounts, buckets, onnext }: { view: SessionView; accounts: Account[]; buckets: Bucket[]; onnext: () => void } = $props();

  let filter = $state<'todo' | 'all' | 'other'>('todo');
  let remember = $state<Record<number, boolean>>({});
  let error = $state('');

  const expenses = $derived(view.lines.filter((l) => l.kind === 'expense'));
  const done = $derived(expenses.filter((l) => l.bucketId != null).length);
  const shown = $derived(
    filter === 'todo' ? expenses.filter((l) => l.bucketId == null) : filter === 'other' ? view.lines.filter((l) => l.kind !== 'expense') : view.lines
  );
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '';
  const day = (d: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const TRANSFER: Record<string, string> = {
    card_settlement: 'Addebito della carta',
    withdrawal: 'Prelievo',
    paypal_funding: 'Pagamento PayPal',
    other: 'Giroconto'
  };

  async function run(path: string, body: unknown) {
    error = '';
    try {
      view = await post<SessionView>(path, body);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const assign = (l: SessionLine, bucketId: number) =>
    run(`/session/lines/${l.id}/assign`, { bucketId, remember: remember[l.id] ?? (l.assignedBy !== 'rule' && l.suggestedBucketId == null) });
  const setKind = (l: SessionLine, kind: SessionLine['kind'], budgetBase = false) => run(`/session/lines/${l.id}/kind`, { kind, budgetBase, remember: remember[l.id] ?? false });
</script>

<div class="stack" style="gap: 12px">
  <div class="head">
    <h2 class="section-title">Assegna ai bucket</h2>
    <span class="muted">{done} di {expenses.length}</span>
  </div>
  <div class="bar"><span class="status-ok" style:width="{expenses.length ? (done / expenses.length) * 100 : 100}%"></span></div>
  <div class="chips" role="group" aria-label="Mostra">
    <button class="chip" type="button" aria-pressed={filter === 'todo'} onclick={() => (filter = 'todo')}>Da assegnare {expenses.length - done}</button>
    <button class="chip" type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>Tutte {view.lines.length}</button>
    <button class="chip" type="button" aria-pressed={filter === 'other'} onclick={() => (filter = 'other')}>Entrate e giroconti {view.lines.length - expenses.length}</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#each shown as l (l.id)}
    <section class="card line" style="padding: 14px 16px">
      <div class="top">
        <div style="flex: 1; min-width: 0">
          <p class="title">{l.description}</p>
          <p class="muted small">{day(l.date)} · {accountName(l.accountId)}{l.capture?.note ? ` · «${l.capture.note}»` : ''}</p>
        </div>
        <strong class:status-ink-ok={l.amountCents > 0}>{formatCents(l.amountCents)}</strong>
      </div>

      {#if l.kind === 'expense'}
        <div class="chips">
          {#each buckets as b (b.id)}
            <button class="chip bucket" type="button" class:suggested={l.bucketId == null && l.suggestedBucketId === b.id} aria-pressed={l.bucketId === b.id} onclick={() => assign(l, b.id)}>
              <CategoryIcon icon={b.icon} size={26} badge={false} />{b.name}
            </button>
          {/each}
        </div>
        <div class="foot">
          {#if l.assignedBy === 'rule'}<span class="tag"><Icon name="sparkle" size={14} stroke={2.5} />Regola</span>{/if}
          <label class="check">
            <input type="checkbox" checked={remember[l.id] ?? (l.assignedBy !== 'rule' && l.suggestedBucketId == null)} onchange={(e) => (remember[l.id] = e.currentTarget.checked)} />
            Ricorda per «{l.description}»
          </label>
          {#if !l.fromCash && !l.capture}
            <button class="btn btn-ghost small-btn" type="button" onclick={() => setKind(l, 'transfer')}>È un giroconto</button>
          {/if}
        </div>
      {:else if l.kind === 'income'}
        <div class="foot">
          <label class="check">
            <input type="checkbox" checked={l.budgetBase} onchange={(e) => setKind(l, 'income', e.currentTarget.checked)} />
            Base budget (stipendio)
          </label>
          <button class="btn btn-ghost small-btn" type="button" onclick={() => setKind(l, 'transfer')}>È un giroconto</button>
          <button class="btn btn-ghost small-btn" type="button" onclick={() => setKind(l, 'expense')}>È un rimborso</button>
        </div>
      {:else}
        <div class="foot">
          <span class="tag neutral">{TRANSFER[l.transferKind ?? 'other']} · non conta nei bucket</span>
          <button class="btn btn-ghost small-btn" type="button" onclick={() => setKind(l, l.amountCents > 0 ? 'income' : 'expense')}>{l.amountCents > 0 ? 'È un\'entrata' : 'È una spesa'}</button>
        </div>
      {/if}
    </section>
  {:else}
    <p class="notice">Tutto assegnato.</p>
  {/each}

  <button class="btn btn-primary btn-block" type="button" onclick={onnext}>Continua · Controlla</button>
</div>

<style>
  .head,
  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .line {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bucket {
    padding-left: 10px;
  }
  .suggested {
    border-color: var(--accent);
    border-style: dashed;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
    font-size: 15px;
  }
  .check input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-size: 13px;
    font-weight: 600;
  }
  .neutral {
    background: var(--surface-2);
    color: var(--text-2);
  }
  .small-btn {
    min-height: 44px;
    padding: 0 12px;
    font-size: 15px;
  }
</style>
