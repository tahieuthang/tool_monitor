import { IMatchWikiUseCase } from "@domain/ports/in/IMatchWikiUseCase";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { Ticket } from "@domain/entities/Ticket";
import { MatchResult, Match } from "@domain/entities/MatchResult";
import * as crypto from "crypto";

export class MatchWikiService implements IMatchWikiUseCase {
  constructor(private readonly knowledgeCachePort: IKnowledgeCachePort) { }

  public async execute(tickets: Ticket[]): Promise<MatchResult[]> {
    const results: MatchResult[] = [];

    for (const ticket of tickets) {
      const hash = crypto.createHash("md5").update(ticket.message).digest("hex");

      // Layer 1: Exact Match
      let docs = this.knowledgeCachePort.findExactMatch(hash);

      if (docs && docs.length > 0) {
        // Layer 1 hit
        results.push(this.mapToResult(ticket.id, docs));
        continue;
      }

      // Layer 2: Inverted Index Match
      const tokens = this.tokenize(ticket.message);
      docs = this.knowledgeCachePort.searchByTokens(tokens, 3); // top 3

      if (docs && docs.length > 0) {
        // Cache it for Layer 1 next time
        this.knowledgeCachePort.saveMatch(hash, docs);
        results.push(this.mapToResult(ticket.id, docs));
      } else {
        results.push(new MatchResult(ticket.id, "not_found", []));
      }
    }

    return results;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 2); // basic stop-words/short-words filtering
  }

  private mapToResult(ticketId: string, docs: { markdown_content: string }[]): MatchResult {
    const matches: Match[] = docs.map(d => ({ markdown_content: d.markdown_content }));
    return new MatchResult(ticketId, "success", matches);
  }
}
