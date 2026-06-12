import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'lottery.db');

let db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('merchant', 'admin')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'lottery_done', 'published')),
  stall_count INTEGER NOT NULL,
  stall_numbers TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  merchant_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  license_no TEXT NOT NULL,
  license_expiry TEXT NOT NULL,
  license_image TEXT NOT NULL,
  food_license_no TEXT,
  food_license_expiry TEXT,
  food_license_image TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lottery_results (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  registration_id INTEGER NOT NULL,
  stall_number TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);
`;

function saveToFile() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function seedAdmin() {
  if (!db) return;
  const result = db.exec("SELECT COUNT(*) as cnt FROM users WHERE username = 'admin'");
  const count = result[0]?.values[0]?.[0] as number ?? 0;
  if (count === 0) {
    const hashed = bcrypt.hashSync('admin123', 10);
    db.run(
      "INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, 'admin', '系统管理员', '13800000000')",
      ['admin', hashed]
    );
    saveToFile();
    console.log('Admin user seeded');
  }
}

export async function initDatabase() {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('Database loaded from file');
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
    saveToFile();
    console.log('Database created with schema');
  }

  await seedAdmin();

  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function persist() {
  saveToFile();
}

export function run(sql: string, params?: unknown[]) {
  const d = getDatabase();
  d.run(sql, params);
  persist();
}

export function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const d = getDatabase();
  const result = d.exec(sql, params);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}

export function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
  const rows = query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
