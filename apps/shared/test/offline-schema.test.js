// apps/shared/test/offline-schema.test.js
// The versioned local-store schema (CTIP-44). The tests run the real SQL in Node's
// built-in SQLite, so a typo in a migration shows up here and not on a phone.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, migrate } from "../offline/schema.js";

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version;

// The small part of expo-sqlite that migrate() uses, on top of node:sqlite.
// `seen` records every statement; `failOn` makes a matching statement throw.
function makeDb({ failOn } = {}) {
  const raw = new DatabaseSync(":memory:");
  const seen = [];
  return {
    raw,
    seen,
    execSync(sql) {
      seen.push(sql);
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      raw.exec(sql);
    },
    getFirstSync(sql) {
      return raw.prepare(sql).get() ?? null;
    },
  };
}

const userVersion = (db) => db.raw.prepare("PRAGMA user_version;").get().user_version;
const tables = (db) =>
  db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
    .all()
    .map((r) => r.name);

test("migrate runs each migration once and sets user_version", () => {
  const db = makeDb();

  assert.equal(migrate(db), LATEST);
  assert.equal(LATEST, 5);
  assert.equal(userVersion(db), 5);
  assert.deepEqual(tables(db), [
    "drafts",
    "meta",
    "outbox_photos",
    "outbox_records",
    "reserved_tags",
    "species_cache",
    "tag_cache",
  ]);

  // A second call finds user_version 5 and runs nothing.
  db.seen.length = 0;
  assert.equal(migrate(db), LATEST);
  assert.equal(db.seen.length, 0);
});

test("migrate keeps a pre-CTIP-44 drafts table", () => {
  const db = makeDb();
  // How the table looked before versioning: user_version 0, one saved draft.
  db.raw.exec(`
    CREATE TABLE drafts (qr_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO drafts VALUES ('QR-1', '{"notes":"keep me"}', '2026-11-01T00:00:00Z');
  `);
  assert.equal(userVersion(db), 0);

  migrate(db);

  const row = db.raw.prepare("SELECT * FROM drafts;").get();
  assert.equal(row.qr_id, "QR-1");
  assert.equal(row.data, '{"notes":"keep me"}');
  assert.equal(userVersion(db), LATEST);
});

test("migrate rolls back a failing migration and throws", () => {
  // Migration 2 creates its tables, then the statement that sets user_version 2
  // fails. Everything migration 2 did must be undone.
  const db = makeDb({ failOn: "user_version = 2" });

  assert.throws(() => migrate(db), /boom/);

  // Migration 1 was committed on its own; migration 2 left nothing behind.
  assert.equal(userVersion(db), 1);
  assert.deepEqual(tables(db), ["drafts"]);
});

test("outbox_records is indexed by user and created_at", () => {
  const db = makeDb();
  migrate(db);
  const index = db.raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'outbox_records' AND sql IS NOT NULL;"
    )
    .get();
  const cols = db.raw
    .prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno;")
    .all(index.name)
    .map((r) => r.name);
  assert.deepEqual(cols, ["user_id", "created_at"]);
});

test("reserved_tags holds one row per kept tag, with its owner and whether this phone made it", () => {
  const db = makeDb();
  migrate(db);
  const cols = db.raw
    .prepare("SELECT name, type, pk, \"notnull\" FROM pragma_table_info('reserved_tags') ORDER BY cid;")
    .all()
    .map((c) => ({ name: c.name, type: c.type, pk: c.pk, notnull: c.notnull }));
  assert.deepEqual(cols, [
    { name: "qr_id", type: "TEXT", pk: 1, notnull: 0 },
    { name: "user_id", type: "TEXT", pk: 0, notnull: 1 },
    { name: "made_here", type: "INTEGER", pk: 0, notnull: 1 },
  ]);
});
