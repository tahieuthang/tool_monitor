import { Router, Request, Response, NextFunction } from "express";
import { container } from "@infrastructure/di_container";
import { config } from "@infrastructure/config";

export const apiRouter = Router();

// Static token: Authorization: Bearer <API_SECRET_TOKEN> (shared secret, not JWT)
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers.authorization?.trim();
    if (!raw) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const m = /^Bearer\s+(.+)$/i.exec(raw);
    const presented = m?.[1]?.trim() ?? "";
    if (!presented || presented !== config.API_SECRET_TOKEN) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
};

apiRouter.post("/tickets/match-wiki", requireAuth, container.ticketController.matchWiki);
