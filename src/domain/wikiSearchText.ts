/**
 * Shared English-oriented normalization for Layer 1 (history key) and Layer 2 (token overlap).
 * Latin letters are case-folded and diacritics stripped so ticket and wiki text use the same token space.
 */

const ENGLISH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "might",
  "must",
  "no",
  "not",
  "of",
  "on",
  "or",
  "per",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "too",
  "via",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "yes",
  // Support-ticket boilerplate (often weak signals for template choice)
  "please",
  "help",
  "following",
  "requested",
  "currently",
  "trouble",
  "thanks",
  "thank",
  "dear",
  "hello",
  // Very common in wiki rows / tickets but rarely discriminate a template
  "classes",
  "class",
  "team",
  "user",
  "users",
]);

/** Lowercase, strip combining marks (Latin / common diacritics), for a single English-oriented token stream. */
export function foldLatinForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Layer 2 + wiki indexing: same tokenization as ticket side. */
export function tokenizeForLayer2(text: string): string[] {
  return foldLatinForSearch(text)
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

/** Layer 1 history key: tokens from {@link tokenizeForLayer2} minus English stopwords. */
export function extractHistoryKeywords(text: string): string[] {
  return tokenizeForLayer2(text).filter((t) => !ENGLISH_STOPWORDS.has(t));
}
