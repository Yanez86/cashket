<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A choice from a list, in the app's style instead of the system menu (improvement 6): a field-like
     button that opens a panel from the bottom with the options, their icons and, for long lists, a search. -->
<script module lang="ts">
  import type { BucketIcon } from '@cashket/shared';

  export interface PickerOption<V> {
    value: V;
    label: string;
    sub?: string;
    icon?: BucketIcon;
    /** An illustration file, e.g. /accounts/card.svg. */
    img?: string;
    disabled?: boolean;
  }
</script>

<script lang="ts" generics="T extends string | number | null">
  import CategoryIcon from './CategoryIcon.svelte';
  import Icon from './Icon.svelte';

  let {
    id,
    label,
    options,
    value = $bindable(),
    placeholder = 'Scegli…',
    onchange
  }: { id: string; label: string; options: PickerOption<T>[]; value: T; placeholder?: string; onchange?: (value: T) => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let search = $state('');
  const selected = $derived(options.find((o) => o.value === value));
  const shown = $derived(search.trim() ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase())) : options);

  function open() {
    search = '';
    dialog?.showModal();
  }

  function pick(o: PickerOption<T>) {
    if (o.disabled) return;
    value = o.value;
    dialog?.close();
    onchange?.(o.value);
  }

  // A tap on the dimmed backdrop (the dialog itself, outside the panel) closes it.
  function backdrop(event: MouseEvent) {
    if (event.target === dialog) dialog?.close();
  }
</script>

<button {id} class="picker" type="button" aria-haspopup="dialog" onclick={open}>
  {#if selected?.icon}<CategoryIcon icon={selected.icon} size={28} badge={false} />{/if}
  {#if selected?.img}<img src={selected.img} alt="" width="26" height="26" />{/if}
  <span class="value" class:placeholder={!selected}>{selected?.label ?? placeholder}</span>
  <Icon name="chevronDown" size={20} stroke={2.5} />
</button>

<dialog bind:this={dialog} class="sheet" aria-label={label} onclick={backdrop}>
  <div class="panel">
    <div class="grip" aria-hidden="true"></div>
    <div class="head">
      <h2 class="section-title">{label}</h2>
      <button class="icon-btn plain" type="button" aria-label="Chiudi" onclick={() => dialog?.close()}><Icon name="close" size={22} /></button>
    </div>
    {#if options.length > 8}
      <input class="search" type="search" placeholder="Cerca" aria-label="Cerca in {label}" bind:value={search} />
    {/if}
    <div class="list" role="listbox" aria-label={label}>
      {#each shown as o (o.value)}
        <button
          class="option"
          type="button"
          role="option"
          aria-selected={o.value === value}
          disabled={o.disabled}
          onclick={() => pick(o)}>
          {#if o.icon}<CategoryIcon icon={o.icon} size={36} />{/if}
          {#if o.img}<img src={o.img} alt="" width="34" height="34" />{/if}
          <span class="text">
            <span>{o.label}</span>
            {#if o.sub}<span class="muted small">{o.sub}</span>{/if}
          </span>
          {#if o.value === value}<Icon name="check" size={20} stroke={2.5} />{/if}
        </button>
      {:else}
        <p class="muted" style="padding: 12px 4px">Nessun risultato.</p>
      {/each}
    </div>
  </div>
</dialog>

<style>
  .picker {
    width: 100%;
    min-height: 48px;
    padding: 8px 14px;
    border-radius: 14px;
    border: 1.5px solid var(--field);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    cursor: pointer;
  }
  .picker:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }
  .value {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .placeholder {
    color: var(--text-2);
  }
  .sheet {
    margin: auto auto 0;
    padding: 0;
    width: 100%;
    max-width: 560px;
    max-height: 80vh;
    border: none;
    border-radius: 24px 24px 0 0;
    background: var(--surface);
    color: var(--text);
  }
  .sheet[open] {
    animation: rise 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .sheet::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .panel {
    padding: 8px 16px max(16px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 80vh;
  }
  .grip {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--surface-2);
    align-self: center;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .search {
    width: 100%;
    min-height: 44px;
    padding: 8px 14px;
    border-radius: 14px;
    border: 1.5px solid var(--field);
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 4px;
  }
  .option {
    min-height: 52px;
    padding: 8px 12px;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
  }
  .option[aria-selected='true'] {
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 600;
  }
  .option:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  @keyframes rise {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet[open] {
      animation: none;
    }
  }
</style>
