<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Joining the household with an invite link. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { User } from '@cashket/shared';
  import { get, post } from '$lib/api';
  import { errorMessage, setUser } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const token = page.url.searchParams.get('token') ?? '';
  let valid = $state<boolean | null>(null);
  let name = $state('');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    try {
      const invite = await get<{ valid: boolean; email: string | null }>(`/invites/${encodeURIComponent(token)}`);
      valid = invite.valid;
      if (invite.email) email = invite.email;
    } catch {
      valid = false;
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUser(await post<User>('/register', { token, name, email, password, timezone }));
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Entra in Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Entra in Cashket" subtitle="Crea il tuo account" />
  {#if valid === false}
    <p class="notice">Questo invito non è valido o è scaduto. Chiedine uno nuovo a chi amministra Cashket.</p>
  {:else if valid}
    <form class="card stack" onsubmit={submit}>
      <div class="field">
        <label for="name">Nome</label>
        <input id="name" autocomplete="name" required bind:value={name} />
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" required bind:value={email} />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="new-password" minlength="10" required bind:value={password} />
        <p class="help">Almeno 10 caratteri.</p>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Crea account</button>
    </form>
  {/if}
</main>
