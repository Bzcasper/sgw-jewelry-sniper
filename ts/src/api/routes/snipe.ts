import type { FastifyInstance } from "fastify";

import { showBidModal, placeBid, serverOffsetMs } from "../../buyerapi.js";
import db from "../../db.js";

export default async function snipeRoutes(f: FastifyInstance) {
  f.post("/", async (req, reply) => {
    const { items, fireBeforeMs } = req.body as any;
    if (!Array.isArray(items) || !items.length)
      return reply.code(400).send({ error: "items [{itemId,sellerId?,max}] required, 1-5" });
    if (items.length > 5) return reply.code(400).send({ error: "max 5 per spec" });
    const bearer = (req.headers.authorization || "").replace("Bearer ", "");
    if (!bearer) return reply.code(401).send({ error: "Bearer required" });

    const off = await serverOffsetMs().catch(() => 0);
    const runs: any[] = [];
    for (const it of items) {
      const modal = await showBidModal(Number(it.itemId)).catch((_e: any) => null);
      if (!modal) {
        runs.push({ itemId: it.itemId, error: "modal failed" });
        continue;
      }
      const sellerId = it.sellerId || modal.sellerId;
      const max = Number(it.max);
      if (max < modal.minimumBid) {
        runs.push({ itemId: it.itemId, skipped: "max<minimumBid", minimumBid: modal.minimumBid });
        continue;
      }
      // For API snipe we do immediate fire if within 10s of end, else queue via Rust/TS executor (here immediate PlaceBid for demo)
      // Real last-second is via Rust executor; this endpoint does immediate snipe for testing with fireBeforeMs
      const endMs = Date.parse(modal.endTime) + off;
      const fireAt = endMs - Number(fireBeforeMs || 900);
      const wait = fireAt - Date.now();
      if (wait > 10000) {
        // queue future — just log, caller should schedule
        runs.push({
          itemId: it.itemId,
          queued: true,
          fireAt: new Date(fireAt).toISOString(),
          minimumBid: modal.minimumBid,
          max,
        });
        continue;
      }
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // Use bearer via temp axios header
      const { api } = await import("../../buyerapi.js");
      const prev = api.defaults.headers.common["Authorization"];
      api.defaults.headers.common["Authorization"] = `Bearer ${bearer}`;
      const resp = await placeBid({
        itemId: Number(it.itemId),
        sellerId,
        quantity: 1,
        bidAmount: Math.max(modal.minimumBid, max),
      }).catch((_e: any) => ({
        status: false,
        result: -1,
        message: (_e).response?.data?.message || (_e).message,
      }));
      api.defaults.headers.common["Authorization"] = prev;
      // audit
      try {
        db.prepare(
          `INSERT INTO sniper_runs(itemId,fireAt,fireBeforeMs,offsetMs,bidAmount,responseResult,responseMessage,latencyMs) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          Number(it.itemId),
          new Date().toISOString(),
          Number(fireBeforeMs || 900),
          off,
          max,
          (resp as any).result ?? null,
          (resp as any).message ?? null,
          0,
        );
      } catch {}
      runs.push({ itemId: it.itemId, resp });
    }
    return { runs };
  });

  f.get("/runs", async (req) => {
    const q = req.query as any;
    const rows = db
      .prepare(`SELECT * FROM sniper_runs ORDER BY createdAt DESC LIMIT ?`)
      .all(Math.min(Number(q.limit || 20), 100));
    return rows;
  });

  f.post("/dry", async (req) => {
    const { itemId, max } = req.body as any;
    const modal = await showBidModal(Number(itemId));
    // dry with FIRE_BEFORE 9000, expect -4/-5 not win, no auth needed for modal
    return { modal, wouldBid: Number(max) >= modal.minimumBid, max, minimumBid: modal.minimumBid };
  });
}
