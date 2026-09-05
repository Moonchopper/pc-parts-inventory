/** `ETag` for `/card.png`, derived from the build's slug + `updatedAt` (brief, deliverable 2). */
export function cardETag(slug: string, updatedAt: string): string {
  return `"${slug}-${updatedAt}"`;
}
