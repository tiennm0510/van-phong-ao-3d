"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

// SQLite is the source of truth for managed employees/tasks. Session log scanning
// remains independent and must never change these task states.
class OfficeStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(dir, "office.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS runtime_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1), pid INTEGER NOT NULL, token TEXT NOT NULL
      );
    `);
    this.token = crypto.randomUUID();
    try {
      this.transaction(() => {
        const previous = this.db.prepare("SELECT * FROM runtime_lock WHERE id = 1").get();
        if (previous) {
          let alive = true;
          try { process.kill(previous.pid, 0); } catch (e) { alive = e.code !== "ESRCH"; }
          if (alive) throw new Error("Dữ liệu văn phòng đang được một server khác sử dụng.");
        }
        this.db.prepare("INSERT OR REPLACE INTO runtime_lock VALUES (1, ?, ?)").run(process.pid, this.token);
      });
    } catch (e) { this.db.close(); throw e; }
  }
  all(kind) {
    return this.db.prepare("SELECT value FROM records WHERE kind = ? ORDER BY rowid").all(kind).map(r => JSON.parse(r.value));
  }
  get(kind, id) {
    const r = this.db.prepare("SELECT value FROM records WHERE kind = ? AND id = ?").get(kind, id);
    return r ? JSON.parse(r.value) : null;
  }
  put(kind, value) {
    this.db.prepare("INSERT INTO records (kind, id, value) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET value = excluded.value")
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  close() {
    this.db.prepare("DELETE FROM runtime_lock WHERE token = ?").run(this.token);
    this.db.close();
  }
}
module.exports = { OfficeStore };
