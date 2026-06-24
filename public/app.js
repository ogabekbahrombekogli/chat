const socket = io();

const nameInput = document.getElementById("nameInput");
const authForm = document.getElementById("authForm");
const introText = document.getElementById("introText");
const statusText = document.getElementById("statusText");
const authScreen = document.getElementById("authScreen");
const chatScreen = document.getElementById("chatScreen");
const roomLink = document.getElementById("roomLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

let currentRoomId = "";
let currentUserName = localStorage.getItem("chat-user-name") || "";

nameInput.value = currentUserName;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.classList.toggle("error", isError);
}

function saveUserName() {
  currentUserName = nameInput.value.trim();

  if (!currentUserName) {
    setStatus("Iltimos, avval ismingizni kiriting.", true);
    return false;
  }

  localStorage.setItem("chat-user-name", currentUserName);
  return true;
}

function getRoomIdFromPath() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  return pathParts[0] === "room" ? pathParts[1] : "";
}

function renderMessage(message) {
  const item = document.createElement("article");
  item.className = "message";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const time = new Date(message.createdAt).toLocaleString("uz-UZ");
  meta.textContent = `${message.senderName} • ${time}`;

  const body = document.createElement("p");
  body.textContent = message.text;

  item.append(meta, body);
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function renderHistory(history) {
  messages.innerHTML = "";
  history.forEach(renderMessage);
}

function showChat(roomId) {
  currentRoomId = roomId;
  const fullUrl = `${window.location.origin}/room/${roomId}`;
  roomLink.href = fullUrl;
  roomLink.textContent = fullUrl;
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

async function createRoomAndJoin() {
  if (!saveUserName()) {
    return;
  }

  setStatus("Suhbat yaratilmoqda...");

  try {
    const response = await fetch("/api/rooms", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Xona yaratilmadi.");
    }

    joinRoom(data.roomId);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function joinRoom(roomId) {
  if (!saveUserName()) {
    return;
  }

  if (!roomId) {
    setStatus("Suhbat topilmadi.", true);
    return;
  }

  setStatus("Suhbatga ulanmoqda...");
  showChat(roomId);
  socket.emit("join-room", { roomId, userName: currentUserName });
  messageInput.focus();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const existingRoomId = getRoomIdFromPath();

  if (existingRoomId) {
    joinRoom(existingRoomId);
    return;
  }

  await createRoomAndJoin();
});

copyLinkBtn.addEventListener("click", async () => {
  if (!roomLink.href) {
    return;
  }

  await navigator.clipboard.writeText(roomLink.href);
  setStatus("Havola nusxalandi.");
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text) {
    return;
  }

  socket.emit("send-message", { text });
  messageInput.value = "";
  messageInput.focus();
});

socket.on("room-history", ({ roomId, messages: history }) => {
  showChat(roomId);
  renderHistory(history);
  setStatus("Suhbat tayyor.");
});

socket.on("new-message", (message) => {
  renderMessage(message);
});

socket.on("chat-error", (text) => {
  setStatus(text, true);
});

window.addEventListener("load", async () => {
  const roomIdFromPath = getRoomIdFromPath();

  if (roomIdFromPath) {
    introText.textContent = "Havola orqali kirdingiz. Ismingizni yozing va chatga kiring.";

    try {
      const response = await fetch(`/api/rooms/${roomIdFromPath}/messages`);
      const data = await response.json();

      if (response.ok) {
        showChat(roomIdFromPath);
        renderHistory(data.messages);
        chatScreen.classList.add("hidden");
        authScreen.classList.remove("hidden");
      }
    } catch (error) {
      setStatus("Suhbat ma'lumotini olishda xatolik yuz berdi.", true);
    }
  } else {
    introText.textContent = "Ismingizni kiriting. Chat ochiladi va havolani boshqaga yuborasiz.";
  }
});
