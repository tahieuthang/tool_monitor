import express from "express";
import cors from "cors";
import { apiRouter } from "@adapters/in/web/routes/api";
import { errorHandler } from "@infrastructure/error_handler";

export const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", apiRouter);

// Global Error Handler (must be after routes)
app.use(errorHandler);
