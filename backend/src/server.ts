import app from "./app";
import { env } from "./config/env";
import { checkDatabaseConnection } from "./config/prisma";

async function start() {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    // eslint-disable-next-line no-console
    console.warn(
      "[startup] Could not reach PostgreSQL via DATABASE_URL. The server will still start, " +
        "but most endpoints will return 503 until the database is reachable. " +
        "Check DATABASE_URL in backend/.env — see README for remote PostgreSQL setup."
    );
  }

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`AI-MailNlyzer backend listening on port ${env.port} (${env.nodeEnv})`);
  });
}

start();
