const session = require('express-session');
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const getStmt = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
const upsertStmt = db.prepare(
  'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at'
);
const destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
const pruneStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

/**
 * Minimal express-session Store backed by our existing SQLite database, so
 * admin sessions survive a server restart instead of silently logging
 * everyone out (the default MemoryStore also leaks memory and is explicitly
 * unsupported for production by express-session itself).
 */
class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      const row = getStmt.get(sid);
      if (!row || row.expires_at < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      const maxAge = (sessionData.cookie && sessionData.cookie.maxAge) || 8 * 60 * 60 * 1000;
      upsertStmt.run(sid, JSON.stringify(sessionData), Date.now() + maxAge);
      cb && cb();
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      destroyStmt.run(sid);
      cb && cb();
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

setInterval(() => {
  try { pruneStmt.run(Date.now()); } catch (e) { /* ignore */ }
}, 60 * 60 * 1000).unref();

module.exports = SqliteSessionStore;
