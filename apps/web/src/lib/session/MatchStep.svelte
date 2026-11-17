<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 2: queued expenses meet bank lines. Doubtful pairings first, then the sure ones the app made,
     which can be undone; then the expenses still waiting (docs/SPEC.md §6). -->
<script lang="ts">
  import { formatCents, type Account, type SessionView } from '@cashket/shared';
  import { post } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import Pair from './Pair.svelte';

  let { view = $bindable(), accounts, onnext }: { view: SessionView; accounts: Account[]; onnext: () => void } = $props();

  let error = $state('');
  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? 'conto non indicato';
  const day = (d: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
  const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: app.user?.timezone }).format(new Date(iso));
  const line = (id: number) => view.lines.find((l) => l.id === id)!;
  const matched = $derived(view.lines.filter((l) => l.capture && !l.fromCash));
  const cash = $derived(view.lines.filter((l) => l.fromCash));

  async function act(path: string, captureId: number, lineId: number) {
    error = '';
    try {
      view = await post<SessionView>(path, { captureId, lineId });
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<div class="stack" style="gap: 12px">
  <p class="muted">
    <strong>{matched.length}</strong> abbinate · <strong>{view.ask.length}</strong> da verificare · {cash.length} in contanti
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if view.ask.length}
    <h2 class="section-title">Da verificare</h2>
    {#each view.ask as p (p.capture.id)}
      {@const l = line(p.lineId)}
      <section class="card" style="padding: 14px 16px">
        <Pair
          note={p.capture.note}
          amountCents={p.capture.amountCents}
          sub="{day(localDay(p.capture.spentAt))} · {accountName(p.capture.accountId)}"
          lineTitle={l.description}
          lineAmountCents={l.amountCents}
          lineSub="{day(l.date)} · {accountName(l.accountId)}"
        />
        <div class="row">
          <button class="btn btn-primary" type="button" onclick={() => act('/session/matches', p.capture.id, p.lineId)}>Conferma</button>
          <button class="btn" type="button" onclick={() => act('/session/rejections', p.capture.id, p.lineId)}>Non è questa</button>
        </div>
      </section>
    {/each}
  {/if}

  {#if matched.length}
    <h2 class="section-title">Abbinate</h2>
    {#each matched as l (l.id)}
      <section class="card" style="padding: 14px 16px">
        <Pair
          note={l.capture!.note}
          amountCents={l.capture!.amountCents}
          sub={l.capture!.matchedBy === 'auto' ? 'abbinata dall\'app' : 'confermata da te'}
          lineTitle={l.description}
          lineAmountCents={l.amountCents}
          lineSub="{day(l.date)} · {accountName(l.accountId)}"
        />
        <div class="row">
          <p class="state"><Icon name="check" size={16} stroke={2.5} />{l.capture!.amountCents === -l.amountCents ? 'Importo e data coincidono' : 'Abbinata'}</p>
          <button class="btn btn-ghost" type="button" onclick={() => act('/session/rejections', l.capture!.id, l.id)}>Separa</button>
        </div>
      </section>
    {/each}
  {/if}

  {#if view.unmatched.length}
    <section class="card">
      <h2 class="section-title">Ancora senza riga in banca</h2>
      {#each view.unmatched as c (c.id)}
        <div class="list-row">
          <div style="flex: 1; min-width: 0">
            <p>{c.note ?? 'Spesa'}</p>
            <p class="muted small">{day(localDay(c.spentAt))} · {accountName(c.accountId)}{c.stale ? ' · in attesa da molti giorni' : ''}</p>
          </div>
          <strong class:status-ink-over={c.stale}>{formatCents(c.amountCents)}</strong>
        </div>
      {/each}
      <p class="help" style="margin-top: 8px">Restano in coda per la prossima sessione. Se è un contante, indica il conto Contanti nella coda.</p>
    </section>
  {/if}

  <button class="btn btn-primary btn-block" type="button" onclick={onnext}>Continua · Assegna</button>
</div>

<style>
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .state {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--ok-ink);
  }
</style>
