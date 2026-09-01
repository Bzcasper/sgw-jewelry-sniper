import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";

import authRoutes from "./routes/auth.js";
import biddersRoutes from "./routes/bidders.js";
import demoRoutes from "./routes/demographics.js";
import healthRoutes from "./routes/health.js";
import scoreRoutes from "./routes/score.js";
import searchRoutes from "./routes/search.js";
import snipeRoutes from "./routes/snipe.js";
import ticksRoutes from "./routes/ticks.js";
import watchRoutes from "./routes/watch.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport: { target: "pino-pretty", options: { colorize: true } },
    },
  });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "SGW Jewelry Sniper API",
        version: "0.1.0",
        description: "Hybrid TS+Rust sniper over buyerapi + Census ACS",
      },
      servers: [{ url: "http://localhost:3000" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list" } });

  // Simple in-memory rate limit 60/min
  const hits = new Map<string, number[]>();
  app.addHook("onRequest", async (req, reply) => {
    const ip = req.ip;
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > 60) {
      reply.code(429).send({ error: "rate_limited", message: "60/min" });
      return;
    }
  });

  await app.register(async (f) => {
    await f.register(healthRoutes, { prefix: "/api/health" });
    await f.register(authRoutes, { prefix: "/api/auth" });
    await f.register(searchRoutes, { prefix: "/api" });
    await f.register(watchRoutes, { prefix: "/api/watch" });
    await f.register(ticksRoutes, { prefix: "/api" });
    await f.register(biddersRoutes, { prefix: "/api" });
    await f.register(demoRoutes, { prefix: "/api/demographics" });
    await f.register(scoreRoutes, { prefix: "/api/score" });
    await f.register(snipeRoutes, { prefix: "/api/snipe" });
  });

  app.get("/", async () => ({ name: "sgw-jewelry-sniper", docs: "/docs", health: "/api/health" }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const port = Number(process.env.PORT || 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening http://localhost:${port} docs http://localhost:${port}/docs`);
}
