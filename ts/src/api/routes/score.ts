import type { FastifyInstance } from "fastify";

import { bidderExpectation, jewelryFlipScore } from "../../algorithm.js";
import { calculateShipping } from "../../buyerapi.js";

export default async function scoreRoutes(f: FastifyInstance) {
  f.post("/flip", async (req) => {
    const { itemId, zip, closedMedian, numBids, views } = req.body as any;
    const { api } = await import("../../buyerapi.js");
    const detail = await api
      .get(`ItemDetail/GetItemDetailModelByItemId/${itemId}`)
      .then((r) => r.data)
      .catch(() => ({ currentPrice: 0, minimumBid: 0 }));
    const shipping = zip
      ? await calculateShipping(Number(itemId), String(zip))
          .then((html) => {
            const m = html.match(/\$([0-9.]+).*GROUND/i);
            const s = m ? Number(m[1]) : 0;
            return s + (html.includes("$2.00") ? 2 : 0);
          })
          .catch(() => 5)
      : 5;
    // mock demo for flip scoring
    const { scoreDemographics } = await import("../../algorithm.js");
    const demo = scoreDemographics({
      z: {
        medianHHIncome: 90000,
        perCapitaIncome: 40000,
        medianHomeValue: 300000,
        whitePct: 80,
        medianAge: 45,
      },
      county: {
        medianHHIncome: 60000,
        perCapitaIncome: 30000,
        medianHomeValue: 180000,
        whitePct: 70,
        medianAge: 38,
      },
      state: {
        medianHHIncome: 55000,
        perCapitaIncome: 28000,
        medianHomeValue: 170000,
        whitePct: 68,
        medianAge: 37,
      },
    } as any);
    const flip = jewelryFlipScore({
      currentPrice: detail.currentPrice ?? 0,
      minimumBid: detail.minimumBid ?? 0,
      shippingCost: shipping,
      closedMedian: closedMedian ?? null,
      demo,
      peer: { maxP: 0.3, threat: "low" },
      numBids: numBids ?? detail.numBids ?? 0,
      views: views ?? 0,
    });
    return {
      flip,
      detail: { currentPrice: detail.currentPrice, minimumBid: detail.minimumBid },
      shipping,
      demo: { bonus: demo.bonus, composite: demo.composite },
    };
  });
  f.post("/bidder", async (req) => {
    const { username, currentPrice, currentMinimum, features } = req.body as any;
    // features: {bidsCount,wins,avgMarkup,lastSecondPct,sellerAffinity,jewelryAffinity,recencyHours}
    const exp = bidderExpectation(
      features || {
        bidsCount: 5,
        wins: 1,
        avgMarkup: 0.08,
        lastSecondPct: 0.5,
        sellerAffinity: 0.3,
        jewelryAffinity: 0.5,
        recencyHours: 10,
      },
      Number(currentPrice || 20),
      Number(currentMinimum || 21),
    );
    return { username, ...exp };
  });
}
