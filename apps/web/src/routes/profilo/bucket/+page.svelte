<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The person's buckets: tap to edit, swipe left to delete (or archive one that held money), add the
     recommended ones that are missing (improvements 1, 9). -->
<script lang="ts">
  import type { Bucket } from '@cashket/shared';
  import { del, get, post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import { fillText } from '$lib/buckets';

  let buckets = $state<Bucket[]>([]);
  let error = $state('');
  let message = $state('');

  $effect(() => {
    get<Bucket[]>('/buckets').then((list) => (buckets = list), (e) => (error = errorMessage(e)));
  });

  const active = $derived(buckets.filter((b) => !b.archived));
  const archived = $derived(buckets.filter((b) => b.archived));

  async function remove(b: Bucket) {
    error = '';
    try {
      if (b.hasHistory) {
        if (!confirm(`«${b.name}» ha già avuto dei soldi: lo archivio, così la storia resta. Continuare?`)) return;
        const updated = await post<Bucket>(`/buckets/${b.id}/archive`, { archived: true });
        buckets = buckets.map((x) => (x.id === b.id ? updated : x));
      } else {
        if (!confirm(`Eliminare «${b.name}»?`)) return;
        await del(`/buckets/${b.id}`);
        buckets = buckets.filter((x) => x.id !== b.id);
      }
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function recommended() {
    error = '';
    try {
      const res = await post<{ added: number; buckets: Bucket[] }>('/buckets/recommended');
      buckets = res.buckets;
      message = res.added ? `Aggiunti ${res.added} bucket consigliati.` : 'Hai già tutti i bucket consigliati.';
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>Bucket · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Bucket" section="profile">
    {#snippet actions()}
      <a class="icon-btn primary" href="/profilo/bucket/nuovo" aria-label="Nuovo bucket"><Icon name="plus" /></a>
    {/snippet}
  </TopBar>
  <div class="stack">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if message}<p class="notice" role="status">{message}</p>{/if}
    <section class="card list">
      {#each active as b (b.id)}
        <Swipeable label={b.hasHistory ? `Archivia ${b.name}` : `Elimina ${b.name}`} archive={b.hasHistory} ondelete={() => remove(b)} background="var(--surface)">
          <a class="list-row link" href="/profilo/bucket/{b.id}">
            <CategoryIcon icon={b.icon} size={40} />
            <div style="flex: 1; min-width: 0">
              <p>{b.name}</p>
              <p class="muted small">{fillText(b)}</p>
            </div>
            <Icon name="chevron" size={20} />
          </a>
        </Swipeable>
      {:else}
        <p class="muted">Nessun bucket.</p>
      {/each}
    </section>
    <p class="muted small">Tocca un bucket per modificarlo, scorri a sinistra per eliminarlo.</p>
    <button class="btn btn-block" type="button" onclick={recommended}><Icon name="sparkle" />Aggiungi i bucket consigliati</button>

    {#if archived.length}
      <details class="card">
        <summary>Archiviati · {archived.length}</summary>
        {#each archived as b (b.id)}
          <a class="list-row link archived" href="/profilo/bucket/{b.id}">
            <CategoryIcon icon={b.icon} size={40} />
            <div style="flex: 1; min-width: 0">
              <p>{b.name}</p>
              <p class="muted small">{fillText(b)}</p>
            </div>
            <Icon name="chevron" size={20} />
          </a>
        {/each}
      </details>
    {/if}
  </div>
</main>

<style>
  .primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .list {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .link {
    color: inherit;
    text-decoration: none;
  }
  .archived {
    opacity: 0.6;
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
  }
</style>
