/**
 * Normalize subject name to consistent lowercase_underscore format
 * e.g. "Science" → "science", "Social Science" → "social_science"
 * Ensures consistency across activities, PA/SA, competency registry
 */
export const normalizeSubject = (s: string): string =>
  (s || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
