<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- First start: the person who installs Cashket becomes its administrator. -->
<script lang="ts">
  import type { User } from '@cashket/shared';
  import { post } from '$lib/api';
  import { app, errorMessage, setUser } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const user = await post<User>('/setup', { name, email, password, timezone });
      if (app.status) app.status.setupRequired = false;
      setUser(user);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Benvenuto · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Benvenuto" subtitle="Crea l'account amministratore" />
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
    <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Inizia</button>
  </form>
</main>
