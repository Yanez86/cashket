<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reconciliation session in four steps: Importa → Abbina → Assegna → Controlla (docs/SPEC.md §5.3). -->
<script lang="ts">
  import type { Account, Bucket, ImportBatch, SessionView } from '@cashket/shared';
  import { get, post } from '$lib/api';
  import { app, errorMessage, loadSession } from '$lib/state.svelte';
  import { refreshQueue } from '$lib/offline.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import ImportStep from '$lib/session/ImportStep.svelte';
  import MatchStep from '$lib/session/MatchStep.svelte';
  import AssignStep from '$lib/session/AssignStep.svelte';
  import ReviewStep from '$lib/session/ReviewStep.svelte';

  const STEPS = ['Importa', 'Abbina', 'Assegna', 'Controlla'];
  let step = $state(1);
  let view = $state<SessionView | null>(null);
  let batches = $state<ImportBatch[]>([]);
  let accounts = $state<Account[]>([]);
  let buckets = $state<Bucket[]>([]);
  let closed = $state(false);
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    Promise.all([get<SessionView>('/session'), get<Account[]>('/accounts'), get<Bucket[]>('/buckets')])
      .then(([v, a, b]) => {
        view = v;
        batches = v.batches;
        accounts = a;
        buckets = b.filter((x) => !x.archived);
      })
      .catch((e) => (error = errorMessage(e)));
  });

  /** Steps after the import work on a prepared session: cash lines, sure pairings, rules. */
  async function go(next: number) {
    error = '';
    if (next >= 2 && step === 1) {
      busy = true;
      try {
        view = await post<SessionView>('/session/prepare');
        await refreshQueue();
      } catch (e) {
        error = errorMessage(e);
        return;
      } finally {
        busy = false;
      }
    }
    step = next;
    scrollTo({ top: 0 });
  }

  async function close() {
    busy = true;
    error = '';
    try {
      view = await post<SessionView>('/session/close');
      closed = true;
      await loadSession();
      await refreshQueue();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sessione · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Sessione" subtitle="Passo {step} di 4 · {STEPS[step - 1]}" section="session">
    {#snippet actions()}
      <a class="icon-btn" href="/coda" aria-label="Chiudi"><Icon name="close" /></a>
    {/snippet}
  </TopBar>

  {#if closed}
    <section class="card done">
      <p class="section-title">Sessione chiusa</p>
      <p class="muted">Le spese sono nei bucket. Alla prossima!</p>
      <a class="btn btn-primary btn-block" href="/">Vai ai bucket</a>
    </section>
  {:else}
    <nav class="stepper" aria-label="Passi della sessione">
      <div class="segs">
        {#each STEPS as _, i (i)}<span class:on={i < step}></span>{/each}
      </div>
      <div class="names">
        {#each STEPS as name, i (name)}
          <button type="button" aria-current={i + 1 === step ? 'step' : undefined} disabled={busy} onclick={() => go(i + 1)}>{name}</button>
        {/each}
      </div>
    </nav>
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if view}
      {#if step === 1}
        <ImportStep {accounts} bind:batches onnext={() => go(2)} />
      {:else if step === 2}
        <MatchStep bind:view {accounts} onnext={() => go(3)} />
      {:else if step === 3}
        <AssignStep bind:view {accounts} {buckets} onnext={() => go(4)} />
      {:else}
        <ReviewStep {view} {buckets} {busy} ongoto={go} onclose={close} />
      {/if}
    {/if}
  {/if}
  <p class="muted small" style="margin-top: 16px; text-align: center">Ultima sessione: {app.user?.lastSessionAt ? new Date(app.user.lastSessionAt).toLocaleDateString('it-IT') : 'mai'}</p>
</main>

<style>
  .stepper {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }
  .segs,
  .names {
    display: flex;
    gap: 6px;
  }
  .segs span {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
  }
  .segs span.on {
    background: var(--accent);
  }
  .names button {
    flex: 1;
    min-height: 44px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    text-align: left;
    cursor: pointer;
  }
  .names button[aria-current='step'] {
    font-weight: 700;
    color: var(--accent-ink);
  }
  .done {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
</style>
