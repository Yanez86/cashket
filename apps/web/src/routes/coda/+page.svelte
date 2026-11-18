<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The queue (docs/SPEC.md §5): expenses typed during the day, grouped by day, waiting for a session. -->
<script lang="ts">
  import { ACCOUNT_ICONS, formatCents, type Account, type Capture } from '@cashket/shared';
  import { get } from '$lib/api';
  import { app, errorMessage } from '$lib/state.svelte';
  import { queue } from '$lib/offline.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import SectionIcon from '$lib/SectionIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import Fab from '$lib/Fab.svelte';
  import { del } from '$lib/api';
  import { refreshQueue } from '$lib/offline.svelte';

  type Row = Pick<Capture, 'amountCents' | 'spentAt' | 'accountId' | 'note'> & { id: number | null; key: string };

  let captures = $state<Capture[]>([]);
  let accounts = $state<Account[]>([]);
  let error = $state('');

  $effect(() => {
    // Read again when the badge changes (an expense sent from this device, or after coming back online).
    void queue.count;
    get<Capture[]>('/captures').then((list) => (captures = list), (e) => (error = errorMessage(e)));
  });
  $effect(() => {
    get<Account[]>('/accounts').then((list) => (accounts = list), () => {});
  });

  const tz = app.user?.timezone ?? 'Europe/Rome';
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
  const dayLabel = (key: string) => {
    const today = dayKey(new Date().toISOString());
    const yesterday = dayKey(new Date(Date.now() - 864e5).toISOString());
    const label = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
    return key === today ? `Oggi · ${label}` : key === yesterday ? `Ieri · ${label}` : label;
  };
  const time = (iso: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));

  const rows = $derived<Row[]>([
    ...queue.pending.map((p) => ({ ...p, id: null, key: p.clientId })),
    ...captures.map((c) => ({ ...c, key: String(c.id) }))
  ]);
  const days = $derived.by(() => {
    const groups = new Map<string, Row[]>();
    for (const r of [...rows].sort((a, b) => b.spentAt.localeCompare(a.spentAt))) {
      const k = dayKey(r.spentAt);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()];
  });
  async function remove(id: number) {
    error = '';
    try {
      await del(`/captures/${id}`);
      captures = captures.filter((c) => c.id !== id);
      await refreshQueue();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const total = $derived(rows.reduce((t, r) => t + r.amountCents, 0));
  const account = (id: number | null) => accounts.find((a) => a.id === id);
  const since = $derived(
    app.user?.lastSessionAt
      ? `Ultima sessione ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(new Date(app.user.lastSessionAt))}`
      : 'Nessuna sessione ancora'
  );
</script>

<svelte:head><title>Coda · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Coda" subtitle="{rows.length} {rows.length === 1 ? 'spesa' : 'spese'} · {formatCents(total)}" section="queue" />
  <div class="stack" style="gap: 12px">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if !queue.online}<p class="notice">Sei offline: le spese nuove restano sul telefono e partono appena torna la rete.</p>{/if}

      <section class="card">
        <div class="session">
          <SectionIcon section="session" size={48} />
          <div>
            <p class="strong">Sessione di riconciliazione</p>
            <p class="muted small">{since}</p>
          </div>
        </div>
        <a class="btn btn-primary btn-block" href="/sessione" style="margin-top: 14px"><Icon name="upload" />Avvia sessione</a>
      </section>

    {#each days as [key, list] (key)}
      <section class="card day">
        <div class="day-head">
          <span>{dayLabel(key)}</span>
          <span>{formatCents(list.reduce((t, r) => t + r.amountCents, 0))}</span>
        </div>
        {#each list as r (r.key)}
          {@const a = account(r.accountId)}
          <Swipeable label="Elimina {r.note ?? 'spesa'}" disabled={!r.id} ondelete={() => r.id && remove(r.id)} background="var(--surface)">
          <svelte:element this={r.id ? 'a' : 'div'} class="list-row link" href={r.id ? `/coda/${r.id}` : undefined}>
            {#if a}
              <img src="/accounts/{ACCOUNT_ICONS[a.kind]}.svg" alt="" width="40" height="40" />
            {:else}
              <span class="blank" aria-hidden="true"><Icon name="tray" size={20} /></span>
            {/if}
            <div style="flex: 1; min-width: 0">
              <p>{r.note ?? 'Spesa'}</p>
              <p class="muted small">{a?.name ?? 'Conto non indicato'} · {time(r.spentAt)}{r.id ? '' : ' · sul telefono'}</p>
            </div>
            <strong>{formatCents(r.amountCents)}</strong>
          </svelte:element>
          </Swipeable>
        {/each}
      </section>
    {:else}
      <section class="card empty">
        <SectionIcon section="queue" size={72} />
        <p>La coda è vuota.</p>
        <p class="muted small">Quando spendi, tocca + e scrivi l'importo: il resto lo sistemi dopo.</p>
      </section>
    {/each}
  </div>
</main>

<Fab />

<style>
  .session {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .strong {
    font-weight: 600;
  }
  .day {
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .day-head {
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
    margin-bottom: 4px;
  }
  .link {
    color: inherit;
    text-decoration: none;
  }
  .blank {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--surface-2);
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    padding: 28px 20px;
  }
</style>
