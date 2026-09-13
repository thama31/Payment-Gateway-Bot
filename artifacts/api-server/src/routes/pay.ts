import { Router } from "express";

const router = Router();

router.get("/pay", (req, res) => {
  const ptxn = typeof req.query._ptxn === "string" ? req.query._ptxn : "";

  if (!ptxn) {
    return res.status(400).send("Transaction ID (_ptxn) tidak ditemukan di URL.");
  }

  const clientToken = process.env.PADDLE_CLIENT_TOKEN;
  const paddleEnv = process.env.PADDLE_ENV === "sandbox" ? "sandbox" : "production";
  const botDeepLink = process.env.TELEGRAM_BOT_DEEPLINK || "https://t.me/InnominataBot";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Memproses Pembayaran...</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #0f0f0f;
      color: #eaeaea;
      text-align: center;
    }
    #status { padding: 24px; }
  </style>
</head>
<body>
  <div id="status">Membuka halaman pembayaran...</div>

  <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
  <script>
    Paddle.Environment.set("${paddleEnv}");

    Paddle.Initialize({
      token: "${clientToken}",
      eventCallback: function (event) {
        if (event.name === "checkout.completed") {
          document.getElementById("status").innerText = "Pembayaran berhasil! Mengarahkan kembali ke bot...";
          setTimeout(function () {
            window.location.href = "${botDeepLink}";
          }, 2000);
        }
        if (event.name === "checkout.closed") {
          document.getElementById("status").innerText = "Checkout ditutup. Kembali ke bot untuk mencoba lagi.";
        }
      }
    });

    Paddle.Checkout.open({
      transactionId: "${ptxn}"
    });
  </script>
</body>
</html>`);
});

export default router;