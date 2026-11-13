// Fails fast (instead of letting Next.js pick another port) when port 3100 is taken.
// 3100, not 3000, so TradeDesk can run next to CashFlow Planner.
import net from "node:net";

const PORT = 3100;
const server = net.createServer();

server.once("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n[tradedesk] Port ${PORT} is already in use.\n` +
        `TradeDesk must run on http://localhost:${PORT}. Stop the other process and try again.\n` +
        `  Windows:     netstat -ano | findstr :${PORT}   then   taskkill /PID <pid> /F\n` +
        `  macOS/Linux: lsof -i :${PORT}                   then   kill <pid>\n`
    );
  } else {
    console.error(`[tradedesk] Could not check port ${PORT}:`, err.message);
  }
  process.exit(1);
});

server.once("listening", () => server.close(() => process.exit(0)));
server.listen(PORT);
