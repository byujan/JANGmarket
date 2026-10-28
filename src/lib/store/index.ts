import { MemoryStore } from "./memory.ts";
import { PostgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

/**
 * Pick a store from the environment.
 *
 * With DATABASE_URL, Postgres; without it, memory. That default is deliberate:
 * `npm run demo` stays a one-command affair with nothing to install, while
 * anything with accounts behind it points at a real database.
 */
function create(): Store {
  const url = process.env.DATABASE_URL;
  if (url) return PostgresStore.fromUrl(url);
  return new MemoryStore();
}

const globalForStore = globalThis as unknown as { __jangStore?: Store };
export const store: Store = (globalForStore.__jangStore ??= create());
export const usingPostgres = Boolean(process.env.DATABASE_URL);
