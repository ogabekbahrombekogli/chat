const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const DATABASE_URL = process.env.DATABASE_URL;
const CHAT_ID = "main";

let pool = null;
let mode = "json";
let jsonData = { messages: [], nextId: 1 };

function loadJsonData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      jsonData = {
        messages: loaded.messages || [],
        nextId: loaded.nextId || 1
      };
    }
  } catch (error) {
    console.error("data.json o'qilmadi:", error.message);
    jsonData = { messages: [], nextId: 1 };
  }
}

function saveJsonData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jsonData, null, 2));
}

function mapMessage(row) {
  return {
    id: row.id,
    senderName: row.sender_name || row.senderName,
    text: row.text,
    createdAt: row.created_at || row.createdAt
  };
}

async function initDb() {
  if (!DATABASE_URL) {
    loadJsonData();
    mode = "json";
    console.log("DATABASE_URL yo'q: lokal JSON ishlatiladi (production uchun Postgres kerak).");
    return;
  }

  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  mode = "postgres";
  console.log("PostgreSQL bazasiga ulandi. Xabarlar doimiy saqlanadi.");
}

async function getMessages() {
  if (mode === "postgres") {
    const result = await pool.query(
      `SELECT id, sender_name, text, created_at
       FROM messages
       ORDER BY id ASC`
    );
    return result.rows.map(mapMessage);
  }

  return jsonData.messages.sort((a, b) => a.id - b.id);
}

async function addMessage({ senderName, text }) {
  if (mode === "postgres") {
    const result = await pool.query(
      `INSERT INTO messages (sender_name, text)
       VALUES ($1, $2)
       RETURNING id, sender_name, text, created_at`,
      [senderName, text]
    );
    return mapMessage(result.rows[0]);
  }

  const message = {
    id: jsonData.nextId++,
    senderName,
    text,
    createdAt: new Date().toISOString()
  };

  jsonData.messages.push(message);
  saveJsonData();
  return message;
}

module.exports = {
  CHAT_ID,
  initDb,
  getMessages,
  addMessage
};
