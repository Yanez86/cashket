<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The other half of the one-time link an administrator hands out. -->
<script lang="ts">
  import { page } from '$app/state';
  import { post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const token = page.url.searchParams.get('token') ?? '';
  let password = $state('');
  let error = $state('');
  let done = $state(false);
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await post('/auth/reset', { token, password });
      done = true;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Nuova password · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Nuova password" />
  {#if done}
    <p class="notice">Fatto. Ora puoi <a href="/login">accedere</a> con la nuova password.</p>
  {:else}
    <form class="card stack" onsubmit={submit}>
      <div class="field">
        <label for="password">Nuova password</label>
        <input id="password" type="password" autocomplete="new-password" minlength="10" required bind:value={password} />
        <p class="help">Almeno 10 caratteri. Ti disconnette da tutti i dispositivi.</p>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Salva</button>
    </form>
  {/if}
</main>
