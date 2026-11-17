<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { patch, post } from '$lib/api';
  import type { User } from '@cashket/shared';
  import { app, errorMessage, setUser } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';

  let error = $state('');
  const THEMES: [User['theme'], string][] = [
    ['system', 'Automatico'],
    ['light', 'Chiaro'],
    ['dark', 'Scuro']
  ];

  async function save(change: Partial<User>) {
    error = '';
    try {
      setUser(await patch<User>('/me', change));
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function logout() {
    await post('/auth/logout').catch(() => {});
    setUser(null);
    await goto('/login');
  }

  const links = $derived([
    { href: '/profilo/bucket', label: 'Bucket', help: 'Regole di riempimento e di fine mese' },
    { href: '/profilo/conti', label: 'Conti', help: 'Conto corrente, carte, PayPal, contanti' },
    { href: '/entrate', label: 'Entrate', help: 'Stipendio e altre entrate del mese' },
    ...(app.user?.role === 'admin' ? [{ href: '/profilo/utenti', label: 'Utenti', help: 'Inviti e accessi della casa' }] : [])
  ]);
</script>

<svelte:head><title>Profilo · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Profilo" subtitle={app.user?.name} section="profile" />
  <div class="stack">
    <nav class="card" aria-label="Impostazioni">
      {#each links as link (link.href)}
        <a class="list-row link" href={link.href}>
          <div style="flex: 1">
            <p>{link.label}</p>
            <p class="muted small">{link.help}</p>
          </div>
          <Icon name="chevron" size={20} />
        </a>
      {/each}
    </nav>

    <section class="card stack">
      <div class="field">
        <span class="label" id="percent-base">Bucket a percentuale calcolati sulle entrate del</span>
        <div class="chips" role="group" aria-labelledby="percent-base">
          <button class="chip" type="button" aria-pressed={app.user?.percentBase === 'previous'} onclick={() => save({ percentBase: 'previous' })}>Mese precedente</button>
          <button class="chip" type="button" aria-pressed={app.user?.percentBase === 'current'} onclick={() => save({ percentBase: 'current' })}>Mese in corso</button>
        </div>
        <p class="help">Il mese precedente è più stabile se lo stipendio arriva a fine mese.</p>
      </div>
      <div class="field">
        <span class="label" id="theme">Tema</span>
        <div class="chips" role="group" aria-labelledby="theme">
          {#each THEMES as [value, label] (value)}
            <button class="chip" type="button" aria-pressed={app.user?.theme === value} onclick={() => save({ theme: value })}>{label}</button>
          {/each}
        </div>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </section>

    <button class="btn btn-danger btn-block" type="button" onclick={logout}>Esci</button>
    <p class="muted small" style="text-align: center">Cashket v{app.status?.version}</p>
  </div>
</main>

<style>
  .link {
    color: inherit;
    text-decoration: none;
  }
</style>
