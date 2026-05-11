import { Request, Response, NextFunction } from "express";
import { logger } from "@infrastructure/logger";
import { InvalidDataError } from "@domain/errors/InvalidDataError";
import { TicketNotFoundError } from "@domain/errors/TicketNotFoundError";
import { ZodError } from "zod";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation Error", details: err.issues });
    return;
  }

  if (err instanceof InvalidDataError) {
    res.status(400).json({ error: "Bad Request", message: err.message });
    return;
  }

  if (err instanceof TicketNotFoundError) {
    res.status(404).json({ error: "Not Found", message: err.message });
    return;
  }

  // Fallback for internal errors
  logger.error(err, "Unhandled Exception");
  res.status(500).json({ error: "Internal Server Error" });
};
