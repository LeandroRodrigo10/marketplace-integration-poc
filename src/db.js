const Database = require("better-sqlite3");
require("dotenv").config();

const db = new Database(process.env.DB_PATH || "./data/poc.sqlite");
db.pragma("journal_mode = WAL");

module.exports = { db };
