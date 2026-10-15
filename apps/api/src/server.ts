import { createServer } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { attachRealtime } from "./realtime.js";

const httpServer = createServer(createApp());
const io = attachRealtime(httpServer);

httpServer.listen(env.port, () => {
  console.log(`api listening on :${env.port}`);
});

// systemd sends SIGTERM on restart/deploy: stop accepting, finish, disconnect.
function shutdown() {
  io.close();
  httpServer.close(async () => {
    await io.drain();
    prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
