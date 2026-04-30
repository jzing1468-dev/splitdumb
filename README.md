# SplitDumb 💸

No-signup expense splitter. Create a group, share the code, split bills.

## Quick Start

### Backend
```bash
cd server
npm install
npm start
# Running on http://localhost:3001
```

### Frontend
```bash
cd client
npm install
npm run dev
# Running on http://localhost:5173
```

## Features

- **No registration** — just create a group and share the code
- **Add members by name** — no accounts needed
- **Equal, exact, or percentage splits** — flexible expense splitting
- **Simplified debts** — minimized number of transactions
- **Settlement tracking** — record and confirm payments
- **Responsive** — works on mobile and desktop

## API

- `POST /api/v1/groups` — Create group
- `GET /api/v1/groups/:code` — Get group (with balances)
- `POST /api/v1/groups/:code/members` — Add member
- `POST /api/v1/groups/:code/expenses` — Add expense
- `DELETE /api/v1/groups/:code/expenses/:id` — Delete expense
- `POST /api/v1/groups/:code/settlements` — Record settlement
- `PATCH /api/v1/groups/:code/settlements/:id` — Confirm/dispute settlement

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **No auth** — group code is access