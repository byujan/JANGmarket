import postgres, { type Sql } from "postgres";
import { MemoryStore } from "./memory.ts";
import { PostgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

/**
 * Pick a store from the environment.
 *
 * With DATABASE_URL, Postgres; without it, memory. That default is deliberate:
 * `npm run demo` stays a one-command affair with nothing to install, while
 * anything with accounts behind it points at a real database.
 *
 * What is held across a hot reload matters. Caching the *store object* means a
 * reload that adds a method to the class leaves the running instance without
 * it, and every call fails with "not a function" until someone restarts the
 * server. So only the connection pool is kept, since that is the expensive
 * thing and the one that leaks if rebuilt; the wrapper around it is rebuilt
 * each time the module evaluates, and picks up the new code.
 */
const cache = globalThis as unknown as { __jangSql?: Sql; __jangMemory?: MemoryStore };

function create(): Store {
  const url = process.env.DATABASE_URL;
  if (url) {
    cache.__jangSql ??= postgres(url, { onnotice: () => {} });
    return PostgresStore.fromUrl(url, cache.__jangSql);
  }
  // The in-memory store *is* its data, so it has to survive the reload. That
  // leaves it open to the staleness described above; without a database there
  // is nothing to lose by restarting, which is the fix when it happens.
  return (cache.__jangMemory ??= new MemoryStore());
}

export const store: Store = create();
export const usingPostgres = Boolean(process.env.DATABASE_URL);
