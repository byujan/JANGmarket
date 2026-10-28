#!/usr/bin/env tsx
/** Apply db/schema.sql. Safe to run repeatedly. */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { colour } from "./common.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${colour.red}DATABASE_URL is not set.${colour.reset} Add it to .env.local, for example:
  DATABASE_URL=postgres://localhost:5432/jang`);
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });
try {
  await sql.unsafe(readFileSync("db/schema.sql", "utf8"));
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log(`${colour.green}schema applied${colour.reset} — tables: ${tables.map((t) => t.table_name).join(", ")}`);
} finally {
  await sql.end();
}
