import { RamKnowledgeCacheAdapter } from "@adapters/out/cache/RamKnowledgeCacheAdapter";
import { GithubWikiAdapter } from "@adapters/out/github/GithubWikiAdapter";
import { MatchWikiService } from "@application/MatchWikiService";
import { SyncWikiService } from "@application/SyncWikiService";
import { TicketController } from "@adapters/in/web/controllers/TicketController";

// Singletons
const cacheAdapter = new RamKnowledgeCacheAdapter();
const githubAdapter = new GithubWikiAdapter();

const matchWikiService = new MatchWikiService(cacheAdapter);
const syncWikiService = new SyncWikiService(githubAdapter, cacheAdapter);

const ticketController = new TicketController(matchWikiService);

export const container = {
    matchWikiService,
    syncWikiService,
    ticketController
};
