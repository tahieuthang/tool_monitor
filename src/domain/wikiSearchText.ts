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
  "hi",
  "hey",
  "regards",
  "sincerely",
  "sorry",
  "sent",
  "subject",
  "re",
  "fwd",
  "regarding",
  "about",
  "info",
  "information",
  "details",
  "detail",
  "support",
  "customer",
  "client",
  "ticket",
  "issue",
  "issues",
  "problem",
  "problems",
  "need",
  "needs",
  "want",
  "wanted",
  "just",
  "also",
  "still",
  "already",
  "again",
  "here",
  "out",
  "unable",
  "cannot",
  "checking",
  "checked",
  "update",
  "updated",
  "attached",
  "attachment",
  "screenshot",
  "image",
  "email",
  "phone",
  "contact",
  "number",
  "link",
  "morning",
  "afternoon",
  "evening",
  "today",
  "yesterday",
  "ok",
  "okay",
  // Very common in wiki rows / tickets but rarely discriminate a template
  "classes",
  "class",
  "team",
  "user",
  "users",
  "student",
  "students",
  "parent",
  "parents",
  "course",
  "courses",
]);

/** Strip URLs, emails, phones, numeric IDs, and other non-lexical noise before tokenization. */
export function sanitizeSearchText(text: string): string {
  let s = text;

  // URLs (http/https/ftp and bare www.)
  s = s.replace(/(?:https?|ftp):\/\/[^\s<>"']+/gi, " ");
  s = s.replace(/\bwww\.[^\s<>"']+/gi, " ");

  // Email addresses
  s = s.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, " ");

  // UUIDs and similar hex IDs
  s = s.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    " ",
  );

  // Phone numbers (international / VN-style with optional +84, separators)
  s = s.replace(
    /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?(?:[\s.-]?\d{2,4}){1,3}\b/g,
    " ",
  );
  s = s.replace(/\b(?:\+?84|0)(?:[\s.-]?\d){8,11}\b/g, " ");

  // Ticket / reference codes (e.g. TICKET-001, MS-12345)
  s = s.replace(/\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/g, " ");

  // Standalone numeric strings (class codes, IDs, long numbers)
  s = s.replace(/\b\d{3,}\b/g, " ");

  // Tokens dominated by digits (e.g. class12A2024)
  s = s.replace(/\b(?=\w*\d)\w*\d{3,}\w*\b/gi, " ");

  return s.replace(/\s+/g, " ").trim();
}

/** Lowercase, strip combining marks (Latin / common diacritics), for a single English-oriented token stream. */
export function foldLatinForSearch(text: string): string {
  return sanitizeSearchText(text)
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
