import { TicketController } from "@adapters/in/web/controllers/TicketController";
import { IMatchWikiUseCase } from "@domain/ports/in/IMatchWikiUseCase";
import { Request, Response } from "express";
import { MatchResult } from "@domain/entities/MatchResult";

describe("TicketController", () => {
  let controller: TicketController;
  let mockUseCase: jest.Mocked<IMatchWikiUseCase>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonFn: jest.Mock;
  let statusFn: jest.Mock;

  beforeEach(() => {
    mockUseCase = { execute: jest.fn() };
    controller = new TicketController(mockUseCase);
    
    jsonFn = jest.fn();
    statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    mockRes = {
      status: statusFn,
    };
  });

  it("should return 200 and matches for valid request", async () => {
    mockReq = {
      body: {
        tickets: [{ id: "T1", message: "Problem with LMS" }]
      }
    };

    const mockResult = new MatchResult("T1", "success", [{ markdown_content: "LMS Guide" }]);
    mockUseCase.execute.mockResolvedValue([mockResult]);

    await controller.matchWiki(mockReq as Request, mockRes as Response);

    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith({
      results: [
        {
          ticket_id: "T1",
          matches: [{ markdown_content: "LMS Guide" }]
        }
      ]
    });
  });

  it("should throw error if tickets array is empty", async () => {
    mockReq = {
      body: { tickets: [] }
    };

    await expect(controller.matchWiki(mockReq as Request, mockRes as Response))
      .rejects.toThrow(); // Zod error
  });
});
