/**
 * Pure builders for the share page's `<head>` tags (Recon #4 — `og:image` must be an absolute URL;
 * the request origin is the default, `PUBLIC_ORIGIN` overrides it for deployments where the API's
 * public origin differs from the page's). Kept dependency-free (no `$env`/`$app`) so they are
 * testable without SvelteKit's runtime.
 */

export type MetaTag = { key: string; attr: 'property' | 'name'; content: string };

export function resolveOrigin(requestOrigin: string, publicOrigin?: string): string {
  return publicOrigin && publicOrigin.length > 0 ? publicOrigin : requestOrigin;
}

function stripTrailingSlash(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

export function buildOgImageUrl(origin: string, slug: string): string {
  return `${stripTrailingSlash(origin)}/api/v1/share/${encodeURIComponent(slug)}/card.png`;
}

export function buildShareUrl(origin: string, slug: string): string {
  return `${stripTrailingSlash(origin)}/b/${encodeURIComponent(slug)}`;
}

/**
 * The four required OG tags (title, description, image, url) plus `twitter:card` as a bonus. The
 * harness (`tools/harness/checks/40-web.ts`) counts the four `property="og:*"` tags in the
 * rendered HTML, so this list's order and `attr`/`key` values are what it looks for.
 */
export function buildOgTags(input: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
}): MetaTag[] {
  return [
    { key: 'og:title', attr: 'property', content: input.title },
    { key: 'og:description', attr: 'property', content: input.description },
    { key: 'og:image', attr: 'property', content: input.imageUrl },
    { key: 'og:url', attr: 'property', content: input.pageUrl },
    { key: 'twitter:card', attr: 'name', content: 'summary_large_image' },
  ];
}
