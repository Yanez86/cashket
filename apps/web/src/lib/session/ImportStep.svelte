<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 1: load the bank's CSV. The first time for an account the columns are mapped by hand from a
     preview; the mapping is saved and recognised by the column names next time (docs/SPEC.md §7.1). -->
<script lang="ts">
  import {
    applyMapping,
    detectDelimiter,
    formatCents,
    guessMapping,
    headerFingerprint,
    parseCsv,
    type Account,
    type ImportBatch,
    type ImportMapping,
    type ImportProfile
  } from '@cashket/shared';
  import { get, post } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import Picker from '$lib/Picker.svelte';
  import { accountImg } from '$lib/accounts';

  let { accounts, batches = $bindable(), onnext }: { accounts: Account[]; batches: ImportBatch[]; onnext: () => void } = $props();

  const importable = $derived(accounts.filter((a) => !a.archived && a.kind !== 'cash'));
  let accountId = $state<number | null>(null);
  let profiles = $state<ImportProfile[]>([]);
  let fileName = $state('');
  let fileSha = $state<string | null>(null);
  let table = $state<string[][]>([]);
  let mapping = $state<ImportMapping | null>(null);
  let fromProfile = $state(false);
  let editing = $state(false);
  let message = $state('');
  let error = $state('');
  let busy = $state(false);
  let rawText = '';

  $effect(() => {
    accountId ??= importable[0]?.id ?? null;
  });
  $effect(() => {
    get<ImportProfile[]>('/imports/profiles').then((p) => (profiles = p), () => {});
  });

  /** Bank files are often Windows-1252 rather than UTF-8. */
  function decode(buffer: ArrayBuffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  async function sha256(buffer: ArrayBuffer): Promise<string | null> {
    if (!crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pickMapping() {
    if (!table.length || accountId == null) return;
    const saved = profiles.find(
      (p) => p.accountId === accountId && p.headerFingerprint && table[p.mapping.headerRow] && headerFingerprint(table[p.mapping.headerRow]) === p.headerFingerprint
    );
    fromProfile = !!saved;
    editing = !saved;
    mapping = saved ? $state.snapshot(saved.mapping) : guessMapping(table, detectDelimiter(rawText));
  }

  async function onFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    message = '';
    error = '';
    const buffer = await file.arrayBuffer();
    rawText = decode(buffer);
    fileName = file.name;
    fileSha = await sha256(buffer);
    table = parseCsv(rawText);
    if (!table.length) {
      error = 'Il file è vuoto o non è un CSV.';
      mapping = null;
      return;
    }
    pickMapping();
  }

  $effect(() => {
    void accountId;
    pickMapping();
  });

  const result = $derived(mapping && table.length ? applyMapping(table, mapping) : null);
  const header = $derived(mapping ? (table[mapping.headerRow] ?? []) : []);
  const columns = $derived(header.map((h, i) => ({ i, label: h || `Colonna ${i + 1}` })));
  const colOptions = $derived(columns.map((c) => ({ value: c.i as number | null, label: c.label, sub: table[(mapping?.headerRow ?? 0) + 1]?.[c.i] ?? '' })));

  async function send() {
    if (!result?.rows.length || accountId == null || !mapping) return;
    busy = true;
    error = '';
    try {
      const batch = await post<ImportBatch>('/imports', {
        accountId,
        fileName,
        fileSha256: fileSha,
        rows: result.rows,
        profile: { headerFingerprint: headerFingerprint(header), mapping }
      });
      batches = [batch, ...batches];
      profiles = await get<ImportProfile[]>('/imports/profiles');
      message = `${batch.rowsNew} movimenti nuovi${batch.rowsSkipped ? `, ${batch.rowsSkipped} già importati e saltati` : ''}.`;
      table = [];
      mapping = null;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function undo(batch: ImportBatch) {
    if (!confirm(`Annullare l'import di ${batch.fileName ?? 'questo file'}? I suoi movimenti spariscono dalla sessione.`)) return;
    try {
      batches = await post<ImportBatch[]>(`/imports/${batch.id}/undo`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '';
  const when = (iso: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso.replace(' ', 'T')));
</script>

<div class="stack" style="gap: 12px">
  <p class="muted">
    Scarica i movimenti dall'home banking e dall'area della carta in formato CSV, poi caricali qui, un conto alla volta.
    I conti collegati in <a href="/profilo/connessioni">Connessioni</a> arrivano da soli.
  </p>

  {#if !importable.length}
    <p class="notice">Prima aggiungi i tuoi conti in <a href="/profilo/conti">Profilo › Conti</a>.</p>
  {:else}
    <section class="card stack" style="gap: 12px">
      <div class="field">
        <span class="label" id="account">Conto</span>
        <div class="chips" role="group" aria-labelledby="account">
          {#each importable as a (a.id)}
            <button class="chip" type="button" aria-pressed={accountId === a.id} onclick={() => (accountId = a.id)}>
              <img src={accountImg(a)} alt="" width="22" height="22" />{a.name}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <label for="file">File CSV</label>
        <input id="file" type="file" accept=".csv,text/csv,text/plain" onchange={onFile} />
        <p class="help">Excel? Aprilo e salvalo come CSV.</p>
      </div>

      {#if mapping && result}
        {#if fromProfile}
          <p class="state ok"><Icon name="check" size={18} stroke={2.5} />File riconosciuto: uso le colonne della volta scorsa.</p>
        {/if}
        <button class="btn btn-ghost" type="button" onclick={() => (editing = !editing)}>{editing ? 'Nascondi le colonne' : 'Cambia le colonne'}</button>

        {#if editing}
          <div class="grid2">
            <div class="field">
              <label for="header">Riga dei titoli</label>
              <input id="header" type="number" min="1" max={table.length} value={mapping.headerRow + 1} oninput={(e) => mapping && (mapping.headerRow = Math.max(0, Number(e.currentTarget.value) - 1))} />
            </div>
            <div class="field">
              <label for="dateformat">Formato data</label>
              <Picker
                id="dateformat"
                label="Formato data"
                options={[
                  { value: 'dd/mm/yyyy', label: '17/11/2026' },
                  { value: 'yyyy-mm-dd', label: '2026-11-17' },
                  { value: 'mm/dd/yyyy', label: '11/17/2026' }
                ]}
                value={mapping.dateFormat as string | null}
                onchange={(v) => mapping && v && (mapping.dateFormat = v as ImportMapping['dateFormat'])} />
            </div>
            <div class="field">
              <label for="datecol">Data</label>
              <Picker id="datecol" label="Colonna della data" options={colOptions} value={mapping.dateColumn as number | null} onchange={(v) => mapping && v != null && (mapping.dateColumn = v)} />
            </div>
            <div class="field">
              <label for="desccol">Descrizione</label>
              <Picker id="desccol" label="Colonna della descrizione" options={colOptions} value={mapping.descriptionColumns[0] as number | null} onchange={(v) => mapping && v != null && (mapping.descriptionColumns = [v, ...mapping.descriptionColumns.slice(1)])} />
            </div>
          </div>
          <div class="field">
            <span class="label" id="amountmode">Importo</span>
            <div class="chips" role="group" aria-labelledby="amountmode">
              <button class="chip" type="button" aria-pressed={mapping.amount.mode === 'single'} onclick={() => mapping && (mapping.amount = { mode: 'single', column: header.length - 1, invert: false })}>Una colonna</button>
              <button class="chip" type="button" aria-pressed={mapping.amount.mode === 'split'} onclick={() => mapping && (mapping.amount = { mode: 'split', debitColumn: Math.max(0, header.length - 2), creditColumn: header.length - 1 })}>Dare e Avere</button>
            </div>
          </div>
          {#if mapping.amount.mode === 'single'}
            <div class="grid2">
              <div class="field">
                <label for="amountcol">Colonna</label>
                <Picker id="amountcol" label="Colonna dell'importo" options={colOptions} value={mapping.amount.column as number | null} onchange={(v) => mapping && v != null && (mapping.amount.mode === 'single' && (mapping.amount.column = v))} />
              </div>
              <label class="check">
                <input type="checkbox" bind:checked={mapping.amount.invert} />
                <span>Le spese sono positive <span class="muted small">(comune negli estratti carta)</span></span>
              </label>
            </div>
          {:else}
            <div class="grid2">
              <div class="field">
                <label for="debit">Dare (uscite)</label>
                <Picker id="debit" label="Colonna Dare" options={colOptions} value={mapping.amount.debitColumn as number | null} onchange={(v) => mapping && v != null && (mapping.amount.mode === 'split' && (mapping.amount.debitColumn = v))} />
              </div>
              <div class="field">
                <label for="credit">Avere (entrate)</label>
                <Picker id="credit" label="Colonna Avere" options={colOptions} value={mapping.amount.creditColumn as number | null} onchange={(v) => mapping && v != null && (mapping.amount.mode === 'split' && (mapping.amount.creditColumn = v))} />
              </div>
            </div>
          {/if}
        {/if}

        <div class="preview">
          {#each result.rows.slice(0, 5) as r, i (i)}
            <div class="list-row">
              <div style="flex: 1; min-width: 0">
                <p class="ellipsis">{r.description}</p>
                <p class="muted small">{r.date}</p>
              </div>
              <strong class={r.amountCents > 0 ? 'status-ink-ok' : ''}>{formatCents(r.amountCents)}</strong>
            </div>
          {/each}
        </div>
        <p class="muted small">
          {result.rows.length} movimenti letti{#if result.errors.length}, {result.errors.length} righe saltate (es. riga {result.errors[0].line}: {result.errors[0].message}){/if}.
        </p>
        <button class="btn btn-primary btn-block" type="button" disabled={busy || !result.rows.length} onclick={send}>
          <Icon name="upload" />Importa {result.rows.length} movimenti in {accountName(accountId)}
        </button>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if message}<p class="notice" role="status">{message}</p>{/if}
    </section>
  {/if}

  {#if batches.length}
    <section class="card">
      <h2 class="section-title">Ultimi import</h2>
      {#each batches.slice(0, 5) as b (b.id)}
        <div class="list-row" class:undone={b.undone}>
          <div style="flex: 1; min-width: 0">
            <p class="ellipsis">{b.fileName ?? 'Import'}</p>
            <p class="muted small">{accountName(b.accountId)} · {when(b.createdAt)} · {b.rowsNew} nuovi{b.undone ? ' · annullato' : ''}</p>
          </div>
          {#if !b.undone}<button class="btn btn-ghost" type="button" onclick={() => undo(b)}>Annulla</button>{/if}
        </div>
      {/each}
    </section>
  {/if}

  <button class="btn btn-primary btn-block" type="button" onclick={onnext}>Continua · Abbina</button>
</div>

<style>
  .grid2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: end;
  }
  .state {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 15px;
    font-weight: 600;
  }
  .ok {
    color: var(--ok-ink);
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 48px;
  }
  .check input {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .undone {
    opacity: 0.6;
  }
</style>
