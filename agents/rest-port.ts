import { JangApiError, JangClient } from "../src/lib/client.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Agreement, Terms } from "../src/lib/jang/types.ts";
import { ToolRefusal, type NegotiationPort } from "./port.ts";

/** The same moves as the MCP port, straight over the REST API. */
export class RestPort implements NegotiationPort {
  private readonly client: JangClient;
  private calls = 0;

  constructor(baseUrl: string, apiKey: string, private readonly sessionId: string) {
    this.client = new JangClient(baseUrl, apiKey);
  }

  get callCount(): number {
    return this.calls;
  }

  async getSession(): Promise<SessionView> {
    return this.track(() => this.client.getSession(this.sessionId));
  }

  async offer(terms: Terms, note: string, alternatives?: Terms[]): Promise<SessionView> {
    return this.track(() => this.client.offer(this.sessionId, terms, note, alternatives));
  }

  async accept(offerId?: string): Promise<{ agreement: Agreement; session: SessionView }> {
    return this.track(() => this.client.accept(this.sessionId, offerId));
  }

  private async track<T>(call: () => Promise<T>): Promise<T> {
    this.calls += 1;
    try {
      return await call();
    } catch (error) {
      if (error instanceof JangApiError) throw new ToolRefusal(error.code, `${error.code}: ${error.message}`);
      throw error;
    }
  }
}
