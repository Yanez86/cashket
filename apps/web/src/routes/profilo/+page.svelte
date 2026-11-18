<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { patch, post } from '$lib/api';
  import type { User } from '@cashket/shared';
  import { app, errorMessage, setUser } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Picker from '$lib/Picker.svelte';
  import { clearApiCache } from '$lib/offline.svelte';
  import { pushSupport, subscribe, unsubscribe, currentSubscription } from '$lib/push';
  import { onMount } from 'svelte';
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

  const REMINDERS: [number | null, string][] = [
    [null, 'Mai'],
    [3, 'Ogni 3 giorni'],
    [7, 'Ogni settimana'],
    [14, 'Ogni 2 settimane']
  ];
  const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h as number | null, label: `${String(h).padStart(2, '0')}:00` }));
  let support = $state<ReturnType<typeof pushSupport>>('unsupported');
  let pushOn = $state(false);
  let pushMessage = $state('');

  onMount(async () => {
    support = pushSupport();
    if (support === 'ok') pushOn = Notification.permission === 'granted' && !!(await currentSubscription().catch(() => null));
  });

  async function togglePush() {
    pushMessage = '';
    try {
      if (pushOn) {
        await unsubscribe();
        pushOn = false;
      } else {
        const permission = await subscribe();
        pushOn = permission === 'granted';
        if (!pushOn) pushMessage = 'Permesso negato: abilita le notifiche per Cashket nelle impostazioni del telefono.';
      }
    } catch (e) {
      pushMessage = errorMessage(e);
    }
  }

  async function testPush() {
    pushMessage = '';
    try {
      const { delivered } = await post<{ delivered: number }>('/push/test');
      pushMessage = delivered ? 'Notifica inviata.' : 'Nessun dispositivo ha ricevuto la notifica.';
    } catch (e) {
      pushMessage = errorMessage(e);
    }
  }

  async function logout() {
    await post('/auth/logout').catch(() => {});
    await clearApiCache();
    setUser(null);
    await goto('/login');
  }

  const links = $derived([
    { href: '/profilo/bucket', label: 'Bucket', help: 'Regole di riempimento e di fine mese' },
    { href: '/profilo/conti', label: 'Conti', help: 'Conto corrente, carte, PayPal, contanti' },
    { href: '/entrate', label: 'Entrate', help: 'Stipendio e altre entrate del mese' },
    { href: '/profilo/connessioni', label: 'Connessioni', help: 'Movimenti dalla banca in automatico (Enable Banking)' },
    ...(app.user?.role === 'admin' ? [{ href: '/profilo/utenti', label: 'Utenti', help: 'Inviti e accessi della casa' }] : []),
    { href: '/benvenuto?rivedi=1', label: 'Rivedi il tutorial', help: 'Come funzionano bucket, coda e sessione' },
    { href: '/profilo/info', label: 'Informazioni su Cashket', help: "Cos'è, open source, self-hosted, novità" }
  ]);

  // Improvement 12: empty one's data and start again from the tutorial.
  let resetOpen = $state(false);
  let resetPassword = $state('');
  let resetWord = $state('');
  let resetError = $state('');
  async function reset(event: SubmitEvent) {
    event.preventDefault();
    resetError = '';
    try {
      setUser(await post<User>('/me/reset', { password: resetPassword, confirm: resetWord.trim().toUpperCase() }));
      await clearApiCache();
      await goto('/benvenuto');
    } catch (e) {
      resetError = errorMessage(e);
    }
  }
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

    <section class="card stack">
      <h2 class="section-title">Promemoria della sessione</h2>
      <div class="field">
        <span class="label" id="reminder">Ricordami di fare una sessione</span>
        <div class="chips" role="group" aria-labelledby="reminder">
          {#each REMINDERS as [days, label] (label)}
            <button class="chip" type="button" aria-pressed={app.user?.sessionReminderDays === days} onclick={() => save({ sessionReminderDays: days })}>{label}</button>
          {/each}
        </div>
        <p class="help">Solo quando ci sono spese in coda. Il numero sull'icona dell'app mostra sempre quante sono.</p>
      </div>
      {#if app.user?.sessionReminderDays}
        <div class="field">
          <label for="hour">Dalle ore</label>
          <Picker
            id="hour"
            label="Dalle ore"
            options={HOURS}
            value={app.user.reminderHour as number | null}
            onchange={(h) => h != null && save({ reminderHour: h })} />
        </div>
        {#if support === 'ok'}
          <div class="row">
            <button class="btn" type="button" onclick={togglePush}>{pushOn ? 'Disattiva le notifiche su questo telefono' : 'Attiva le notifiche su questo telefono'}</button>
            {#if pushOn}<button class="btn btn-ghost" type="button" onclick={testPush}>Prova</button>{/if}
          </div>
        {:else if support === 'ios-not-installed'}
          <p class="help">Su iPhone le notifiche arrivano solo con Cashket aggiunto alla schermata Home: Condividi › Aggiungi a Home, poi aprilo da lì.</p>
        {:else if support === 'insecure'}
          <p class="help">Le notifiche servono un indirizzo https://, per esempio quello del tunnel Cloudflare.</p>
        {:else}
          <p class="help">Questo browser non supporta le notifiche.</p>
        {/if}
        {#if pushMessage}<p class="notice" role="status">{pushMessage}</p>{/if}
      {/if}
    </section>

    <button class="btn btn-danger btn-block" type="button" onclick={logout}>Esci</button>

    <section class="card stack danger-zone">
      {#if !resetOpen}
        <button class="btn btn-ghost danger-text" type="button" onclick={() => (resetOpen = true)}>Azzera l'account</button>
      {:else}
        <form class="stack" style="gap: 12px" onsubmit={reset}>
          <h2 class="section-title danger-text">Azzera l'account</h2>
          <p class="help">
            Cancella conti, bucket, entrate, spese in coda, movimenti, regole, import e collegamenti con la banca. Restano il tuo accesso e le
            impostazioni. Poi ricomincia il tutorial. <strong>Non si può annullare.</strong>
          </p>
          <div class="field">
            <label for="reset-password">Password</label>
            <input id="reset-password" type="password" autocomplete="current-password" required bind:value={resetPassword} />
          </div>
          <div class="field">
            <label for="reset-word">Scrivi AZZERA per confermare</label>
            <input id="reset-word" autocomplete="off" autocapitalize="characters" required bind:value={resetWord} />
          </div>
          {#if resetError}<p class="error" role="alert">{resetError}</p>{/if}
          <button class="btn btn-danger btn-block" type="submit" disabled={resetWord.trim().toUpperCase() !== 'AZZERA' || !resetPassword}>Azzera tutto</button>
          <button class="btn btn-ghost" type="button" onclick={() => (resetOpen = false)}>Annulla</button>
        </form>
      {/if}
    </section>
    <p class="muted small" style="text-align: center">Cashket v{app.status?.version}</p>
  </div>
</main>

<style>
  .danger-text {
    color: var(--danger);
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .link {
    color: inherit;
    text-decoration: none;
  }
</style>
