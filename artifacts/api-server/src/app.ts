import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Innominata Bot — Online</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       background:#0E1525;color:#fff;text-align:center;padding:24px}
  .card{max-width:420px}
  h1{font-size:28px;margin:0 0 12px}
  p{opacity:.7;line-height:1.5;margin:6px 0}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;
       background:#22c55e;margin-right:8px;box-shadow:0 0 12px #22c55e}
  a{color:#F26207;text-decoration:none}
</style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>Bot Online</h1>
    <p>Innominata Payment Gateway Bot berjalan 24/7.</p>
    <p>Buka di Telegram: <a href="https://t.me/innominatabot">@innominatabot</a></p>
  </div>
</body>
</html>`);
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
