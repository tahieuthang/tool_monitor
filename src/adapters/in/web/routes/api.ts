import { Router, Request, Response, NextFunction } from "express";
import { container } from "@infrastructure/di_container";
import { config } from "@infrastructure/config";

export const apiRouter = Router();

// Simple Auth Middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${config.API_KEY}`;

    if (!authHeader || authHeader !== expected) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
};

apiRouter.post("/tickets/match-wiki", requireAuth, container.ticketController.matchWiki);
