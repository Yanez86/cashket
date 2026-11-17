<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- For administrators: who is in the household, invites, and one-time links for forgotten passwords.
     Nobody here sees anyone else's money. -->
<script lang="ts">
  import type { Invite, User } from '@cashket/shared';
  import { del, get, patch, post } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Icon from '$lib/Icon.svelte';

  let users = $state<User[]>([]);
  let invites = $state<Invite[]>([]);
  let email = $state('');
  let link = $state('');
  let error = $state('');

  $effect(() => {
    get<User[]>('/admin/users').then((list) => (users = list), (e) => (error = errorMessage(e)));
    get<Invite[]>('/admin/invites').then((list) => (invites = list));
  });

  async function run(fn: () => Promise<void>) {
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const invite = (event: SubmitEvent) => {
    event.preventDefault();
    return run(async () => {
      const created = await post<Invite>('/admin/invites', { email: email.trim() || null });
      invites = [created, ...invites];
      link = created.url;
      email = '';
    });
  };

  const update = (u: User, change: Partial<Pick<User, 'active' | 'role'>>) =>
    run(async () => {
      const updated = await patch<User>(`/admin/users/${u.id}`, change);
      users = users.map((x) => (x.id === u.id ? updated : x));
    });

  const resetLink = (u: User) => run(async () => void (link = (await post<{ url: string }>(`/admin/users/${u.id}/reset`)).url));

  const revoke = (i: Invite) =>
    run(async () => {
      await del(`/admin/invites/${i.token}`);
      invites = invites.filter((x) => x.token !== i.token);
    });
</script>

<svelte:head><title>Utenti · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Utenti" section="profile" />
  <div class="stack">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if link}
      <div class="notice stack" style="gap: 8px">
        <p>Link da mandare (valido una volta sola):</p>
        <input class="input" readonly value={link} onfocus={(e) => e.currentTarget.select()} aria-label="Link" />
        <button class="btn btn-ghost" type="button" onclick={() => navigator.clipboard?.writeText(link)}>Copia</button>
      </div>
    {/if}

    <section class="card">
      {#each users as u (u.id)}
        <div class="list-row">
          <div style="flex: 1; min-width: 0">
            <p>{u.name}{u.id === app.user?.id ? ' (tu)' : ''}</p>
            <p class="muted small">{u.email} · {u.role === 'admin' ? 'amministratore' : 'membro'}{u.active ? '' : ' · disattivato'}</p>
          </div>
          {#if u.id !== app.user?.id}
            <button class="btn btn-ghost" type="button" onclick={() => resetLink(u)}>Password</button>
            <button class="btn btn-ghost" type="button" onclick={() => update(u, { active: !u.active })}>{u.active ? 'Disattiva' : 'Riattiva'}</button>
          {/if}
        </div>
      {/each}
    </section>

    <form class="card stack" onsubmit={invite}>
      <h2 class="section-title">Invita qualcuno</h2>
      <div class="field">
        <label for="email">Email (facoltativa)</label>
        <input id="email" type="email" bind:value={email} />
        <p class="help">Con l'email, solo quella persona potrà usare l'invito. Vale 7 giorni.</p>
      </div>
      <button class="btn btn-primary btn-block" type="submit"><Icon name="plus" />Crea invito</button>
    </form>

    {#if invites.length}
      <section class="card">
        <h2 class="section-title">Inviti in attesa</h2>
        {#each invites as i (i.token)}
          <div class="list-row">
            <div style="flex: 1; min-width: 0">
              <p>{i.email ?? 'Chiunque abbia il link'}</p>
              <p class="muted small">scade il {new Date(i.expiresAt).toLocaleDateString('it-IT')}</p>
            </div>
            <button class="btn btn-ghost" type="button" onclick={() => (link = i.url)}>Link</button>
            <button class="icon-btn plain" type="button" aria-label="Annulla invito" onclick={() => revoke(i)}><Icon name="trash" size={20} /></button>
          </div>
        {/each}
      </section>
    {/if}
  </div>
</main>
