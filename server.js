const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("data.json o'qilmadi:", error.message);
  }

  return { rooms: {}, messages: [], nextId: 1 };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

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
  return data.messages
    .filter((message) => message.roomId === roomId)
    .sort((a, b) => a.id - b.id);
}

function ensureRoom(roomId) {
  if (!data.rooms[roomId]) {
    data.rooms[roomId] = { createdAt: new Date().toISOString() };
    saveData(data);
  }

  return roomId;
}

app.post("/api/rooms", (req, res) => {
  const roomId = createRoomId();
  data.rooms[roomId] = { createdAt: new Date().toISOString() };
  saveData(data);
  res.status(201).json({ roomId, url: `/room/${roomId}` });
});

app.get("/api/rooms/:roomId/messages", (req, res) => {
  try {
    ensureRoom(req.params.roomId);
    const messages = getRoomMessages(req.params.roomId);
    res.json({ roomId: req.params.roomId, messages });
  } catch (error) {
    res.status(500).json({ error: "Xabarlarni olishda xatolik yuz berdi." });
  }
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName }) => {
    const safeName = sanitizeName(userName);
    const safeRoomId = String(roomId || "").trim();

    if (!safeName || !safeRoomId) {
      socket.emit("chat-error", "Ism va xona kerak.");
      return;
    }

    try {
      ensureRoom(safeRoomId);
      socket.data.userName = safeName;
      socket.data.roomId = safeRoomId;
      socket.join(safeRoomId);

      const messages = getRoomMessages(safeRoomId);
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
      id: data.nextId++,
      roomId,
      senderName,
      text: safeText,
      createdAt: new Date().toISOString()
    };

    data.messages.push(message);
    saveData(data);
    io.to(roomId).emit("new-message", message);
  });
});

server.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} da ishga tushdi`);
});
