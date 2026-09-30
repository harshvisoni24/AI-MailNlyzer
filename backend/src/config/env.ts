import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[config] Missing environment variable: ${name}`);
    return "";
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev_only_change_me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000",
  aiServiceApiKey: process.env.AI_SERVICE_API_KEY ?? "",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
  retentionDefaultDays: Number(process.env.RETENTION_DEFAULT_DAYS ?? 90),
};
