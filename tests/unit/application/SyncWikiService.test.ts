import { SyncWikiService } from "@application/SyncWikiService";
import { IWikiSourcePort } from "@domain/ports/out/IWikiSourcePort";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { WikiDocument } from "@domain/entities/WikiDocument";

describe("SyncWikiService", () => {
  let service: SyncWikiService;
  let mockSource: jest.Mocked<IWikiSourcePort>;
  let mockCache: jest.Mocked<IKnowledgeCachePort>;

  beforeEach(() => {
    mockSource = { fetchWikiPages: jest.fn() };
    mockCache = {
      save: jest.fn(),
      findExactMatch: jest.fn(),
      saveMatch: jest.fn(),
      searchByTokens: jest.fn(),
    };
    service = new SyncWikiService(mockSource, mockCache);
  });

  it("should fetch documents and save them to cache", async () => {
    const mockDocs = [new WikiDocument({ id: "W1", markdown_content: "Content", tokens: ["content"] })];
    mockSource.fetchWikiPages.mockResolvedValue(mockDocs);

    await service.execute();

    expect(mockSource.fetchWikiPages).toHaveBeenCalled();
    expect(mockCache.save).toHaveBeenCalledWith(mockDocs);
  });

  it("should throw error if fetch fails", async () => {
    mockSource.fetchWikiPages.mockRejectedValue(new Error("Network Error"));

    await expect(service.execute()).rejects.toThrow("Network Error");
  });
});
