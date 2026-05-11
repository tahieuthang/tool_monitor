import { Ticket } from "@domain/entities/Ticket";
import { MatchResult } from "@domain/entities/MatchResult";

export interface IMatchWikiUseCase {
  execute(tickets: Ticket[]): Promise<MatchResult[]>
}