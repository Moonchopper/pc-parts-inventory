<script lang="ts">
  let { children } = $props();
</script>

<div class="shell">
  <header>
    <a class="brand" href="/">PC Parts Inventory</a>
    <nav>
      <a href="/">Inventory</a>
      <a href="/builds">Builds</a>
    </nav>
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  :global(:root) {
    color-scheme: light dark;
    --border: #d0d0d0;
    --muted: #666;
    --positive: #1a7f37;
    --negative: #cf222e;
  }

  :global(body) {
    margin: 0;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
    line-height: 1.5;
  }

  :global(table) {
    border-collapse: collapse;
    width: 100%;
  }

  :global(th, td) {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  :global(.delta-positive) {
    color: var(--positive);
  }

  :global(.delta-negative) {
    color: var(--negative);
  }

  :global(.delta-flat) {
    color: var(--muted);
  }

  .shell {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem 3rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1.5rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
  }

  .brand {
    font-weight: 700;
    text-decoration: none;
    color: inherit;
  }

  nav {
    display: flex;
    gap: 1rem;
  }
</style>
