<script lang="ts">
  import { deltaClass, formatMoney, formatPercent, formatSignedMoney } from '$lib/money.js';
  import type { ActionData, PageData } from './$types.js';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{data.build.name} — PC Parts Inventory</title>
</svelte:head>

<h1>{data.build.name}</h1>
{#if data.build.description}
  <p>{data.build.description}</p>
{/if}
<p>
  <a href="/b/{data.build.slug}">Public share page →</a>
</p>

{#if form?.message}
  <p class="delta-negative" role="alert">{form.message}</p>
{/if}

<h2>Items</h2>
{#if !data.build.items || data.build.items.length === 0}
  <p>No parts in this build yet.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Product</th>
        <th>Serial</th>
        <th>Slot</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.build.items as item (item.partId)}
        <tr>
          <td>{item.product.category}</td>
          <td>{item.product.manufacturer} {item.product.model}</td>
          <td>{item.part.serial ?? '—'}</td>
          <td>{item.slot ?? '—'}</td>
          <td>
            <form method="POST" action="?/removeItem">
              <input type="hidden" name="partId" value={item.partId} />
              <button type="submit">Remove</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<h2>Add a part</h2>
{#if data.availableParts.length === 0}
  <p>No on-shelf parts available to add.</p>
{:else}
  <form method="POST" action="?/addItem">
    <label>
      Part
      <select name="partId" required>
        {#each data.availableParts as part (part.id)}
          <option value={part.id}>
            {part.product ? `${part.product.manufacturer} ${part.product.model}` : part.id}
            {part.serial ? `(${part.serial})` : ''}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Slot (optional)
      <input type="text" name="slot" />
    </label>
    <button type="submit">Add to build</button>
  </form>
{/if}

<h2>Valuation</h2>
{#if data.valuation}
  {@const v = data.valuation}
  <p>
    Paid: {formatMoney(v.acquiredCents, v.currency)} · Now: {formatMoney(v.currentCents, v.currency)} ·
    {#if v.comparable.items === 0}
      <span class="delta-flat">Δ: —</span>
    {:else}
      <span class={deltaClass(v.comparable.deltaCents)}>
        Δ: {formatSignedMoney(v.comparable.deltaCents, v.currency)}{v.comparable.deltaPct != null
          ? ` (${formatPercent(v.comparable.deltaPct)})`
          : ''}
      </span>
    {/if}
  </p>
  <p class="coverage-caption">{v.coverage.withCurrent} of {v.coverage.items} priced</p>
{:else}
  <p>Valuation unavailable.</p>
{/if}

<style>
  form {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }

  .coverage-caption {
    font-size: 0.85rem;
    color: var(--muted-text-color, #666);
  }
</style>
