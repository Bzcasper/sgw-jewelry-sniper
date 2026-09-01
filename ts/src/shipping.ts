import { calculateShipping } from "./buyerapi.js";

// RULE #6: skip if shipping >30% currentPrice or NOSERVICE (46226 ok, 90210 fails)
export async function shippingGate(itemId: number, currentPrice: number, zip = "46226") {
  const html = await calculateShipping(itemId, zip);
  if (html.includes("RATE.LOCATION.NOSERVICE"))
    return { ok: false, reason: "NOSERVICE", cost: Infinity };
  const m = html.match(/\$([0-9.]+).*GROUND/i);
  const ship = m ? Number(m[1]) : 0;
  const handling = html.includes("$2.00") ? 2 : 0;
  const total = ship + handling;
  const ratio = total / currentPrice;
  return { ok: ratio <= 0.3, cost: total, ratio, html: html.slice(0, 300) };
}
