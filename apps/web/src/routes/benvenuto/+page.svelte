<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Welcome tutorial (improvement 11): what a bucket is, how buckets fill, then income, accounts, buckets and
     reminders. "Salta" creates the cash account and the recommended buckets. With ?rivedi=1 it only explains,
     without touching data. -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { STARTER_BUCKETS, formatCents, type User } from '@cashket/shared';
  import { post } from '$lib/api';
  import { app, errorMessage, setUser } from '$lib/state.svelte';
  import Logo from '$lib/Logo.svelte';
  import SectionIcon from '$lib/SectionIcon.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import MoneyField from '$lib/MoneyField.svelte';
  import Icon from '$lib/Icon.svelte';
  import { accountImg } from '$lib/accounts';

  const review = page.url.searchParams.has('rivedi');
  type Step = 'what' | 'fill' | 'income' | 'accounts' | 'buckets' | 'daily' | 'done';
  const STEPS: Step[] = review ? ['what', 'fill', 'daily'] : ['what', 'fill', 'income', 'accounts', 'buckets', 'daily', 'done'];
  let index = $state(0);
  const step = $derived(STEPS[index]);

  let error = $state('');
  let busy = $state(false);

  // ---------------------------------------------------------------- answers
  let incomeCents = $state<number | null>(null);
  let payday = $state<'start' | 'middle' | 'end'>('end');
  let checking = $state({ on: true, name: 'Conto corrente' });
  let card = $state({ on: false, name: 'Carta di credito' });
  let paypal = $state(false);
  let cash = $state(true);
  let buckets = $state(STARTER_BUCKETS.map((b) => ({ ...b, on: true })));
  let reminder = $state<number | null>(7);

  const percentSum = $derived(buckets.filter((b) => b.on && b.percent != null).reduce((t, b) => t + (b.percent ?? 0), 0));
  const share = (percent: number | null) =>
    incomeCents ? (percent == null ? Math.max(0, Math.round((incomeCents * (100 - percentSum)) / 100)) : Math.round((incomeCents * percent) / 100)) : null;

  function next() {
    error = '';
    if (index < STEPS.length - 1) index++;
    scrollTo({ top: 0 });
  }
  function back() {
    if (index > 0) index--;
  }

  async function finish(skip: boolean) {
    if (review) return goto('/profilo');
    busy = true;
    error = '';
    try {
      const user = skip
        ? await post<User>('/onboarding/skip')
        : await post<User>('/onboarding/complete', {
            // Salary at the end of the month pays for the next one: percentages use last month's income.
            percentBase: payday === 'end' ? 'previous' : 'current',
            monthlyIncomeCents: incomeCents,
            accounts: [
              ...(checking.on ? [{ name: checking.name.trim() || 'Conto corrente', kind: 'checking', settlesTo: null }] : []),
              ...(card.on ? [{ name: card.name.trim() || 'Carta di credito', kind: 'card', settlesTo: checking.on ? 0 : null }] : []),
              ...(paypal ? [{ name: 'PayPal', kind: 'paypal', settlesTo: null }] : []),
              ...(cash ? [{ name: 'Contanti', kind: 'cash', settlesTo: null }] : [])
            ],
            buckets: buckets.filter((b) => b.on).map((b) => ({ name: b.name, category: b.category, kind: b.kind, percent: b.percent, goalCents: null })),
            sessionReminderDays: reminder
          });
      setUser(user);
      await goto('/', { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  const REMINDERS: [number | null, string][] = [
    [null, 'Mai'],
    [3, 'Ogni 3 giorni'],
    [7, 'Ogni settimana'],
    [14, 'Ogni 2 settimane']
  ];
</script>

<svelte:head><title>Benvenuto · Cashket</title></svelte:head>

<main class="page">
  <header class="top">
    {#if index > 0}
      <button class="icon-btn" type="button" aria-label="Indietro" onclick={back}><Icon name="left" /></button>
    {:else}
      <span class="spacer"></span>
    {/if}
    <div class="segs" aria-label="Passo {index + 1} di {STEPS.length}">
      {#each STEPS as s, i (s)}<span class:on={i <= index}></span>{/each}
    </div>
    <button class="btn btn-ghost skip" type="button" disabled={busy} onclick={() => finish(true)}>{review ? 'Chiudi' : 'Salta'}</button>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if step === 'what'}
    <section class="slide">
      <Logo size={120} />
      <h1>Ciao{app.user ? `, ${app.user.name}` : ''}!</h1>
      <p class="lead">Cashket divide i soldi in <strong>bucket</strong>: secchi con uno scopo, come la spesa, le bollette o le vacanze.</p>
      <div class="buckets-demo">
        {#each STARTER_BUCKETS.slice(0, 4) as b (b.name)}
          <div class="demo"><CategoryIcon icon={{ kind: 'category', key: b.category }} size={52} /><span class="small">{b.name}</span></div>
        {/each}
      </div>
      <p class="muted">Ogni euro che entra finisce in un bucket. Ogni spesa esce da un bucket. Così sai sempre quanto puoi ancora spendere per ogni cosa.</p>
    </section>
  {:else if step === 'fill'}
    <section class="slide left">
      <h1>Come si riempiono</h1>
      <p class="lead">A inizio mese le entrate si dividono. Esempio con 2.000 € di stipendio:</p>
      <div class="card stack" style="gap: 12px">
        {#each [{ name: 'Casa', key: 'home', how: 'Fisso 700 €', cents: 70000 }, { name: 'Spesa', key: 'groceries', how: '15% delle entrate', cents: 30000 }, { name: 'Svago', key: 'leisure', how: '7% delle entrate', cents: 14000 }, { name: 'Risparmio', key: 'savings', how: 'Prende il resto', cents: 86000 }] as d (d.name)}
          <div class="fill-row">
            <CategoryIcon icon={{ kind: 'category', key: d.key as 'home' }} size={40} />
            <div style="flex: 1; min-width: 0">
              <p>{d.name} <span class="muted small">· {d.how}</span></p>
              <div class="bar"><span class="status-ok" style:width="{(d.cents / 200000) * 100}%"></span></div>
            </div>
            <strong>{formatCents(d.cents)}</strong>
          </div>
        {/each}
      </div>
      <p class="muted">
        <strong>Fisso</strong> per le cose che costano sempre uguale, <strong>percentuale</strong> per quelle che crescono con le entrate, e un bucket
        che prende <strong>il resto</strong>. A fine mese quello che avanza resta lì, va in un altro bucket o si azzera: lo decidi tu per ognuno.
      </p>
    </section>
  {:else if step === 'income'}
    <section class="slide left">
      <h1>Le tue entrate</h1>
      <p class="lead">Più o meno, quanto ti entra al mese? Serve solo a riempire subito i bucket: poi lo correggi in Entrate.</p>
      <div class="card stack">
        <MoneyField id="income" label="Entrate al mese (facoltativo)" bind:cents={incomeCents} />
        <div class="field">
          <span class="label" id="payday">Lo stipendio arriva</span>
          <div class="chips" role="group" aria-labelledby="payday">
            <button class="chip" type="button" aria-pressed={payday === 'start'} onclick={() => (payday = 'start')}>A inizio mese</button>
            <button class="chip" type="button" aria-pressed={payday === 'middle'} onclick={() => (payday = 'middle')}>A metà mese</button>
            <button class="chip" type="button" aria-pressed={payday === 'end'} onclick={() => (payday = 'end')}>A fine mese</button>
          </div>
          <p class="help">
            {payday === 'end' ? 'Lo stipendio di fine mese paga il mese dopo: i bucket useranno le entrate del mese precedente.' : 'I bucket useranno le entrate del mese in corso.'}
          </p>
        </div>
      </div>
    </section>
  {:else if step === 'accounts'}
    <section class="slide left">
      <h1>I tuoi conti</h1>
      <p class="lead">Da dove escono i soldi? Puoi aggiungerne altri dopo.</p>
      <div class="card stack" style="gap: 14px">
        <label class="toggle"><input type="checkbox" bind:checked={checking.on} /><img src={accountImg({ kind: 'checking' })} alt="" width="36" height="36" /><span>Conto corrente</span></label>
        {#if checking.on}<div class="field indent"><label for="checking-name">Nome</label><input id="checking-name" placeholder="Conto BPM" bind:value={checking.name} /></div>{/if}
        <label class="toggle"><input type="checkbox" bind:checked={card.on} /><img src={accountImg({ kind: 'card' })} alt="" width="36" height="36" /><span>Carta di credito</span></label>
        {#if card.on}
          <div class="field indent">
            <label for="card-name">Nome</label><input id="card-name" placeholder="Carta Nexi" bind:value={card.name} />
            {#if checking.on}<p class="help">Addebitata sul conto corrente: l'addebito mensile sarà un giroconto, non una spesa.</p>{/if}
          </div>
        {/if}
        <label class="toggle"><input type="checkbox" bind:checked={paypal} /><img src={accountImg({ kind: 'paypal' })} alt="" width="36" height="36" /><span>PayPal</span></label>
        <label class="toggle"><input type="checkbox" bind:checked={cash} /><img src={accountImg({ kind: 'cash' })} alt="" width="36" height="36" /><span>Contanti</span></label>
      </div>
    </section>
  {:else if step === 'buckets'}
    <section class="slide left">
      <h1>I tuoi bucket</h1>
      <p class="lead">Questi sono quelli consigliati. Togli quelli che non ti servono e cambia le percentuali: tutto si modifica anche dopo.</p>
      <div class="card">
        {#each buckets as b, i (b.name)}
          <div class="list-row" class:off={!b.on}>
            <input type="checkbox" aria-label="Usa {b.name}" bind:checked={buckets[i].on} />
            <CategoryIcon icon={{ kind: 'category', key: b.category }} size={40} />
            <div style="flex: 1; min-width: 0">
              <p>{b.name}</p>
              <p class="muted small">{b.kind === 'saving' ? 'Accumulo' : 'Spesa'}{share(b.percent) != null ? ` · ${formatCents(share(b.percent)!)}` : ''}</p>
            </div>
            {#if b.percent == null}
              <span class="muted small">il resto</span>
            {:else}
              <label class="pct">
                <input type="number" min="1" max="100" step="1" aria-label="Percentuale di {b.name}" bind:value={buckets[i].percent} disabled={!b.on} />%
              </label>
            {/if}
          </div>
        {/each}
      </div>
      <p class="help">
        Totale percentuali: {percentSum}%{percentSum > 100 ? ' — sopra il 100%: le entrate non bastano a coprirle.' : `, il resto (${100 - percentSum}%) va in Risparmio.`}
      </p>
    </section>
  {:else if step === 'daily'}
    <section class="slide left">
      <h1>Le spese di ogni giorno</h1>
      <div class="point"><SectionIcon section="queue" size={56} /><p><strong>Quando spendi</strong>, tocca il pulsante + e scrivi l'importo. Finisce nella coda, anche senza rete. Il bucket lo scegli dopo.</p></div>
      <div class="point"><SectionIcon section="session" size={56} /><p><strong>Quando vuoi</strong>, fai una sessione: carichi l'estratto conto (o arriva da solo dalla banca), Cashket abbina le tue spese ai movimenti e tu le metti nei bucket. Le regole imparano: la volta dopo fa quasi tutto da solo.</p></div>
      <div class="point"><SectionIcon section="trends" size={56} /><p><strong>A fine mese</strong> chiudi il mese: i residui passano al successivo secondo le regole di ogni bucket.</p></div>
      {#if !review}
        <div class="card field">
          <span class="label" id="reminder">Ricordami di fare una sessione</span>
          <div class="chips" role="group" aria-labelledby="reminder">
            {#each REMINDERS as [days, label] (label)}
              <button class="chip" type="button" aria-pressed={reminder === days} onclick={() => (reminder = days)}>{label}</button>
            {/each}
          </div>
          <p class="help">Le notifiche si attivano dal Profilo, sul telefono che vuoi.</p>
        </div>
      {/if}
    </section>
  {:else}
    <section class="slide">
      <Logo size={120} />
      <h1>Tutto pronto</h1>
      <p class="lead">
        Creo {[checking.on, card.on, paypal, cash].filter(Boolean).length} conti e {buckets.filter((b) => b.on).length} bucket{incomeCents
          ? `, e riempio i bucket di questo mese con ${formatCents(incomeCents)}`
          : ''}.
      </p>
      {#if incomeCents}<p class="muted">L'entrata si chiama «Stipendio (dal tutorial)»: quando arriva quella vera la trovi in Entrate e puoi cancellarla.</p>{/if}
    </section>
  {/if}

  <div class="actions">
    {#if index < STEPS.length - 1}
      <button class="btn btn-primary btn-block" type="button" onclick={next}>Avanti</button>
    {:else}
      <button class="btn btn-primary btn-block" type="button" disabled={busy} onclick={() => finish(false)}>{review ? 'Ho capito' : 'Inizia'}</button>
    {/if}
  </div>
</main>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(16px, var(--status-clear)) 0 12px;
  }
  .spacer {
    width: 48px;
  }
  .segs {
    flex: 1;
    display: flex;
    gap: 6px;
  }
  .segs span {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
  }
  .segs span.on {
    background: var(--accent);
  }
  .skip {
    min-height: 44px;
  }
  .slide {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    padding: 12px 0 24px;
  }
  .slide.left {
    align-items: stretch;
    text-align: left;
  }
  h1 {
    font-size: 28px;
    line-height: 34px;
    font-weight: 700;
  }
  .lead {
    font-size: 17px;
  }
  .buckets-demo {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .demo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .fill-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .fill-row .bar {
    margin-top: 6px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    font-size: 17px;
  }
  .toggle input,
  .list-row input[type='checkbox'] {
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: var(--accent);
    flex: none;
  }
  .indent {
    margin-left: 34px;
  }
  .off {
    opacity: 0.5;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pct input {
    width: 64px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: 12px;
    border: 1.5px solid var(--field);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: right;
  }
  .point {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    text-align: left;
  }
  .actions {
    position: sticky;
    bottom: 0;
    padding: 12px 0 max(16px, env(safe-area-inset-bottom));
    background: var(--bg);
  }
</style>
