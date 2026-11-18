<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- When something happened (improvement 7): quick chips, and the system date picker only for another day.
     With `time`, the value is an ISO timestamp and "Adesso" keeps the current time; without, 'YYYY-MM-DD'. -->
<script lang="ts">
  let { id, label, value = $bindable(), time = false }: { id: string; label: string; value: string; time?: boolean } = $props();

  const pad = (n: number) => String(n).padStart(2, '0');
  const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localInput = (iso: string) => {
    const d = new Date(iso);
    return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const today = () => localDay(new Date());
  const yesterday = () => localDay(new Date(Date.now() - 864e5));
  const dayOf = (v: string) => (time ? localDay(new Date(v)) : v);

  const which = $derived(dayOf(value) === today() ? 'today' : dayOf(value) === yesterday() ? 'yesterday' : 'other');
  let other = $state(false);

  /** Same time of day on another date. */
  function setDay(day: string) {
    other = false;
    if (!time) {
      value = day;
      return;
    }
    const d = day === today() ? new Date() : new Date(value);
    const [y, m, dd] = day.split('-').map(Number);
    d.setFullYear(y, m - 1, dd);
    value = d.toISOString();
  }
</script>

<div class="field">
  <span class="label" id="{id}-label">{label}</span>
  <div class="chips" role="group" aria-labelledby="{id}-label">
    <button class="chip" type="button" aria-pressed={!other && which === 'today'} onclick={() => setDay(today())}>{time ? 'Adesso' : 'Oggi'}</button>
    <button class="chip" type="button" aria-pressed={!other && which === 'yesterday'} onclick={() => setDay(yesterday())}>Ieri</button>
    <button class="chip" type="button" aria-pressed={other || which === 'other'} onclick={() => (other = true)}>Altro giorno</button>
  </div>
  {#if other || which === 'other'}
    {#if time}
      <input {id} type="datetime-local" aria-label={label} value={localInput(value)} onchange={(e) => e.currentTarget.value && (value = new Date(e.currentTarget.value).toISOString())} />
    {:else}
      <input {id} type="date" aria-label={label} bind:value />
    {/if}
  {/if}
</div>
