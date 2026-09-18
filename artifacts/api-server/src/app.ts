import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { router } from "./radar";
const app: Express = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (process.env.NODE_ENV === "production")
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use(express.json({ limit: "3mb" }));
app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta inexistente." });
});
const publicPath = path.resolve(
  process.env.RADAR_PUBLIC_DIR || "artifacts/2blea-radar/dist/public",
);
if (existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: err.issues.map((i) => i.message).join(" ") });
      return;
    }
    const status = err.status || 500;
    if (status >= 500)
      console.error("Radar request failed", err.code || err.name); // no request bodies, credentials or connection strings
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "No se pudo guardar o cargar la información. Revisá la configuración del servidor e intentá nuevamente."
            : err.message,
        details: err.details,
      });
  },
);
export default app;
