const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const db = new sqlite3.Database(path.join(__dirname, "chat.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function createRoomId() {
  return crypto.randomBytes(6).toString("hex");
}

function sanitizeName(name) {
  return String(name || "").trim().slice(0, 30);
}

function sanitizeMessage(text) {
  return String(text || "").trim().slice(0, 1000);
}

function getRoomMessages(roomId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, room_id AS roomId, sender_name AS senderName, text, created_at AS createdAt
       FROM messages
       WHERE room_id = ?
       ORDER BY id ASC`,
      [roomId],
      (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      }
    );
  });
}

function ensureRoom(roomId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT id FROM rooms WHERE id = ?", [roomId], (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      if (row) {
        resolve(roomId);
        return;
      }

      db.run(
        "INSERT INTO rooms (id, created_at) VALUES (?, ?)",
        [roomId, new Date().toISOString()],
        (insertError) => {
          if (insertError) {
            reject(insertError);
            return;
          }

          resolve(roomId);
        }
      );
    });
  });
}

app.post("/api/rooms", (req, res) => {
  const roomId = createRoomId();

  db.run(
    "INSERT INTO rooms (id, created_at) VALUES (?, ?)",
    [roomId, new Date().toISOString()],
    (error) => {
      if (error) {
        res.status(500).json({ error: "Xona yaratilmadi." });
        return;
      }

      res.status(201).json({ roomId, url: `/room/${roomId}` });
    }
  );
});

app.get("/api/rooms/:roomId/messages", async (req, res) => {
  try {
    await ensureRoom(req.params.roomId);
    const messages = await getRoomMessages(req.params.roomId);
    res.json({ roomId: req.params.roomId, messages });
  } catch (error) {
    res.status(500).json({ error: "Xabarlarni olishda xatolik yuz berdi." });
  }
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-room", async ({ roomId, userName }) => {
    const safeName = sanitizeName(userName);
    const safeRoomId = String(roomId || "").trim();

    if (!safeName || !safeRoomId) {
      socket.emit("chat-error", "Ism va xona kerak.");
      return;
    }

    try {
      await ensureRoom(safeRoomId);
      socket.data.userName = safeName;
      socket.data.roomId = safeRoomId;
      socket.join(safeRoomId);

      const messages = await getRoomMessages(safeRoomId);
      socket.emit("room-history", { roomId: safeRoomId, messages });
    } catch (error) {
      socket.emit("chat-error", "Xonaga ulanishda xatolik yuz berdi.");
    }
  });

  socket.on("send-message", ({ text }) => {
    const safeText = sanitizeMessage(text);
    const roomId = socket.data.roomId;
    const senderName = socket.data.userName;

    if (!roomId || !senderName || !safeText) {
      socket.emit("chat-error", "Xabar yuborilmadi.");
      return;
    }

    const message = {
      roomId,
      senderName,
      text: safeText,
      createdAt: new Date().toISOString()
    };

    db.run(
      `INSERT INTO messages (room_id, sender_name, text, created_at)
       VALUES (?, ?, ?, ?)`,
      [message.roomId, message.senderName, message.text, message.createdAt],
      function onInsert(error) {
        if (error) {
          socket.emit("chat-error", "Xabar saqlanmadi.");
          return;
        }

        io.to(roomId).emit("new-message", {
          id: this.lastID,
          ...message
        });
      }
    );
  });
});

server.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} da ishga tushdi`);
});
