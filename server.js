const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function sanitizeName(name) {
  return String(name || "").trim().slice(0, 30);
}

function sanitizeMessage(text) {
  return String(text || "").trim().slice(0, 1000);
}

app.get("/api/messages", async (req, res) => {
  try {
    const messages = await db.getMessages();
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Xabarlarni olishda xatolik yuz berdi." });
  }
});

io.on("connection", (socket) => {
  socket.on("join-chat", async ({ userName }) => {
    const safeName = sanitizeName(userName);

    if (!safeName) {
      socket.emit("chat-error", "Ism kerak.");
      return;
    }

    try {
      socket.data.userName = safeName;
      socket.join(db.CHAT_ID);

      const messages = await db.getMessages();
      socket.emit("chat-history", { userName: safeName, messages });
    } catch (error) {
      socket.emit("chat-error", "Chatga ulanishda xatolik yuz berdi.");
    }
  });

  socket.on("send-message", async ({ text }) => {
    const safeText = sanitizeMessage(text);
    const senderName = socket.data.userName;

    if (!senderName || !safeText) {
      socket.emit("chat-error", "Xabar yuborilmadi.");
      return;
    }

    try {
      const message = await db.addMessage({ senderName, text: safeText });
      io.to(db.CHAT_ID).emit("new-message", message);
    } catch (error) {
      socket.emit("chat-error", "Xabar saqlanmadi.");
    }
  });
});

async function start() {
  await db.initDb();

  server.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT} da ishga tushdi`);
  });
}

start().catch((error) => {
  console.error("Server ishga tushmadi:", error);
  process.exit(1);
});
