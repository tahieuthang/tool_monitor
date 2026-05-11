import { SyncWikiService } from "./SyncWikiService";
import { IWikiSourcePort } from "@domain/ports/out/IWikiSourcePort";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { WikiDocument } from "@domain/entities/WikiDocument";

describe("SyncWikiService", () => {
    let mockWikiSourcePort: jest.Mocked<IWikiSourcePort>;
    let mockCachePort: jest.Mocked<IKnowledgeCachePort>;
    let syncWikiService: SyncWikiService;

    beforeEach(() => {
        mockWikiSourcePort = {
            fetchWikiPages: jest.fn(),
        };
        mockCachePort = {
            save: jest.fn(),
            findExactMatch: jest.fn(),
            saveMatch: jest.fn(),
            searchByTokens: jest.fn()
        };
        syncWikiService = new SyncWikiService(mockWikiSourcePort, mockCachePort);
    });

    it("should fetch documents and save to cache", async () => {
        const dummyDocs = [new WikiDocument({ id: "1", markdown_content: "test", tokens: ["test"] })];
        mockWikiSourcePort.fetchWikiPages.mockResolvedValue(dummyDocs);

        await syncWikiService.execute();

        expect(mockWikiSourcePort.fetchWikiPages).toHaveBeenCalledTimes(1);
        expect(mockCachePort.save).toHaveBeenCalledWith(dummyDocs);
    });
});
