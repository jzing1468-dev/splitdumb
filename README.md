# SplitDumb

Group expense splitting app — two versions:

- **Server** (`/server` + `/client`): Traditional client-server architecture with SQLite backend, auth, and admin features
- **P2P** (`/p2p`): Peer-to-peer version using Yjs + Trystero (WebRTC). No server needed — works from a single HTML file.

## Shared Packages

- `core` — Debt calculation, split logic, validators, categories
- `ui` — Shared React components (GroupPage, AddExpense, IdentityPicker, styles)

## Server Version Setup

```bash
cd server && npm install
cp .env.example .env  # Edit with your settings
npm start
```

The client is served via the proxy (`proxy.js`) or can be built and served statically.

```bash
cd client && npm install && npm run dev
```

## P2P Version

```bash
cd p2p && npm install
npm run dev           # Development server
npm run build         # Multi-file build
npx vite build --config vite.config.single.js  # Single HTML file
```

## Environment Variables

See `.env.example` files in `server/` and `client/`.

## License

MIT
