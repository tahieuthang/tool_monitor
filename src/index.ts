import { app } from "@infrastructure/server";
import { config } from "@infrastructure/config";
import { logger } from "@infrastructure/logger";
import { container } from "@infrastructure/di_container";

const PORT = parseInt(config.PORT, 10);

const startServer = async () => {
    try {
        // Initial Sync before accepting traffic
        await container.syncWikiService.execute();

        // Schedule periodic sync (every 60 mins)
        const syncInterval = setInterval(() => {
            container.syncWikiService.execute().catch(e => logger.error(e, "Periodic sync failed"));
        }, 60 * 60 * 1000);

        const server = app.listen(PORT, () => {
            logger.info(`🚀 Wiki-Lens Server is running on port ${PORT}`);
        });

        // Graceful shutdown
        const shutdown = () => {
            logger.info("Graceful shutdown initiated...");
            clearInterval(syncInterval);
            server.close(() => {
                logger.info("Server closed.");
                process.exit(0);
            });
            // Force close after 10s
            setTimeout(() => process.exit(1), 10000);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

    } catch (error) {
        logger.fatal(error, "Failed to start server");
        process.exit(1);
    }
};

startServer();
