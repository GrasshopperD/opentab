// Invitation stores. Transactions are serialized and copy-on-write: a transaction that throws commits nothing.
//
// fileStore: DURABLE ON ONE MACHINE (survives restarts; atomic write via temp file + rename). Serialization is per
// Node.js process, so it is correct for a single `next start` / `next dev` process only. It is NOT safe for
// serverless or multi-instance hosting (Vercel): there the feature is disabled until a database adapter
// (e.g. Postgres with row locks / conditional UPDATE, or Redis with WATCH/MULTI) implements the same Store interface.
import * as fs from "node:fs";
import * as path from "node:path";
import type { DB, Store } from "./invites.core";

function serialized(load: () => DB, save: (db: DB) => void): Store {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    transact<T>(fn: (db: DB) => T): Promise<T> {
      const run = queue.then(() => {
        const db = structuredClone(load());
        const result = fn(db);           // throws -> nothing saved
        save(db);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export function memoryStore(): Store {
  let state: DB = { invites: {} };
  return serialized(() => state, (db) => { state = db; });
}

export function fileStore(dir: string): Store {
  const file = path.join(dir, "invites.json");
  const load = (): DB => {
    let text: string;
    try { text = fs.readFileSync(file, "utf8"); } catch (e: any) { if (e.code === "ENOENT") return { invites: {} }; throw e; }
    const db = JSON.parse(text);                       // corrupt file -> throw (fail closed), never silently reset
    if (!db || typeof db.invites !== "object") throw new Error("invite store corrupt");
    return db;
  };
  const save = (db: DB) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  return serialized(load, save);
}
