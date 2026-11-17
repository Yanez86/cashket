<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Top bar shared by every screen, as in Mealler: top-left the logo, which links back to the buckets, or
     the section's drawing; then title and subtitle; actions on the right. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from './Logo.svelte';
  import SectionIcon, { type Section } from './SectionIcon.svelte';

  let { title, subtitle = '', actions, section }: { title: string; subtitle?: string; actions?: Snippet; section?: Section } = $props();
</script>

<header class="topbar">
  {#if section}
    <span class="home"><SectionIcon {section} size={40} /></span>
  {:else}
    <a class="home" href="/" aria-label="Bucket"><Logo size={40} /></a>
  {/if}
  <div class="titles">
    <h1>{title}</h1>
    {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: max(16px, var(--status-clear)) 0 12px;
  }
  .home {
    flex: none;
    width: 48px;
    height: 48px;
    margin-left: -4px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .titles {
    flex: 1;
    min-width: 0;
    padding-left: 4px;
  }
  h1 {
    font-size: 26px;
    line-height: 32px;
    font-weight: 700;
  }
  h1,
  p {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p {
    font-size: 15px;
    line-height: 20px;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
</style>
