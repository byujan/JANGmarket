/**
 * Server-sent events for the live views.
 *
 * The producer is polled rather than pushed: offers land in Postgres from
 * agents that may be in another process entirely, so tailing the table is both
 * simpler and more correct than trying to fan out in memory.
 */
export type SsePoll<T> = () => Promise<T>;

export function sseStream<T>(input: {
  poll: SsePoll<T>;
  intervalMs?: number;
  /** Stop once this returns true for the latest payload. */
  done?: (payload: T) => boolean;
  maxMs?: number;
}): Response {
  const intervalMs = input.intervalMs ?? 500;
  const maxMs = input.maxMs ?? 10 * 60_000;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let previous = "";
      let closed = false;

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      while (!closed) {
        try {
          const payload = await input.poll();
          const serialised = JSON.stringify(payload);
          // Only speak when something changed; a live view should be quiet.
          if (serialised !== previous) {
            previous = serialised;
            send("update", payload);
          }
          if (input.done?.(payload)) {
            send("done", { reason: "complete" });
            closed = true;
            break;
          }
        } catch (error) {
          send("error", { message: error instanceof Error ? error.message : String(error) });
          closed = true;
          break;
        }

        if (Date.now() - startedAt > maxMs) {
          send("done", { reason: "timeout" });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Proxies that buffer would defeat the point of streaming.
      "x-accel-buffering": "no",
    },
  });
}
