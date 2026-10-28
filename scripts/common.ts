import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseScenario, type Scenario } from "../src/lib/jang/scenario.ts";
import type { Dimension } from "../src/lib/jang/types.ts";

export const BASE_URL = process.env.JANG_API_URL ?? "http://localhost:3939";

export const colour = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
};

export function loadScenario(path = process.env.JANG_SCENARIO ?? "agents/scenarios/tv-clearance.json"): Scenario {
  return parseScenario(JSON.parse(readFileSync(path, "utf8")));
}

async function isUp(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start the JANG server if it is not already running, so a demo is one command.
 * A server we did not start is left alone when we are done.
 */
export async function ensureServer(baseUrl = BASE_URL): Promise<{ stop: () => void; started: boolean }> {
  if (await isUp(baseUrl)) return { stop: () => {}, started: false };

  process.stdout.write(`${colour.dim}starting the JANG server...${colour.reset}\n`);
  const child: ChildProcess = spawn("npm", ["run", "dev"], { stdio: "ignore", detached: false });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await isUp(baseUrl)) {
      return {
        started: true,
        stop: () => {
          child.kill("SIGTERM");
        },
      };
    }
  }
  child.kill("SIGTERM");
  throw new Error(`the JANG server did not come up at ${baseUrl}`);
}

export function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

/** Render a package using whatever dimensions the item actually declares. */
export function termsLine(terms: Record<string, number>, dimensions: Dimension[]): string {
  return dimensions
    .map((dimension) => {
      const value = terms[dimension.key];
      if (dimension.unit === "USD") return `${dimension.label} ${money(value)}`;
      if (dimension.min === 0 && dimension.max === 1) return `${dimension.label} ${value ? "yes" : "no"}`;
      return `${dimension.label} ${value}${dimension.unit ? ` ${dimension.unit}` : ""}`;
    })
    .join("  |  ");
}
