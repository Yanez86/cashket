<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Informazioni su Cashket (improvement 8): what it is, how it works, why open source and self-hosted,
     version and what changed. -->
<script lang="ts">
  import { CHANGELOG } from '@cashket/shared';
  import { app } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import Logo from '$lib/Logo.svelte';
  import SectionIcon from '$lib/SectionIcon.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
</script>

<svelte:head><title>Informazioni · Cashket</title></svelte:head>

<main class="page">
  <TopBar title="Cashket" subtitle="Versione {app.status?.version}" />
  <div class="stack">
    <section class="card hero">
      <Logo size={88} />
      <p>Il budget di casa a <strong>bucket</strong>: ogni euro che entra ha un posto, ogni spesa sa da quale posto esce.</p>
    </section>

    <section class="card stack" style="gap: 14px">
      <h2 class="section-title">Come funziona</h2>
      <div class="point">
        <CategoryIcon icon={{ kind: 'category', key: 'savings' }} size={48} />
        <p><strong>I bucket.</strong> A inizio mese le entrate si dividono nei bucket: un importo fisso, una percentuale o il resto. Quello che avanza passa al mese dopo, o dove decidi tu.</p>
      </div>
      <div class="point">
        <SectionIcon section="queue" size={48} />
        <p><strong>La coda.</strong> Quando spendi, tocchi + e scrivi l'importo: due tocchi, anche senza rete. Il bucket lo scegli dopo.</p>
      </div>
      <div class="point">
        <SectionIcon section="session" size={48} />
        <p><strong>La sessione.</strong> Quando vuoi, carichi l'estratto conto (o arriva da solo): Cashket abbina le tue spese ai movimenti della banca e impara dove metterle.</p>
      </div>
      <a class="btn btn-ghost" href="/benvenuto?rivedi=1">Rivedi il tutorial</a>
    </section>

    <section class="card stack" style="gap: 10px">
      <h2 class="section-title">Open source</h2>
      <p>
        Il codice di Cashket è pubblico, con licenza <strong>AGPL-3.0</strong>. Chiunque può leggerlo e verificare cosa fa con i dati, correggerlo,
        migliorarlo o installarlo per sé. Nessuna parte nascosta, nessuna dipendenza da un'azienda che un giorno può chiudere o cambiare le regole.
      </p>
      <a class="btn btn-ghost" href="https://github.com/Yanez86/cashket" target="_blank" rel="noopener">Il codice su GitHub</a>
    </section>

    <section class="card stack" style="gap: 10px">
      <h2 class="section-title">Self-hosted</h2>
      <p>
        Cashket gira sul <strong>tuo</strong> server: i tuoi movimenti restano a casa tua. Niente abbonamenti, niente pubblicità, nessuno che li legge,
        li analizza o li vende. Ogni persona della casa vede solo i propri soldi.
      </p>
      <p class="muted small">
        Unica eccezione, solo se la attivi: il collegamento con la banca passa da Enable Banking, un servizio autorizzato PSD2, in sola lettura e con
        il consenso che dai tu alla banca.
      </p>
    </section>

    <section class="card stack" style="gap: 12px">
      <h2 class="section-title">Novità</h2>
      {#each CHANGELOG as release (release.version)}
        <div>
          <p><strong>{release.version}</strong> <span class="muted small">· {new Date(release.date).toLocaleDateString('it-IT')}</span></p>
          <ul>
            {#each release.items as item (item)}<li>{item}</li>{/each}
          </ul>
        </div>
      {/each}
    </section>

    <p class="muted small" style="text-align: center">Cashket v{app.status?.version} · Happy Squid inc</p>
  </div>
</main>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }
  .point {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  ul {
    margin: 6px 0 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 15px;
  }
</style>
