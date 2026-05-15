import { Request, Response } from "express";
import { IMatchWikiUseCase } from "@domain/ports/in/IMatchWikiUseCase";
import { Ticket } from "@domain/entities/Ticket";
import { z } from "zod";

const ticketRequestSchema = z.object({
  tickets: z.array(
    z.object({
      id: z.string().min(1),
      message: z.string().min(1),
    })
  ).min(1),
});

export class TicketController {
  constructor(private readonly matchWikiUseCase: IMatchWikiUseCase) { }

  public matchWiki = async (req: Request, res: Response): Promise<void> => {
    // Validate Input
    const parsed = ticketRequestSchema.parse(req.body);

    const domainTickets = parsed.tickets.map(t => new Ticket({ id: t.id, message: t.message }));

    // Execute Use Case
    const results = await this.matchWikiUseCase.execute(domainTickets);

    // Return response
    res.status(200).json({
      results: results.map((r) => {
        const row: { ticket_id: string; matches: typeof r.matches; message?: string } = {
          ticket_id: r.ticket_id,
          matches: r.matches,
        };
        if (r.message !== undefined) {
          row.message = r.message;
        }
        return row;
      }),
    });
  };
}
