<script lang="ts">
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Builds — PC Parts Inventory</title>
</svelte:head>

<h1>Builds</h1>

{#if data.builds.length === 0}
  <p>No builds yet.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Source</th>
        <th>Hostname</th>
        <th>Visibility</th>
        <th>Share link</th>
      </tr>
    </thead>
    <tbody>
      {#each data.builds as build (build.id)}
        <tr>
          <td><a href="/builds/{build.id}">{build.name}</a></td>
          <td>{build.source}</td>
          <td>{build.hostname ?? '—'}</td>
          <td>{build.visibility}</td>
          <td>
            {#if build.visibility === 'private'}
              <span title="Private builds have no public share link">—</span>
            {:else}
              <a href="/b/{build.slug}">/b/{build.slug}</a>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
