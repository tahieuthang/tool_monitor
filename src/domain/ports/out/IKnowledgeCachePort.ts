import { WikiDocument } from "@domain/entities/WikiDocument";

export interface IKnowledgeCachePort {
    /** Overwrite the cache entirely (atomic update) */
    save(documents: WikiDocument[]): void;

    /** Layer 1: Exact Match (Hash-based) */
    findExactMatch(hash: string): WikiDocument[] | null;

    /** Cache a result for Layer 1 */
    saveMatch(hash: string, docs: WikiDocument[]): void;

    /** Layer 2: Inverted Index search */
    searchByTokens(tokens: string[], topN: number): WikiDocument[];
}
