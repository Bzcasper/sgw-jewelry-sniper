import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { api } from "../../buyerapi.js";

export default async function authRoutes(f: FastifyInstance) {
  f.post("/login", async (req, _reply) => {
    const body = z
      .object({ username: z.string(), password: z.string(), clientIp: z.string().optional() })
      .parse(req.body);
    const { data } = await api.post("SignIn/Login", {
      username: body.username,
      password: body.password,
      clientIpAddress: body.clientIp || "1.1.1.1",
    });
    return data;
  });
  f.post("/refresh", async (req) => {
    const body = z
      .object({ refreshToken: z.string(), clientIp: z.string().optional() })
      .parse(req.body);
    const { data } = await api.post("SignIn/RefreshToken", {
      refreshToken: body.refreshToken,
      clientIpAddress: body.clientIp || "1.1.1.1",
    });
    return data;
  });
  f.get("/me", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth) return reply.code(401).send({ error: "no_bearer" });
    const { data } = await api.get("ManageProfile/Get", {
      headers: { Authorization: auth } as any,
    });
    return data;
  });
}
