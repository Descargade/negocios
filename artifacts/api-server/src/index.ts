import app from "./app";
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT inválido.");
app.listen(port, "0.0.0.0", () =>
  console.info("2bleA Radar disponible en puerto " + port),
);
