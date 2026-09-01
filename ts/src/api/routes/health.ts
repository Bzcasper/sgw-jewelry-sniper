import type { FastifyInstance } from "fastify";

import { cfg } from "../../config.js";
import db from "../../db.js";
export default async function healthRoutes(f: FastifyInstance) {
  f.get("/", async () => {
    let dbOk = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch (e: any) {
      dbOk = e.message;
    }
    const census = cfg.censusKey && cfg.censusKey !== "DEMO_KEY" ? "ok" : "mock";
    return { status: "ok", uptime: process.uptime(), db: dbOk, census, version: "0.1.0" };
  });
}
