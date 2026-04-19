import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL
  );
`);

const countRow = db.prepare("SELECT COUNT(*) AS count FROM notes").get() as {
  count: number;
};

if (countRow.count === 0) {
  db.prepare("INSERT INTO notes (text) VALUES (?)").run(
    "SQLite is connected to this Next.js app.",
  );
}

export type Note = {
  id: number;
  text: string;
};

export function getNotes(): Note[] {
  return db.prepare("SELECT id, text FROM notes ORDER BY id DESC").all() as Note[];
}
