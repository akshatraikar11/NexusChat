// imports required for server
import { uniqueNamesGenerator, colors, names } from "unique-names-generator";
import express from "express";
import http from "http";
import Database from "better-sqlite3";

// import the socket.io library
import { Server } from "socket.io";

// initializing the servers: HTTP as well as Web Socket
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// initialize SQLite database
const db = new Database(process.cwd() + "/backend/chat.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT 'general'
  );
`);

// try to add room column for existing databases (no-op if already present)
try {
  db.prepare("ALTER TABLE messages ADD COLUMN room TEXT NOT NULL DEFAULT 'general'").run();
} catch (e) {
  // ignore if column already exists
}

// create the chat history array for storing messages
const chatHistory = [];
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_RATE_MS = 300;
const ALLOWED_ROOMS = ["general", "support", "random"];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const CLEAR_RATE_MS = 5000; // minimum interval between clears per socket
const MAX_USERNAME_LENGTH = 32;
const NAME_RATE_MS = 1000;

// listen for new web socket connections
io.on("connection", function callback(socket) {
  let username = getUniqueUsername();
  console.log(`${username} connected`);
  let lastSentAt = 0;
  let lastClearAt = 0;
  let lastNameSetAt = 0;

  // default room handling
  let currentRoom = "general";
  socket.join(currentRoom);

  // send initial payload scoped to room
  socket.emit("receive-messages", {
    chatHistory: getMessagesByRoom(currentRoom),
    username,
    rooms: ALLOWED_ROOMS,
    currentRoom,
  });

  // message posting scoped to current room
  socket.on("post-message", function receiveMessages(data) {
    const { message } = data || { message: "" };
    const now = Date.now();
    if (now - lastSentAt < MESSAGE_RATE_MS) {
      return; // simple rate limit per socket
    }
    lastSentAt = now;

    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return;

    const safeTextRaw = text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH) : text;
    const safeText = sanitize(safeTextRaw);

    const createdAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO messages (username, message, createdAt, room) VALUES (?, ?, ?, ?)"
    ).run(username, safeText, createdAt, currentRoom);

    // broadcast updated room history only to clients in that room
    io.to(currentRoom).emit("receive-messages", {
      chatHistory: getMessagesByRoom(currentRoom),
      rooms: ALLOWED_ROOMS,
      currentRoom,
    });
  });

  // room switching
  socket.on("join-room", (payload) => {
    const { room } = payload || {};
    const requested = sanitizeRoom(room);
    if (!requested || !ALLOWED_ROOMS.includes(requested)) return;

    if (requested === currentRoom) return; // no-op

    socket.leave(currentRoom);
    currentRoom = requested;
    socket.join(currentRoom);

    socket.emit("receive-messages", {
      chatHistory: getMessagesByRoom(currentRoom),
      rooms: ALLOWED_ROOMS,
      currentRoom,
    });
  });

  // allow users to set their own display name
  socket.on("set-username", (payload, ack) => {
    try {
      const now = Date.now();
      if (now - lastNameSetAt < NAME_RATE_MS) {
        if (typeof ack === "function") ack({ ok: false, error: "Rate limited. Try again shortly." });
        return;
      }
      lastNameSetAt = now;

      const desiredRaw = payload && payload.username;
      const desired = sanitizeName(desiredRaw);
      if (!desired) {
        if (typeof ack === "function") ack({ ok: false, error: "Name cannot be empty." });
        return;
      }
      const trimmed = desired.slice(0, MAX_USERNAME_LENGTH);
      const safe = sanitize(trimmed);
      username = safe;
      console.log(`[username] socket=${socket.id} set name to '${username}'`);
      if (typeof ack === "function") ack({ ok: true, username });
    } catch (e) {
      console.error("Error in set-username:", e);
      if (typeof ack === "function") ack({ ok: false, error: "Unexpected error." });
    }
  });

  // verify admin token (no side effects)
  socket.on("verify-admin", (payload, ack) => {
    const { token } = payload || {};
    const ok = Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
    if (typeof ack === "function") ack({ ok });
  });

  // admin-only: clear messages in a room
  socket.on("clear-room", (payload, ack) => {
    const { room, token } = payload || {};
    const now = Date.now();
    if (now - lastClearAt < CLEAR_RATE_MS) {
      if (typeof ack === "function") ack({ ok: false, error: "Rate limited. Try again later." });
      return;
    }

    const requested = sanitizeRoom(typeof room === "string" ? room : currentRoom);
    if (!requested || !ALLOWED_ROOMS.includes(requested)) {
      if (typeof ack === "function") ack({ ok: false, error: "Invalid room." });
      return;
    }

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      if (typeof ack === "function") ack({ ok: false, error: "Unauthorized." });
      return;
    }

    lastClearAt = now;
    try {
      db.prepare("DELETE FROM messages WHERE room = ?").run(requested);
      console.log(`${username} cleared room '${requested}' at ${new Date().toISOString()}`);
      io.to(requested).emit("receive-messages", {
        chatHistory: getMessagesByRoom(requested),
        rooms: ALLOWED_ROOMS,
        currentRoom: requested,
      });
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: "Failed to clear room." });
    }
  });

  // listen for disconnects and log them
  socket.on("disconnect", () => {
    console.log(`${username} disconnected`);
  });
});

// Boilerplate code as well as Bonus section
// HTTP server setup to serve the page assets
app.use(express.static(process.cwd() + "/frontend"));

// HTTP server setup to serve the page at /
app.get("/", (req, res) => {
  return res.sendFile(process.cwd() + "/frontend/index.html");
});

// start the HTTP server to serve the page
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`);
});

// helper functions
// get messages for a room in newest-first order
function getMessagesByRoom(room) {
  const rows = db
    .prepare(
      "SELECT id, username, message, createdAt FROM messages WHERE room = ? ORDER BY id DESC LIMIT 100"
    )
    .all(room);
  return rows;
}

// generate a unique username for each user
function getUniqueUsername() {
  return uniqueNamesGenerator({
    dictionaries: [names, colors],
    length: 2,
    style: "capital",
    separator: " ",
  });
}

function sanitize(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeRoom(str) {
  if (typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "");
}

// sanitize user-provided display names
function sanitizeName(str) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ");
}