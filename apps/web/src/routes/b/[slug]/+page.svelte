<script lang="ts">
  import { formatMoney } from '$lib/money.js';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  let copyStatus = $state<'idle' | 'copying' | 'done' | 'error'>('idle');

  async function copyMarkdown() {
    copyStatus = 'copying';
    try {
      const res = await fetch('markdown');
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
      </tr>
    </thead>
    <tbody>
      {#each data.build.items as item (item.category + item.manufacturer + item.model)}
        <tr>
          <td>{item.category}</td>
          <td>{item.manufacturer}</td>
          <td>{item.model}</td>
          <td>{item.quantity}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if data.build.valuation}
    <p>
      Acquired: {formatMoney(data.build.valuation.acquiredCents, 'USD')} · Current: {formatMoney(
        data.build.valuation.currentCents,
        'USD',
      )} · Delta: {formatMoney(data.build.valuation.deltaCents, 'USD')}
    </p>
  {/if}

  <p>
    <button type="button" onclick={copyMarkdown}>{copyLabel}</button>
  </p>
  <noscript>
    <p><a href="markdown">View as Markdown</a></p>
  </noscript>
</article>
