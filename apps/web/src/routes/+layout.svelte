<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- App shell, as Mealler's: the splash until the server answers, then the page and the tab bar. -->
<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  import Splash from '$lib/Splash.svelte';

  let { children }: { children: Snippet } = $props();

  let ready = $state(false);
  let splashMessage = $state('Apro i tuoi bucket…');
  let version = $state(__APP_VERSION__);

  onMount(async () => {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();
      version = status.version;
      ready = true;
    } catch {
      splashMessage = navigator.onLine ? 'Il server non risponde.' : 'Sei offline.';
    }
  });

  const tabs = [
    { href: '/', label: 'Bucket', icon: 'bucket' },
    { href: '/coda', label: 'Coda', icon: 'tray' },
    { href: '/andamento', label: 'Andamento', icon: 'chart' },
    { href: '/profilo', label: 'Profilo', icon: 'user' }
  ] as const;
  const TAB_ORDER: string[] = tabs.map((t) => t.href);
  const activeTab = $derived(
    tabs.find((t) => (t.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(t.href)))?.href
  );

  // Page transitions as in Mealler (View Transitions API, see app.css): deeper pages slide in from the
  // right, tabs slide towards their side, the tab bar stays still.
  onNavigate((navigation) => {
    const from = navigation.from?.url.pathname;
    const to = navigation.to?.url.pathname;
    if (!from || !to || from === to || !document.startViewTransition) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = TAB_ORDER.indexOf(from);
    const b = TAB_ORDER.indexOf(to);
    const kind = a >= 0 && b >= 0 ? (b > a ? 'next' : 'prev') : a < 0 && b >= 0 ? 'back' : 'forward';
    const root = document.documentElement;
    root.dataset.nav = kind;
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      transition.finished.finally(() => delete root.dataset.nav);
    });
  });
</script>

{#if ready}
  {@render children()}
  <nav class="tabbar" aria-label="Navigazione principale">
    {#each tabs as tab (tab.href)}
      <a href={tab.href} aria-current={activeTab === tab.href ? 'page' : undefined}>
        <span class="pill"><Icon name={tab.icon} /></span>
        {tab.label}
      </a>
    {/each}
  </nav>
{:else}
  <Splash message={splashMessage} {version} />
{/if}

<style>
  .tabbar {
    z-index: 20;
    view-transition-name: tabbar;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 8px 8px max(12px, env(safe-area-inset-bottom));
    background: var(--nav);
    border-top: 1px solid var(--border);
  }
  .tabbar a {
    flex: 1;
    max-width: 120px;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    text-decoration: none;
  }
  .tabbar a[aria-current='page'] {
    color: var(--accent-ink);
    font-weight: 700;
  }
  .pill {
    width: 56px;
    height: 32px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tabbar a[aria-current='page'] .pill {
    background: var(--accent-soft);
    view-transition-name: tab-pill;
  }
</style>
