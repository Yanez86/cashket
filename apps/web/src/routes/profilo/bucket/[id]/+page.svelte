<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Create or edit a bucket: icon, kind, how it fills, and what happens at the end of the month (docs/SPEC.md §4). -->
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { CATEGORIES, CUSTOM_COLORS, type Bucket, type BucketIcon, type BucketInput } from '@cashket/shared';
  import { get, post, put } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import CategoryIcon from '$lib/CategoryIcon.svelte';
  import MoneyField from '$lib/MoneyField.svelte';
  import Picker from '$lib/Picker.svelte';

  const isNew = page.params.id === 'nuovo';
  const id = isNew ? null : Number(page.params.id);

  let loaded = $state(false);
  let others = $state<Bucket[]>([]);
  let archived = $state(false);
  let error = $state('');
  let busy = $state(false);

  // The form, flattened so every choice keeps its value while another is selected.
  let name = $state('');
  let iconKind = $state<'category' | 'custom'>('category');
  let categoryKey = $state<string>('groceries');
  let customColor = $state<string>(CUSTOM_COLORS[0]);
  let kind = $state<'spend' | 'saving'>('spend');
  let fillType = $state<'fixed' | 'percent' | 'remainder'>('fixed');
  let amountCents = $state<number | null>(null);
  let percent = $state<number | null>(10);
  let goalCents = $state<number | null>(null);
  let leftover = $state<'carry' | 'move' | 'reset'>('carry');
  let leftoverTo = $state<number | null>(null);
  let leftoverPercent = $state<number | null>(100);
  let overspend = $state<'carry' | 'cover'>('carry');
  let overspendFrom = $state<number | null>(null);

  $effect(() => {
    get<Bucket[]>('/buckets')
      .then((list) => {
        others = list.filter((b) => b.id !== id && !b.archived);
        const b = list.find((x) => x.id === id);
        if (b) {
          name = b.name;
          archived = b.archived;
          if (b.icon.kind === 'category') categoryKey = b.icon.key;
          else {
            iconKind = 'custom';
            customColor = b.icon.color;
          }
          kind = b.kind;
          fillType = b.fill.type;
          if (b.fill.type === 'fixed') amountCents = b.fill.amountCents;
          if (b.fill.type === 'percent') percent = b.fill.percent;
          goalCents = b.goalCents;
          leftover = b.leftover.type;
          if (b.leftover.type === 'move') {
            leftoverTo = b.leftover.toBucketId;
            leftoverPercent = b.leftover.percent;
          }
          overspend = b.overspend.type;
          if (b.overspend.type === 'cover') overspendFrom = b.overspend.fromBucketId;
        }
        const saving = others.find((o) => o.fill.type === 'remainder') ?? others[0];
        leftoverTo ??= saving?.id ?? null;
        overspendFrom ??= saving?.id ?? null;
        loaded = true;
      })
      .catch((e) => (error = errorMessage(e)));
  });

  const targetOptions = $derived(others.map((o) => ({ value: o.id as number | null, label: o.name, icon: o.icon })));
  const remainderTaken = $derived(others.some((o) => o.fill.type === 'remainder'));
  const letter = $derived(name.trim().slice(0, 1).toUpperCase() || '?');
  const icon = $derived<BucketIcon>(
    iconKind === 'category' ? { kind: 'category', key: categoryKey as never } : { kind: 'custom', letter, color: customColor }
  );

  function input(): BucketInput | null {
    if (fillType === 'fixed' && amountCents == null) return null;
    if (fillType === 'percent' && !percent) return null;
    if (leftover === 'move' && (!leftoverTo || !leftoverPercent)) return null;
    if (overspend === 'cover' && !overspendFrom) return null;
    return {
      name: name.trim(),
      icon,
      kind,
      fill: fillType === 'fixed' ? { type: 'fixed', amountCents: amountCents! } : fillType === 'percent' ? { type: 'percent', percent: percent! } : { type: 'remainder' },
      goalCents: kind === 'saving' ? goalCents : null,
      leftover: leftover === 'move' ? { type: 'move', toBucketId: leftoverTo!, percent: leftoverPercent! } : { type: leftover },
      overspend: overspend === 'cover' ? { type: 'cover', fromBucketId: overspendFrom! } : { type: 'carry' }
    };
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const body = input();
    if (!body) {
      error = 'Completa i campi del riempimento e delle regole di fine mese.';
      return;
    }
    busy = true;
    error = '';
    try {
      if (isNew) await post<Bucket>('/buckets', body);
      else await put<Bucket>(`/buckets/${id}`, body);
      await goto('/profilo/bucket');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function toggleArchive() {
    if (!archived && !confirm(`Archiviare «${name}»? La storia resta, ma non riceverà più soldi.`)) return;
    try {
      archived = (await post<Bucket>(`/buckets/${id}/archive`, { archived: !archived })).archived;
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>{isNew ? 'Nuovo bucket' : name} · Cashket</title></svelte:head>

<main class="page">
  <TopBar title={isNew ? 'Nuovo bucket' : 'Modifica bucket'} subtitle={name} section="profile" />
  {#if loaded}
    <form class="stack" onsubmit={save}>
      <section class="card stack">
        <div class="name-row">
          <CategoryIcon {icon} size={56} />
          <div class="field" style="flex: 1">
            <label for="name">Nome</label>
            <input id="name" required maxlength="100" bind:value={name} />
          </div>
        </div>

        <div class="field">
          <span class="label" id="icon">Icona</span>
          <div class="icons" role="group" aria-labelledby="icon">
            {#each CATEGORIES as c (c.key)}
              <button
                type="button"
                class="pick"
                aria-label={c.label}
                aria-pressed={iconKind === 'category' && categoryKey === c.key}
                onclick={() => {
                  iconKind = 'category';
                  categoryKey = c.key;
                }}><CategoryIcon icon={{ kind: 'category', key: c.key }} size={44} /></button>
            {/each}
            <button type="button" class="pick" aria-label="Personalizzata" aria-pressed={iconKind === 'custom'} onclick={() => (iconKind = 'custom')}>
              <CategoryIcon icon={{ kind: 'custom', letter, color: customColor }} size={44} />
            </button>
          </div>
        </div>

        {#if iconKind === 'custom'}
          <div class="field">
            <span class="label" id="color">Colore</span>
            <div class="swatches" role="group" aria-labelledby="color">
              {#each CUSTOM_COLORS as c (c)}
                <button type="button" class="swatch" style:background={c} aria-label="Colore {c}" aria-pressed={customColor === c} onclick={() => (customColor = c)}></button>
              {/each}
            </div>
            <p class="help">L'etichetta mostra l'iniziale del nome.</p>
          </div>
        {/if}
      </section>

      <section class="card stack">
        <div class="field">
          <span class="label" id="kind">Tipo</span>
          <div class="chips" role="group" aria-labelledby="kind">
            <button class="chip" type="button" aria-pressed={kind === 'spend'} onclick={() => (kind = 'spend')}>Spesa</button>
            <button class="chip" type="button" aria-pressed={kind === 'saving'} onclick={() => (kind = 'saving')}>Accumulo</button>
          </div>
          <p class="help">{kind === 'spend' ? 'Si ricarica ogni mese.' : 'Non si azzera: cresce fino all\'obiettivo.'}</p>
        </div>

        <div class="field">
          <span class="label" id="fill">Ogni mese riceve</span>
          <div class="chips" role="group" aria-labelledby="fill">
            <button class="chip" type="button" aria-pressed={fillType === 'fixed'} onclick={() => (fillType = 'fixed')}>Un importo fisso</button>
            <button class="chip" type="button" aria-pressed={fillType === 'percent'} onclick={() => (fillType = 'percent')}>Una percentuale</button>
            <button class="chip" type="button" aria-pressed={fillType === 'remainder'} disabled={remainderTaken && fillType !== 'remainder'} onclick={() => (fillType = 'remainder')}>Il resto</button>
          </div>
          {#if remainderTaken && fillType !== 'remainder'}<p class="help">«Il resto» è già di un altro bucket.</p>{/if}
        </div>
        {#if fillType === 'fixed'}
          <MoneyField id="amount" label="Importo al mese" bind:cents={amountCents} required />
        {:else if fillType === 'percent'}
          <div class="field">
            <label for="percent">Percentuale delle entrate base</label>
            <input id="percent" type="number" min="0.01" max="100" step="0.01" required bind:value={percent} />
          </div>
        {:else}
          <p class="help">Prende quello che avanza dopo i bucket fissi e a percentuale.</p>
        {/if}
        {#if kind === 'saving'}
          <MoneyField id="goal" label="Obiettivo (facoltativo)" bind:cents={goalCents} />
        {/if}
      </section>

      <section class="card stack">
        <div class="field">
          <span class="label" id="leftover">A fine mese, quello che resta</span>
          <div class="chips" role="group" aria-labelledby="leftover">
            <button class="chip" type="button" aria-pressed={leftover === 'carry'} onclick={() => (leftover = 'carry')}>Resta qui</button>
            <button class="chip" type="button" aria-pressed={leftover === 'move'} disabled={!others.length} onclick={() => (leftover = 'move')}>Va in un altro bucket</button>
            <button class="chip" type="button" aria-pressed={leftover === 'reset'} onclick={() => (leftover = 'reset')}>Si azzera</button>
          </div>
        </div>
        {#if leftover === 'move'}
          <div class="field">
            <label for="leftover-to">Bucket</label>
            <Picker id="leftover-to" label="Va nel bucket" options={targetOptions} bind:value={leftoverTo} />
          </div>
          <div class="field">
            <label for="leftover-percent">Quanto spostare (%)</label>
            <input id="leftover-percent" type="number" min="1" max="100" step="1" required bind:value={leftoverPercent} />
            <p class="help">Il resto torna da assegnare.</p>
          </div>
        {/if}

        <div class="field">
          <span class="label" id="overspend">Se sfora</span>
          <div class="chips" role="group" aria-labelledby="overspend">
            <button class="chip" type="button" aria-pressed={overspend === 'carry'} onclick={() => (overspend = 'carry')}>Riparte in negativo</button>
            <button class="chip" type="button" aria-pressed={overspend === 'cover'} disabled={!others.length} onclick={() => (overspend = 'cover')}>Lo copre un altro bucket</button>
          </div>
        </div>
        {#if overspend === 'cover'}
          <div class="field">
            <label for="overspend-from">Bucket che copre</label>
            <Picker id="overspend-from" label="Bucket che copre" options={targetOptions} bind:value={overspendFrom} />
          </div>
        {/if}
      </section>

      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy}>Salva</button>
      {#if !isNew}
        <button class="btn btn-ghost" type="button" onclick={toggleArchive}>{archived ? 'Ripristina' : 'Archivia'}</button>
      {/if}
    </form>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</main>

<style>
  .name-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 6px;
  }
  .pick {
    min-height: 52px;
    border: 2px solid transparent;
    border-radius: 16px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .pick[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    border: none;
    cursor: pointer;
  }
  .swatch[aria-pressed='true'] {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--text);
  }
</style>
