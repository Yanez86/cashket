<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Buckets home (docs/SPEC.md §9.2). For now it shows the ready-made categories; balances, the queue link
     and the bucket cards come with phase 1–2 of the roadmap. -->
<script lang="ts">
  import { CATEGORIES } from '@cashket/shared';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';

  const month = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date());
</script>

<main class="page">
  <TopBar title="Cashket" subtitle={month}>
    {#snippet actions()}
      <a class="icon-btn primary" href="/nuova" aria-label="Aggiungi spesa"><Icon name="plus" /></a>
    {/snippet}
  </TopBar>
  <div class="stack">
    <p class="notice">Cashket è in costruzione: qui arriveranno i tuoi bucket.</p>
    <section class="card">
      <h2 class="section-title">Categorie</h2>
      <ul class="grid">
        {#each CATEGORIES as c (c.key)}
          <li><CategoryIcon icon={{ kind: 'category', key: c.key }} size={56} /><span class="small">{c.label}</span></li>
        {/each}
        <li><CategoryIcon icon={{ kind: 'custom', letter: 'G', color: '#4E9E45' }} size={56} /><span class="small">Personalizzata</span></li>
      </ul>
    </section>
  </div>
</main>

<style>
  .primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .grid {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px 8px;
  }
  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
</style>
