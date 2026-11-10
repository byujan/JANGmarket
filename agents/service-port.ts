import { JangError } from "../src/lib/jang/types.ts";
import type { SessionView } from "../src/lib/jang/session.ts";
import type { Agreement, Terms } from "../src/lib/jang/types.ts";
import type { JangService } from "../src/lib/server/service.ts";
import { ToolRefusal, type NegotiationPort } from "./port.ts";

/**
 * In-process access to JANG, for agents the server itself runs.
 *
 * Nothing is spawned and nothing goes over HTTP, which is what makes it safe
 * to drive a demonstration negotiation from inside a request handler.
 */
export class ServicePort implements NegotiationPort {
  private calls = 0;

  constructor(
    private readonly service: JangService,
    private readonly agentId: string,
    private readonly sessionId: string,
  ) {}

  get callCount(): number {
    return this.calls;
  }

  async getSession(): Promise<SessionView> {
    return this.track(() => this.service.viewSession(this.agentId, this.sessionId));
  }

  async offer(terms: Terms, note: string, alternatives?: Terms[]): Promise<SessionView> {
    return this.track(() =>
      this.service.makeOffer({ agentId: this.agentId, sessionId: this.sessionId, terms, note, alternatives }),
    );
  }

  async accept(offerId?: string): Promise<{ agreement: Agreement; session: SessionView }> {
    const result = await this.track(() =>
      this.service.accept({ agentId: this.agentId, sessionId: this.sessionId, offerId }),
    );
    return { agreement: result.agreement, session: result.view };
  }

  private async track<T>(call: () => Promise<T>): Promise<T> {
    this.calls += 1;
    try {
      return await call();
    } catch (error) {
      if (error instanceof JangError) throw new ToolRefusal(error.code, `${error.code}: ${error.message}`);
      throw error;
    }
  }
}
