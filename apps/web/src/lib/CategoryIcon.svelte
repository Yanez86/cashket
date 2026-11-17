<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A bucket's icon in its tinted circle, as Mealler's food icons: a ready-made category illustration
     (static/categories) or, for a custom category, a tag in the chosen colour with the name's first letter.
     Decorative for screen readers: the bucket's name is always written next to it. -->
<script lang="ts">
  import { categoryByKey, type BucketIcon } from '@cashket/shared';

  let { icon, size = 44, badge = true }: { icon: BucketIcon; size?: number; badge?: boolean } = $props();

  const tint = $derived(icon.kind === 'category' ? (categoryByKey(icon.key)?.tint ?? '#85858d') : icon.color);
</script>

<span class="category-icon" class:badge style:--tint={tint} style:width="{size}px" style:height="{size}px" aria-hidden="true">
  {#if icon.kind === 'category'}
    <img src="/categories/{icon.key}.svg" alt="" draggable="false" />
  {:else}
    <svg viewBox="0 0 64 64">
      <g transform="rotate(-8 32 32)">
        <path d="M8 15a7 7 0 0 1 7-7H35L57 30a5 5 0 0 1 0 7L38 56a5 5 0 0 1-7 0L8 33Z" fill={icon.color} stroke="#17151F" stroke-width="3" stroke-linejoin="round" />
        <circle cx="19" cy="19" r="4.5" fill="#FFFFFF" stroke="#17151F" stroke-width="2.6" />
        <ellipse cx="14" cy="28" rx="1.8" ry="4.5" fill="#FFFFFF" fill-opacity="0.45" />
        <text x="35" y="44" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" stroke="#17151F" stroke-width="1.2" paint-order="stroke">{icon.letter.slice(0, 1).toUpperCase()}</text>
      </g>
    </svg>
  {/if}
</span>

<style>
  .category-icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .badge {
    border-radius: 50%;
    background: color-mix(in srgb, var(--tint) var(--icon-tint, 16%), transparent);
  }
  img,
  svg {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
  }
  .badge img,
  .badge svg {
    width: 72%;
    height: 72%;
  }
</style>
