<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { Bucket } from '@cashket/shared';
  import { get } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import { fillText } from '$lib/buckets';

  let buckets = $state<Bucket[]>([]);
  let error = $state('');

  $effect(() => {
    get<Bucket[]>('/buckets').then((list) => (buckets = list), (e) => (error = errorMessage(e)));
  });
</script>

<svelte:head><title>Bucket · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Bucket" section="profile">
    {#snippet actions()}
      <a class="icon-btn primary" href="/profilo/bucket/nuovo" aria-label="Nuovo bucket"><Icon name="plus" /></a>
    {/snippet}
  </TopBar>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <section class="card">
    {#each buckets as b (b.id)}
      <a class="list-row link" class:archived={b.archived} href="/profilo/bucket/{b.id}">
        <CategoryIcon icon={b.icon} size={40} />
        <div style="flex: 1; min-width: 0">
          <p>{b.name}</p>
          <p class="muted small">{fillText(b)}{b.archived ? ' · archiviato' : ''}</p>
        </div>
        <Icon name="chevron" size={20} />
      </a>
    {/each}
  </section>
</main>

<style>
  .primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .link {
    color: inherit;
    text-decoration: none;
  }
  .archived {
    opacity: 0.6;
  }
</style>
