import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { checkDatabaseConnection } from "./config/prisma";
import { checkAiServiceHealth } from "./services/aiServiceClient";
import apiRoutes from "./routes/index";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use("/api", globalLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use("/api/auth/login", authLimiter);

app.get("/health", async (_req, res) => {
  const dbOk = await checkDatabaseConnection();
  const aiOk = await checkAiServiceHealth();
  res.json({
    status: "ok",
    service: "ai-mailnlyzer-backend",
    dependencies: { database: dbOk ? "up" : "down", aiService: aiOk ? "up" : "down" },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
