<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- An amount in euros typed the Italian way, bound as integer cents (null when empty or not a number). -->
<script lang="ts">
  import { parseAmount } from '@cashket/shared';

  let { id, label, cents = $bindable(), required = false }: { id: string; label: string; cents: number | null; required?: boolean } = $props();

  let text = $state(cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="money">
    <input {id} inputmode="decimal" autocomplete="off" {required} bind:value={text} oninput={() => (cents = parseAmount(text))} />
    <span class="muted" aria-hidden="true">€</span>
  </div>
</div>

<style>
  .money {
    position: relative;
  }
  .money input {
    padding-right: 36px;
  }
  .money span {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
  }
</style>
