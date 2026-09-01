import type { FastifyInstance } from "fastify";

import db from "../../db.js";
export default async function biddersRoutes(f: FastifyInstance) {
  f.get("/bidders/:username", async (req, reply) => {
    const { username } = req.params as any;
    const row = db.prepare(`SELECT * FROM bidders WHERE username=?`).get(username);
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
  f.get("/bidders", async (req) => {
    const q = req.query as any;
    const rows = db
      .prepare(`SELECT * FROM bidders ORDER BY bidsCount DESC LIMIT ?`)
      .all(Math.min(Number(q.limit || 20), 100));
    return rows;
  });
}
