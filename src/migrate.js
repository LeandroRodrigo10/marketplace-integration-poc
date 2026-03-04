const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { db } = require("./db");

const dbPath = process.env.DB_PATH || "./data/poc.sqlite";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

db.exec(`
CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  direction TEXT NOT NULL,
  topic TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  next_run_at TEXT NOT NULL,
  correlation_id TEXT NULL,
  parent_event_id INTEGER NULL,
  last_error TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_event_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES integration_events(id)
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  order_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(store_id, marketplace, external_order_id)
);
`);

console.log("OK: migrations applied at", dbPath);
