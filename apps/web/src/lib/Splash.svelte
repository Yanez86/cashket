<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start-up screen, as Mealler's: logo, name and what the app is doing, over a tilted lattice of the
     category icons; at the bottom a spinning coin, the version and the maker. -->
<script lang="ts">
  import { CATEGORIES } from '@cashket/shared';
  import Logo from './Logo.svelte';

  let { message, version }: { message: string; version: string } = $props();

  // 18 columns cover screens up to about 1300 px wide, and 3 cycles up to about 1280 px tall.
  const COLS = 18;
  // Each row shifts by 5 categories, so the same icon never sits next to itself.
  const columns = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: CATEGORIES.length * 3 }, (_, r) => CATEGORIES[(c + r * 5) % CATEGORIES.length])
  );
</script>

<div class="splash" role="status" aria-live="polite">
  <div class="lattice" aria-hidden="true" style:--half="{CATEGORIES.length * 34}px">
    {#each columns as column, ci (ci)}
      <div class="col">
        {#each column as c, i (i)}
          <span class="tile" style:--tint={c.tint}><img src="/categories/{c.key}.svg" alt="" draggable="false" /></span>
        {/each}
      </div>
    {/each}
  </div>
  <div class="mark"><Logo size={112} title="Cashket" /></div>
  <!-- Wordmark drawn in rounded strokes; the s is a gold dollar sign. -->
  <svg class="name" viewBox="-8 -14 352 92" role="img" aria-label="Cashket" fill="none" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="var(--text)">
    <path d="M37.3 30A20 20 0 1 0 37.3 50">
    </path>
    <path d="M94 40a20 20 0 1 0 -40 0a20 20 0 1 0 40 0M94 20V60">
    </path>
    <path d="M158 -4V60M158 36a16 16 0 0 1 32 0V60">
    </path>
    <path d="M208 -4V60M236 20L209 44M218 37L238 60">
    </path>
    <path d="M254 40H294A20 20 0 1 0 288.1 54.1">
    </path>
    <path d="M318 2V48a12 12 0 0 0 12 12h4M307 22H333">
    </path>
    </g>
    <g stroke="#F5B83D">
    <path d="M137 25C132 18 112 17 112 30C112 41 138 39 138 50C138 63 114 63 110 55">
    </path>
    <path d="M125 6V74" stroke-width="5">
    </path>
    </g>
  </svg>
  <p class="message">{message}</p>
  <div class="foot">
    <svg class="coin" width="34" height="34" viewBox="-24 -24 48 48" aria-hidden="true">
      <circle r="20" fill="#F5B83D" stroke="#17151F" stroke-width="4" />
      <circle r="13" fill="none" stroke="#E2A12A" stroke-width="2.5" />
      <path d="M6 -9A10.5 10.5 0 1 0 6 9M-12 -3H3M-12 3H3" fill="none" stroke="#17151F" stroke-width="3.6" stroke-linecap="round" />
      <ellipse cx="-9" cy="-11" rx="5" ry="2.8" fill="#FCD97A" transform="rotate(-35 -9 -11)" />
    </svg>
    <p class="version">v{version}</p>
    <p class="maker">Happy Squid inc</p>
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    background: var(--bg);
    text-align: center;
    overflow: hidden;
    isolation: isolate;
  }
  /* Tilted the opposite way of the logo's bucket (-12deg). */
  .lattice {
    position: absolute;
    inset: -40%;
    z-index: -1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    transform: rotate(12deg);
    opacity: 0.35;
    animation: fade 900ms ease-out both;
  }
  .splash::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(to bottom, transparent 35%, var(--bg) 100%);
    pointer-events: none;
  }
  .col {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: up 100s linear infinite;
  }
  .col:nth-child(even) {
    animation-name: down;
  }
  .tile {
    width: 60px;
    height: 60px;
    border-radius: 23%;
    background: color-mix(in srgb, var(--tint) 22%, var(--surface));
    display: grid;
    place-items: center;
  }
  .tile img {
    width: 62%;
    height: 62%;
    display: block;
    user-select: none;
  }
  .mark {
    width: 152px;
    height: 152px;
    border-radius: 36px;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.12);
    animation: pop 600ms ease-out both;
  }
  .name {
    width: 184px;
    height: auto;
    display: block;
  }
  .message {
    margin-top: 20px;
    min-height: 22px;
    font-size: 15px;
    color: var(--text-2);
  }
  .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 18px 24px calc(30px + env(safe-area-inset-bottom, 0px));
  }
  .coin {
    display: block;
    animation: spin 1.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  }
  .version {
    font-size: 15px;
    color: var(--text-2);
  }
  .maker {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text-2);
    opacity: 0.8;
  }
  @keyframes pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes up {
    from {
      transform: translateY(var(--half));
    }
    to {
      transform: translateY(calc(-1 * var(--half)));
    }
  }
  @keyframes down {
    from {
      transform: translateY(calc(-1 * var(--half)));
    }
    to {
      transform: translateY(var(--half));
    }
  }
  /* The coin turns on its edge, like a coin spun on a table. */
  @keyframes spin {
    50% {
      transform: scaleX(0.15);
    }
  }
</style>
