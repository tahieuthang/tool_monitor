import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { WikiDocument } from "@domain/entities/WikiDocument";

export class RamKnowledgeCacheAdapter implements IKnowledgeCachePort {
  private caseMap: Map<string, WikiDocument> = new Map();
  private historyMap: Map<string, string[]> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();

  public save(documents: WikiDocument[]): void {
    // Build new structures (Atomic Update)
    const newCaseMap = new Map<string, WikiDocument>();
    const newHistoryMap = new Map<string, string[]>();
    const newInvertedIndex = new Map<string, Set<string>>();

    for (const doc of documents) {
      newCaseMap.set(doc.id, doc);
      for (const token of doc.tokens) {
        if (!newInvertedIndex.has(token)) {
          newInvertedIndex.set(token, new Set());
        }
        newInvertedIndex.get(token)!.add(doc.id);
      }
    }

    // Re-assign (atomic update, clearing old cache)
    this.caseMap = newCaseMap;
    this.historyMap = newHistoryMap;
    this.invertedIndex = newInvertedIndex;
  }

  public findExactMatch(hash: string): WikiDocument[] | null {
    const ids = this.historyMap.get(hash);
    if (!ids) return null;
    return ids.map(id => this.caseMap.get(id)).filter((doc): doc is WikiDocument => !!doc);
  }

  public saveMatch(hash: string, docs: WikiDocument[]): void {
    // Save only IDs to historyMap
    this.historyMap.set(hash, docs.map(d => d.id));
  }

  public searchByTokens(tokens: string[]): WikiDocument[] {
    const scores = new Map<string, number>();

    for (const token of tokens) {
      const ids = this.invertedIndex.get(token);
      if (ids) {
        for (const id of ids) {
          scores.set(id, (scores.get(id) || 0) + 1);
        }
      }
    }

    if (scores.size === 0) return [];

    const maxScore = Math.max(...scores.values());
    // Drop weak tail: keep docs at least ~half the best score (min 2 when best ≥3), so generic single-token hits fall away when a stronger match exists.
    const threshold =
      maxScore <= 1 ? 1 : maxScore === 2 ? 2 : Math.max(2, Math.ceil(maxScore * 0.52));

    const sortedIds = Array.from(scores.entries())
      .filter(([, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1]);
    return sortedIds
      .map(entry => this.caseMap.get(entry[0]))
      .filter((doc): doc is WikiDocument => !!doc);
  }
}
