<script lang="ts">
  import { valuationCaption } from '@pcpi/contracts';
  import { formatMoney, formatPercent, formatSignedMoney } from '$lib/money.js';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  let copyStatus = $state<'idle' | 'copying' | 'done' | 'error'>('idle');

  async function copyMarkdown() {
    copyStatus = 'copying';
    try {
      // Task 8 (architect-directed, 2026-09-05): the generalised same-origin share proxy under
      // `/api/v1/share/*` replaces this route's own dedicated markdown proxy — one handler for
      // JSON/.md/card.png instead of three ad hoc ones.
      const res = await fetch(`/api/v1/share/${encodeURIComponent(data.build.slug)}.md`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      copyStatus = 'done';
    } catch {
      copyStatus = 'error';
    }
  }

  const copyLabel = $derived(
    copyStatus === 'done'
      ? 'Copied!'
      : copyStatus === 'copying'
        ? 'Copying…'
        : copyStatus === 'error'
          ? 'Copy failed — try the link below'
          : 'Copy Markdown',
  );
</script>

<svelte:head>
  <title>{data.build.name} — PC Parts Inventory</title>
  <meta name="description" content={data.description} />
  {#each data.ogTags as tag (tag.key)}
    {#if tag.attr === 'property'}
      <meta property={tag.key} content={tag.content} />
    {:else}
      <meta name={tag.key} content={tag.content} />
    {/if}
  {/each}
</svelte:head>

<article>
  <h1>{data.build.name}</h1>
  <p>{data.description}</p>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Manufacturer</th>
        <th>Model</th>
        <th>Qty</th>
        <th>Price</th>
      </tr>
    </thead>
    <tbody>
      {#each data.build.items as item (item.category + item.manufacturer + item.model)}
        <tr>
          <td>{item.category}</td>
          <td>{item.manufacturer}</td>
          <td>{item.model}</td>
          <td>{item.quantity}</td>
          <td>
            {#if item.currentCents != null}
              {formatMoney(item.currentCents, data.build.currency)}
            {:else}
              —
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if data.build.valuation}
    {@const v = data.build.valuation}
    <p>
      Paid: {formatMoney(v.acquiredCents, data.build.currency)} · Now: {formatMoney(
        v.currentCents,
        data.build.currency,
      )} ·
      {#if v.comparable.items === 0}
        Δ: —
      {:else}
        Δ: {formatSignedMoney(v.comparable.deltaCents, data.build.currency)}{v.comparable.deltaPct !=
        null
          ? ` (${formatPercent(v.comparable.deltaPct)})`
          : ''}
      {/if}
    </p>
    <p class="coverage-caption">{valuationCaption(v)}</p>
  {/if}

  <p>
    <button type="button" onclick={copyMarkdown}>{copyLabel}</button>
  </p>
  <noscript>
    <p><a href="/api/v1/share/{data.build.slug}.md">View as Markdown</a></p>
  </noscript>
</article>

<style>
  .coverage-caption {
    font-size: 0.85rem;
    color: var(--muted-text-color, #666);
  }
</style>
