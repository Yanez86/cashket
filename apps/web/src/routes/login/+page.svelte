<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { User } from '@cashket/shared';
  import { post } from '$lib/api';
  import { errorMessage, setUser } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      // The layout sends a signed-in person on to ?next= (or the buckets).
      setUser(await post<User>('/auth/login', { email, password }));
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Accedi · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Accedi" />
  <form class="card stack" onsubmit={submit}>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" required bind:value={email} />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required bind:value={password} />
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Accedi</button>
  </form>
  <p class="muted small" style="margin-top: 16px">Per entrare serve un invito da chi amministra Cashket. Password dimenticata? Chiedigli un link per sceglierne una nuova.</p>
</main>
