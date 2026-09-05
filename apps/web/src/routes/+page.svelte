<script lang="ts">
  import { formatMoney } from '$lib/money.js';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Inventory — PC Parts Inventory</title>
</svelte:head>

<h1>Inventory</h1>

{#if data.parts.length === 0}
  <p>No parts yet. Run a scan import to populate the inventory.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Product</th>
        <th>Serial</th>
        <th>Condition</th>
        <th>Status</th>
        <th>Acquired</th>
        <th>Current</th>
        <th>Delta</th>
      </tr>
    </thead>
    <tbody>
      {#each data.parts as part (part.id)}
        <tr>
          <td>{part.product?.category ?? '—'}</td>
          <td>{part.product ? `${part.product.manufacturer} ${part.product.model}` : '—'}</td>
          <td>{part.serial ?? '—'}</td>
          <td>{part.condition}</td>
          <td>{part.status}</td>
          <td>
            {#if part.acquiredPriceCents != null}
              {formatMoney(part.acquiredPriceCents, part.acquiredCurrency)}
            {:else}
              —
            {/if}
          </td>
          <td title="No current-price source yet (W0.3)">—</td>
          <td title="No current-price source yet (W0.3)">—</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
