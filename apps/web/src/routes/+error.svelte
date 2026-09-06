<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} — PC Parts Inventory</title>
</svelte:head>

<section>
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? 'Something went wrong.'}</p>
  <p><a href="/">Back to inventory</a></p>
</section>
