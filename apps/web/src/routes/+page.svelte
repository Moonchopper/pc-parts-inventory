<script lang="ts">
  import { formatMoney, formatSignedMoney } from '$lib/money.js';
  import type { ActionData, PageData } from './$types.js';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Inventory — PC Parts Inventory</title>
</svelte:head>

<h1>Inventory</h1>

{#if form?.message}
  <p class="delta-negative" role="alert">{form.message}</p>
{/if}

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
        {@const priced = data.pricing[part.id]}
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
            <form method="POST" action="?/updateAcquiredPrice" class="inline-form">
              <input type="hidden" name="partId" value={part.id} />
              <input
                type="number"
                name="acquiredPriceCents"
                min="0"
                step="1"
                placeholder="cents"
                aria-label="Acquired price in cents for {part.product?.model ?? part.id}"
              />
              <button type="submit">Set</button>
            </form>
          </td>
          <td title={priced?.currentCents == null ? 'Not in a build, or no quote yet' : undefined}>
            {#if priced?.currentCents != null}
              {formatMoney(priced.currentCents, priced.currency)}
            {:else}
              —
            {/if}
          </td>
          <td
            title={priced?.currentCents == null || priced?.acquiredCents == null
              ? 'No comparable acquired+current pair for this part yet'
              : undefined}
          >
            {#if priced?.currentCents != null && priced?.acquiredCents != null}
              {formatSignedMoney(priced.currentCents - priced.acquiredCents, priced.currency)}
            {:else}
              —
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .inline-form {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }

  .inline-form input[type='number'] {
    width: 6rem;
  }
</style>
