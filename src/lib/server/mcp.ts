import { join } from "node:path";

/**
 * Where the MCP server lives, for the configuration the console hands out.
 *
 * It used to be the relative path `mcp/server.ts`, which only resolves if the
 * tool reading the configuration happens to have been started in this
 * checkout. Pasted into the Claude desktop app it fails with
 * ERR_MODULE_NOT_FOUND, which is a poor welcome.
 *
 * The MCP server always runs on the reader's own machine, so this process's
 * directory is the right answer exactly when the two are the same machine. In
 * development they are, and a deployed instance says plainly that the reader
 * needs their own checkout rather than quoting a path inside the server.
 */
export function mcpEntry(): { path: string; onThisMachine: boolean } {
  if (process.env.NODE_ENV === "production") {
    return { path: "/path/to/your/JANGmarket/mcp/server.ts", onThisMachine: false };
  }
  return { path: join(process.cwd(), "mcp", "server.ts"), onThisMachine: true };
}
