import { IMatchWikiUseCase } from "@domain/ports/in/IMatchWikiUseCase";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { Ticket } from "@domain/entities/Ticket";
import { MatchResult, Match } from "@domain/entities/MatchResult";
import { extractHistoryKeywords, foldLatinForSearch, tokenizeForLayer2 } from "@domain/wikiSearchText";
import * as crypto from "crypto";

const NO_RELATED_CASES_MESSAGE =
  "No related wiki cases were found.";

export class MatchWikiService implements IMatchWikiUseCase {
  constructor(private readonly knowledgeCachePort: IKnowledgeCachePort) { }

  public async execute(tickets: Ticket[]): Promise<MatchResult[]> {
    const results: MatchResult[] = [];

    for (const ticket of tickets) {
      const hash = this.historyCacheKey(ticket.message);

      // Layer 1: historyMap lookup by canonical English-oriented keyword signature
      let docs = this.knowledgeCachePort.findExactMatch(hash);

      if (docs && docs.length > 0) {
        results.push(this.mapToResult(ticket.id, docs));
        continue;
      }

      // Layer 2: same keyword set as wiki index (stopwords stripped); require stronger overlap when many keywords
      const keywords = extractHistoryKeywords(ticket.message);
      if (keywords.length === 0) {
        results.push(new MatchResult(ticket.id, "not_found", [], NO_RELATED_CASES_MESSAGE));
        continue;
      }
      docs = this.knowledgeCachePort.searchByTokens(keywords);

      if (docs && docs.length > 0) {
        this.knowledgeCachePort.saveMatch(hash, docs);
        results.push(this.mapToResult(ticket.id, docs));
      } else {
        results.push(new MatchResult(ticket.id, "not_found", [], NO_RELATED_CASES_MESSAGE));
      }
    }

    return results;
  }

  /**
   * Layer 1 historyMap key: English-oriented keywords → alpha-sort (en) → join → MD5.
   */
  private historyCacheKey(message: string): string {
    const keywords = extractHistoryKeywords(message);
    const canonical =
      keywords.length > 0
        ? [...keywords].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).join(" ")
        : `__empty_keywords__:${tokenizeForLayer2(message).join(" ") || foldLatinForSearch(message).replace(/\s+/g, " ").trim() || "_"}`;
    return crypto.createHash("md5").update(canonical).digest("hex");
  }

  private mapToResult(ticketId: string, docs: { markdown_content: string }[]): MatchResult {
    const matches: Match[] = docs.map(d => ({ markdown_content: d.markdown_content }));
    return new MatchResult(ticketId, "success", matches);
  }
}
