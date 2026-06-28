# PokerWise — Poker Night Money Tracker

Track poker session buy-ins, rebuys, and cash-outs. Calculate who owes who at the end of the night.

## Architecture
- **Server:** Express + sql.js (SQLite WASM) on port 3010
- **Client:** Vite + React 19 + react-router-dom v7, base `/pokerwise/`
- **Proxy:** Node http server on port 7790, serves static + proxies API
- **Core:** Shared logic (debt simplification, colors)

## Development
```bash
cd client && npm install
cd server && npm install
cd client && npm run build
node server/index.js   # terminal 1
node proxy/proxy.js    # terminal 2
# visit http://localhost:7790/pokerwise/
```