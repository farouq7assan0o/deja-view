import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'deja_view.sqlite');

let db;

export function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT   NOT NULL,
      image_hash   TEXT    NOT NULL,
      totp_secret  TEXT    NOT NULL,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      face_descriptor TEXT,           -- JSON array of 128 floats from face-api.js
      passkey_enabled INTEGER NOT NULL DEFAULT 0, -- 1 = passkey enrolled, replaces face factor
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login   INTEGER
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL,
      success    INTEGER NOT NULL DEFAULT 0,
      factor     TEXT,               -- which factor failed: image_hash | face | totp
      ip         TEXT,
      attempted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_username
      ON login_attempts(username, attempted_at);

    -- Passkey / WebAuthn credentials (optional upgrade to face factor)
    CREATE TABLE IF NOT EXISTS passkeys (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id      TEXT    NOT NULL UNIQUE,  -- base64url, used to find the key at login
      public_key         TEXT    NOT NULL,          -- base64url encoded public key
      counter            INTEGER NOT NULL DEFAULT 0,-- replay prevention counter
      device_type        TEXT,                      -- singleDevice or multiDevice
      backed_up          INTEGER NOT NULL DEFAULT 0,-- 1 = synced passkey
      created_at         INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
  `);
}

export default getDB;
