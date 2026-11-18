<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Income of a month, typed by hand until imports bring it in. "Base budget" income fills the percentage buckets. -->
<script lang="ts">
  import { page } from '$app/state';
  import { addMonths, formatCents, isMonth, monthOf, monthRange, type Account, type Income } from '@cashket/shared';
  import { del, get, post } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import MoneyField from '$lib/MoneyField.svelte';
  import DateField from '$lib/DateField.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import { accountImg } from '$lib/accounts';
  import { monthLabel } from '$lib/buckets';

  const fromUrl = page.url.searchParams.get('month') ?? '';
  let month = $state(isMonth(fromUrl) ? fromUrl : monthOf(new Date(), app.user?.timezone));
  let incomes = $state<Income[]>([]);
  let accounts = $state<Account[]>([]);
  let error = $state('');

  let description = $state('Stipendio');
  let amountCents = $state<number | null>(null);
  let accountId = $state<number | null>(null);
  let date = $state('');
  let budgetBase = $state(true);
  let busy = $state(false);

  $effect(() => {
    const m = month;
    date = m === monthOf(new Date(), app.user?.timezone) ? new Date().toISOString().slice(0, 10) : monthRange(m).to;
    get<Income[]>(`/incomes?month=${m}`).then((list) => (incomes = list), (e) => (error = errorMessage(e)));
  });

  $effect(() => {
    get<Account[]>('/accounts').then((list) => {
      accounts = list.filter((a) => !a.archived);
      accountId ??= (accounts.find((a) => a.kind === 'checking') ?? accounts[0])?.id ?? null;
    });
  });

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '';

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!amountCents || !accountId) return;
    busy = true;
    error = '';
    try {
      const income = await post<Income>('/incomes', { accountId, date, amountCents, description, budgetBase });
      if (income.date.startsWith(month)) incomes = [income, ...incomes].sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function remove(income: Income) {
    try {
      await del(`/incomes/${income.id}`);
      incomes = incomes.filter((i) => i.id !== income.id);
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>Entrate · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Entrate" subtitle={monthLabel(month)}>
    {#snippet actions()}
      <button class="icon-btn" type="button" aria-label="Mese precedente" onclick={() => (month = addMonths(month, -1))}><Icon name="left" /></button>
      <button class="icon-btn" type="button" aria-label="Mese successivo" onclick={() => (month = addMonths(month, 1))}><Icon name="right" /></button>
    {/snippet}
  </TopBar>
  <div class="stack">
    <section class="card">
      {#each incomes as income (income.id)}
        <Swipeable label="Elimina {income.description}" ondelete={() => remove(income)} background="var(--surface)">
          <div class="list-row">
            <div style="flex: 1; min-width: 0">
              <p>{income.description}</p>
              <p class="muted small">{income.date} · {accountName(income.accountId)}{income.budgetBase ? ' · base budget' : ''}</p>
            </div>
            <strong>{formatCents(income.amountCents)}</strong>
          </div>
        </Swipeable>
      {:else}
        <p class="muted">Nessuna entrata in {monthLabel(month)}.</p>
      {/each}
    </section>
    {#if incomes.length}<p class="muted small">Scorri a sinistra per eliminare un'entrata.</p>{/if}

    <form class="card stack" onsubmit={add}>
      <h2 class="section-title">Aggiungi un'entrata</h2>
      <div class="field">
        <label for="description">Descrizione</label>
        <input id="description" required maxlength="200" bind:value={description} />
      </div>
      <MoneyField id="amount" label="Importo" bind:cents={amountCents} required />
      <div class="field">
        <span class="label" id="account">Conto</span>
        <div class="chips" role="group" aria-labelledby="account">
          {#each accounts as a (a.id)}
            <button class="chip" type="button" aria-pressed={accountId === a.id} onclick={() => (accountId = a.id)}>
              <img src={accountImg(a)} alt="" width="22" height="22" />{a.name}
            </button>
          {/each}
        </div>
      </div>
      <DateField id="date" label="Data" bind:value={date} />
      <label class="check">
        <input type="checkbox" bind:checked={budgetBase} />
        <span>Base budget <span class="muted small">— conta per i bucket a percentuale (sì per lo stipendio, no per rimborsi e giroconti)</span></span>
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy || !amountCents}>Aggiungi</button>
    </form>
  </div>
</main>

<style>
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-height: 44px;
  }
  .check input {
    width: 22px;
    height: 22px;
    margin: 2px 0 0;
    accent-color: var(--accent);
  }
</style>
