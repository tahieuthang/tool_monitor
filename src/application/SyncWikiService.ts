import { ISyncWikiUseCase } from "@domain/ports/in/ISyncWikiUseCase";
import { IWikiSourcePort } from "@domain/ports/out/IWikiSourcePort";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { logger } from "@infrastructure/logger";

export class SyncWikiService implements ISyncWikiUseCase {
  constructor(
    private readonly wikiSourcePort: IWikiSourcePort,
    private readonly knowledgeCachePort: IKnowledgeCachePort
  ) { }

  public async execute(): Promise<void> {
    try {
      logger.info("Starting Sync Flow...");
      const documents = await this.wikiSourcePort.fetchWikiPages();

      // Atomic update to cache
      this.knowledgeCachePort.save(documents);

      logger.info(`Sync Flow completed. Loaded ${documents.length} cases into RAM.`);
    } catch (error) {
      logger.error(error, "Sync Flow failed");
      throw error;
    }
  }
}
