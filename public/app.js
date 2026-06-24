const socket = io();

const nameInput = document.getElementById("nameInput");
const authForm = document.getElementById("authForm");
const introText = document.getElementById("introText");
const statusText = document.getElementById("statusText");
const authScreen = document.getElementById("authScreen");
const chatScreen = document.getElementById("chatScreen");
const userLine = document.getElementById("userLine");
const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

let currentUserName = "";

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.classList.toggle("error", isError);
}

function registerUserName() {
  const name = nameInput.value.trim();

  if (!name) {
    setStatus("Ismingizni kiriting.", true);
    return false;
  }

  currentUserName = name;
  localStorage.setItem("chat-user-name", name);
  return true;
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

function showChat(userName) {
  userLine.textContent = `Siz: ${userName}`;
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

function joinChat() {
  if (!registerUserName()) {
    return;
  }

  setStatus("Chatga ulanmoqda...");
  showChat(currentUserName);
  socket.emit("join-chat", { userName: currentUserName });
  messageInput.focus();
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinChat();
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

socket.on("chat-history", ({ userName, messages: history }) => {
  showChat(userName);
  renderHistory(history);
  setStatus("");
});

socket.on("new-message", (message) => {
  renderMessage(message);
});

socket.on("chat-error", (text) => {
  setStatus(text, true);
});

window.addEventListener("load", async () => {
  const savedName = localStorage.getItem("chat-user-name") || "";
  nameInput.value = savedName;
  introText.textContent = "Ro'yxatdan o'ting. Ism yozsangiz chat ochiladi.";

  try {
    const response = await fetch("/api/messages");
    const data = await response.json();

    if (response.ok) {
      renderHistory(data.messages);
    }
  } catch (error) {
    setStatus("Chat ma'lumotini olishda xatolik yuz berdi.", true);
  }
});
