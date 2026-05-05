# SplitDumb P2P

Peer-to-peer expense splitting — no server needed.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Single-File Build

```bash
npm run build:single
```

Outputs a self-contained HTML file in `dist-single/` that you can share directly. Anyone opens it in a browser and it works.

## How It Works

- **Yjs** — CRDT-based state sync (conflict-free)
- **Trystero** — WebRTC peer discovery via BitTorrent trackers
- **IndexedDB** — Local persistence (data survives page reload)

Share a link like `?group=ABC123` — both peers connect and sync automatically.

## Tech Stack

- React + Vite
- Yjs (CRDT)
- Trystero (WebRTC via BitTorrent DHT)
- y-indexeddb (persistence)

## License

MIT