# Chat App (Socket.IO + Express)

## Deployed
https://nexuschat-u5u6.onrender.com/)

Real-time chat application featuring persistent storage (SQLite), input validation, timestamps, chat rooms, and end-to-end tests. Containerized with Docker and ready for CI.

## Features
- Real-time messaging with Socket.IO
- Persistent history via SQLite (`backend/chat.db`)
- Input sanitization and simple rate limiting
- Timestamps (`HH:mm`) on every message
- Integration test using `node:test` + `socket.io-client`
- Dockerfile and `docker-compose.yml` for local containerized run
- CI workflow (`.github/workflows/ci.yml`) to install and run tests
- Chat rooms: `general`, `support`, `random` with room-scoped broadcasting

## Quick Start
- Install deps: `npm install`
- Run locally: `npm run completed` and open `http://localhost:3000/`
- Practice scaffold: `npm run serve`
- Switch rooms using the tabs above the chat window.

## Tests
- Run: `npm test`
- What it does: boots server on `PORT=4000`, posts a message, asserts presence and timestamp.

## Docker
- Build: `docker build -t chat-app .`
- Run: `docker run -p 3000:3000 chat-app`
- Compose: `docker-compose up --build`

## Configuration
- `PORT` env var (default `3000`)
- SQLite file at `backend/chat.db` (auto-created)
  - Schema: `messages(id, username, message, createdAt, room)`
  - Auto-migration: server adds `room` column if missing.

## Deployment (Render/Railway)
- Set `PORT` environment variable.
- Use Node 20 runtime.
- Start command: `node backend/server-completed.js`
- Persist `backend/` folder or configure a managed DB if preferred.

## Architecture
- `backend/server-completed.js`: Express HTTP + Socket.IO server; writes to SQLite; serves `frontend/`.
- `frontend/`: Tailwind UI; Socket.IO client; trims and shows timestamps; renders room tabs and handles switching.
- `backend/tests/`: Integration test for message flow and timestamps.

## Security Notes
- Basic HTML escaping on server; trim and limit length (500 chars).
- Simple per-socket rate limit (300ms).
- For production: add auth, CSRF protection, stricter validation, and logging.
- Room broadcasts are scoped to the active room.

## Socket Events
- `receive-messages`: server → client; payload `{ chatHistory, username?, rooms?, currentRoom? }`
- `post-message`: client → server; payload `{ message }` (trimmed → sanitized → stored with `createdAt`, `room`)
- `join-room`: client → server; payload `{ room }` (switches room and refreshes history)

## Troubleshooting
- If you see a Font Awesome CDN error (`net::ERR_FAILED`), icons may not load, but chat functionality remains unaffected. Replace with local SVGs if desired.
