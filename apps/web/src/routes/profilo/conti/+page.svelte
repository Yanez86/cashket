<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Where money comes from and goes to. Tap an account to change it; swipe left to delete it, or archive
     it when it has lines (improvements 1–5). A card has the account its statement is charged to. -->
<script lang="ts">
  import type { Account, AccountKind } from '@cashket/shared';
  import { del, get, patch, post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import Icon from '$lib/Icon.svelte';
  import { ACCOUNT_KINDS, accountImg, kindLabel } from '$lib/accounts';

  let accounts = $state<Account[]>([]);
  let error = $state('');
  let busy = $state(false);
  /** The account being edited (id), or 'new'. */
  let editing = $state<number | 'new' | null>(null);
  let name = $state('');
  let kind = $state<AccountKind>('checking');
  let settlesTo = $state<number | null>(null);

  $effect(() => {
    get<Account[]>('/accounts').then((list) => (accounts = list), (e) => (error = errorMessage(e)));
  });

  const active = $derived(accounts.filter((a) => !a.archived));
  const archived = $derived(accounts.filter((a) => a.archived));
  const nameOf = (id: number | null) => accounts.find((a) => a.id === id)?.name;
  const subtitle = (a: Account) =>
    [a.name.trim().toLowerCase() === kindLabel(a.kind).toLowerCase() ? null : kindLabel(a.kind), a.settlesToAccountId ? `addebitata su ${nameOf(a.settlesToAccountId)}` : null]
      .filter(Boolean)
      .join(' · ');

  function edit(a: Account | null) {
    error = '';
    editing = a ? a.id : 'new';
    name = a?.name ?? '';
    kind = a?.kind ?? 'checking';
    settlesTo = a?.settlesToAccountId ?? null;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const body = { name, kind, settlesToAccountId: kind === 'card' ? settlesTo : null };
      if (editing === 'new') accounts = [...accounts, await post<Account>('/accounts', body)];
      else {
        const updated = await patch<Account>(`/accounts/${editing}`, body);
        accounts = accounts.map((x) => (x.id === updated.id ? updated : x));
      }
      editing = null;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function remove(a: Account) {
    error = '';
    try {
      if (a.hasHistory) {
        if (!confirm(`«${a.name}» ha dei movimenti: lo archivio, così la storia resta. Continuare?`)) return;
        const updated = await patch<Account>(`/accounts/${a.id}`, { archived: true });
        accounts = accounts.map((x) => (x.id === a.id ? updated : x));
      } else {
        if (!confirm(`Eliminare «${a.name}»?`)) return;
        await del(`/accounts/${a.id}`);
        accounts = accounts.filter((x) => x.id !== a.id);
      }
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function restore(a: Account) {
    try {
      const updated = await patch<Account>(`/accounts/${a.id}`, { archived: false });
      accounts = accounts.map((x) => (x.id === a.id ? updated : x));
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const settleOptions = $derived(active.filter((a) => a.kind !== 'card' && a.id !== editing));
</script>

<svelte:head><title>Conti · Cashket</title></svelte:head>

{#snippet form()}
  <form class="stack form" style="gap: 14px" onsubmit={save}>
    <div class="field">
      <label for="name">Nome</label>
      <input id="name" required maxlength="100" placeholder="Conto BPM, Carta Nexi…" bind:value={name} />
    </div>
    <div class="field">
      <span class="label" id="kind">Tipo</span>
      <div class="chips" role="group" aria-labelledby="kind">
        {#each ACCOUNT_KINDS as k (k.value)}
          <button class="chip" type="button" aria-pressed={kind === k.value} onclick={() => (kind = k.value)}>
            <img src={accountImg({ kind: k.value })} alt="" width="22" height="22" />{k.label}
          </button>
        {/each}
      </div>
    </div>
    {#if kind === 'card'}
      <div class="field">
        <span class="label" id="settles">Addebitata su</span>
        <div class="chips" role="group" aria-labelledby="settles">
          <button class="chip" type="button" aria-pressed={settlesTo == null} onclick={() => (settlesTo = null)}>Nessun conto</button>
          {#each settleOptions as a (a.id)}
            <button class="chip" type="button" aria-pressed={settlesTo === a.id} onclick={() => (settlesTo = a.id)}>{a.name}</button>
          {/each}
        </div>
        <p class="help">L'addebito mensile della carta su quel conto sarà un giroconto, non una spesa.</p>
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <button class="btn btn-primary" type="submit" disabled={busy || !name.trim()}>{editing === 'new' ? 'Aggiungi' : 'Salva'}</button>
      <button class="btn btn-ghost" type="button" onclick={() => (editing = null)}>Annulla</button>
    </div>
  </form>
{/snippet}

<main class="page">
  <TopBar title="Conti" section="profile" />
  <div class="stack">
    {#if error && editing == null}<p class="error" role="alert">{error}</p>{/if}
    <section class="card list">
      {#each active as a (a.id)}
        {#if editing === a.id}
          {@render form()}
        {:else}
          <Swipeable label={a.hasHistory ? `Archivia ${a.name}` : `Elimina ${a.name}`} archive={a.hasHistory} ondelete={() => remove(a)} background="var(--surface)">
            <button class="list-row row-btn" type="button" onclick={() => edit(a)}>
              <img src={accountImg(a)} alt="" width="40" height="40" />
              <span class="grow">
                <span class="title">{a.name}</span>
                {#if subtitle(a)}<span class="muted small">{subtitle(a)}</span>{/if}
              </span>
              <Icon name="chevron" size={20} />
            </button>
          </Swipeable>
        {/if}
      {:else}
        <p class="muted">Nessun conto.</p>
      {/each}
    </section>
    <p class="muted small">Tocca un conto per modificarlo, scorri a sinistra per eliminarlo.</p>

    {#if editing === 'new'}
      <section class="card">{@render form()}</section>
    {:else}
      <button class="btn btn-block" type="button" onclick={() => edit(null)}><Icon name="plus" />Nuovo conto</button>
    {/if}

    {#if archived.length}
      <details class="card">
        <summary>Archiviati · {archived.length}</summary>
        {#each archived as a (a.id)}
          <div class="list-row archived">
            <img src={accountImg(a)} alt="" width="40" height="40" />
            <span class="grow">
              <span class="title">{a.name}</span>
              {#if subtitle(a)}<span class="muted small">{subtitle(a)}</span>{/if}
            </span>
            <button class="btn btn-ghost" type="button" onclick={() => restore(a)}>Ripristina</button>
          </div>
        {/each}
      </details>
    {/if}
  </div>
</main>

<style>
  .list {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .row-btn {
    width: 100%;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-size: 17px;
  }
  .form {
    padding: 12px 0;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
  }
  .archived img,
  .archived .grow {
    opacity: 0.6;
  }
</style>
