import * as Sentry from "@sentry/node";
import express, { type NextFunction, type Request, type Response } from "express";
import { checkOrigin, loadUser } from "./auth.js";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { roundsRouter } from "./routes/rounds.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // one proxy hop (Render's edge): use X-Forwarded-For for rate limiting

  // CORS for the web app, with credentials (session cookie).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && env.webOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "600");
        return void res.status(204).end();
      }
    }
    next();
  });

  app.use(express.json({ limit: "100kb" }));
  app.use(checkOrigin);
  app.use(loadUser);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter);
  app.use("/rounds", roundsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  if (env.sentryDsn) Sentry.setupExpressErrorHandler(app);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) return void res.status(400).json({ error: "Malformed JSON" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}
