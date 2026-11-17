<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- App shell, as Mealler's: the splash until the server answers, then the page and the tab bar. -->
<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  import Splash from '$lib/Splash.svelte';
  import { app, loadSession } from '$lib/state.svelte';
  import { flushQueue, initOffline, queue, refreshQueue } from '$lib/offline.svelte';

  let { children }: { children: Snippet } = $props();

  let ready = $state(false);
  let splashMessage = $state('Apro i tuoi bucket…');

  onMount(async () => {
    try {
      await loadSession();
      ready = true;
    } catch {
      splashMessage = navigator.onLine ? 'Il server non risponde.' : 'Sei offline.';
    }
  });

  // Back online: send what was typed meanwhile.
  function onNetworkChange() {
    queue.online = navigator.onLine;
    if (navigator.onLine) void flushQueue();
  }

  // Once signed in (or as another person), the device queue is that person's: send it and count the rest.
  const userId = $derived(app.user?.id);
  $effect(() => {
    if (!ready || userId == null) return;
    initOffline(userId);
    void flushQueue().then(refreshQueue);
  });

  const badge = $derived(queue.count + queue.pending.length);

  // Pages that work without signing in.
  const PUBLIC = ['/login', '/setup', '/register', '/reset'];
  const isPublic = $derived(PUBLIC.includes(page.url.pathname));

  // First start goes to setup; a signed-out person goes to login; a signed-in one leaves the public pages.
  $effect(() => {
    if (!ready) return;
    const path = page.url.pathname;
    if (app.status?.setupRequired) {
      if (path !== '/setup') void goto('/setup', { replaceState: true });
    } else if (!app.user && !isPublic) {
      void goto(`/login?next=${encodeURIComponent(path)}`, { replaceState: true });
    } else if (app.user && isPublic) {
      void goto(page.url.searchParams.get('next') || '/', { replaceState: true });
    }
  });

  const allowed = $derived(ready && (isPublic ? !app.user : !!app.user));

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

<svelte:window ononline={onNetworkChange} onoffline={onNetworkChange} />

{#if allowed}
  {@render children()}
  {#if app.user}
  <nav class="tabbar" aria-label="Navigazione principale">
    {#each tabs as tab (tab.href)}
      <a href={tab.href} aria-current={activeTab === tab.href ? 'page' : undefined}>
        <span class="pill"
          ><Icon name={tab.icon} />{#if tab.href === '/coda' && badge}<span class="badge" aria-label="{badge} in coda">{badge}</span>{/if}</span
        >
        {tab.label}
      </a>
    {/each}
  </nav>
  {/if}
{:else if !ready}
  <Splash message={splashMessage} version={app.status?.version ?? __APP_VERSION__} />
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
  .pill {
    position: relative;
  }
  .badge {
    position: absolute;
    top: -4px;
    right: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tabbar a[aria-current='page'] .pill {
    background: var(--accent-soft);
    view-transition-name: tab-pill;
  }
</style>
