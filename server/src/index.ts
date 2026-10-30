import express, { type NextFunction, type Request, type Response } from "express";
import { planRouter } from "./routes/plan.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

/** Browser origins allowed to call the API: the configured Vercel URL, plus local Vite in development. */
const allowedOrigins = new Set(
  [process.env.CLIENT_ORIGIN, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"])]
    .flatMap((o) => (o ? o.split(",") : []))
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

app.disable("x-powered-by");

// Render sits in front of the app and sets X-Forwarded-For; trust exactly its hop count so req.ip is the
// real client and a caller can't spoof their own IP. TRUST_PROXY_HOPS overrides once the deployed header is checked.
const hops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.RENDER ? 1 : 0));
if (hops > 0) app.set("trust proxy", hops);
let ipLogged = false;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "Retry-After, RateLimit, RateLimit-Policy");
  }
  if (req.method === "OPTIONS") return void res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  next();
});
// Small bodies everywhere except the photo upload, which brings its own larger limit.
const smallJson = express.json({ limit: "32kb" });
app.use((req, res, next) => (req.path === "/api/snap" ? next() : smallJson(req, res, next)));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Temporary deploy check (DEBUG_IP=1): log once what Render forwards versus the IP the limiter will use.
app.use("/api", (req, _res, next) => {
  if (process.env.DEBUG_IP && !ipLogged) {
    ipLogged = true;
    console.log(`[ip] x-forwarded-for="${req.headers["x-forwarded-for"] ?? ""}" req.ip="${req.ip}" trustProxyHops=${hops}`);
  }
  next();
});
// Each API route carries its own limiter (see routes/plan.ts).
app.use("/api", planRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Never send stack traces, provider bodies, or keys to the browser.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof (err as any)?.status === "number" && (err as any).status < 500 ? (err as any).status : 500;
  if (status >= 500) console.error("[server]", err instanceof Error ? err.message : err);
  res.status(status).json({ error: status === 400 ? "bad_request" : "server_error" });
});

app.listen(port, () => {
  console.log(`Cozy Night Planner API on http://localhost:${port}`);
});
