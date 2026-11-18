<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The round "+" for an expense on the fly (improvement 10), above the tab bar, within thumb's reach. -->
<script lang="ts">
  import Icon from './Icon.svelte';
</script>

<a class="fab" href="/nuova" aria-label="Nuova spesa"><Icon name="plus" size={30} stroke={2.5} /></a>

<style>
  .fab {
    position: fixed;
    right: max(20px, calc((100vw - 560px) / 2 + 20px));
    bottom: calc(96px + env(safe-area-inset-bottom));
    z-index: 15;
    width: 64px;
    height: 64px;
    border-radius: 32px;
    background: var(--accent);
    color: var(--on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
    view-transition-name: fab;
  }
  .fab:active {
    transform: scale(0.94);
  }
  .fab:focus-visible {
    outline: 3px solid var(--accent-ink);
    outline-offset: 3px;
  }
</style>
