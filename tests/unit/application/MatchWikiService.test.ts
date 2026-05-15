import { MatchWikiService } from "@application/MatchWikiService";
import { IKnowledgeCachePort } from "@domain/ports/out/IKnowledgeCachePort";
import { Ticket } from "@domain/entities/Ticket";
import { WikiDocument } from "@domain/entities/WikiDocument";

describe("MatchWikiService", () => {
  let service: MatchWikiService;
  let mockCache: jest.Mocked<IKnowledgeCachePort>;

  beforeEach(() => {
    mockCache = {
      save: jest.fn(),
      findExactMatch: jest.fn(),
      saveMatch: jest.fn(),
      searchByTokens: jest.fn(),
    };
    service = new MatchWikiService(mockCache);
  });

  it("should return cached results if Layer 1 hits", async () => {
    const ticket = new Ticket({ id: "T1", message: "Error in LMS" });
    const mockDoc = new WikiDocument({ id: "W1", markdown_content: "LMS Fix", tokens: ["lms"] });
    mockCache.findExactMatch.mockReturnValue([mockDoc]);

    const results = await service.execute([ticket]);

    expect(results[0].status).toBe("success");
    expect(results[0].matches[0].markdown_content).toBe("LMS Fix");
    expect(mockCache.searchByTokens).not.toHaveBeenCalled();
  });

  it("should search in Layer 2 if Layer 1 misses", async () => {
    const ticket = new Ticket({ id: "T1", message: "Error in LMS" });
    const mockDoc = new WikiDocument({ id: "W1", markdown_content: "LMS Fix", tokens: ["lms"] });
    
    mockCache.findExactMatch.mockReturnValue(null);
    mockCache.searchByTokens.mockReturnValue([mockDoc]);

    const results = await service.execute([ticket]);

    expect(results[0].status).toBe("success");
    expect(mockCache.saveMatch).toHaveBeenCalled();
  });

  it("should return not_found if no matches are found in Layer 2", async () => {
    const ticket = new Ticket({ id: "T1", message: "Unknown problem" });
    
    mockCache.findExactMatch.mockReturnValue(null);
    mockCache.searchByTokens.mockReturnValue([]);

    const results = await service.execute([ticket]);

    expect(results[0].status).toBe("not_found");
  });
});
