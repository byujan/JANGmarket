import type { MarketItem, MarketItemDetail } from "./server/discovery.ts";
import type { SessionView } from "./jang/session.ts";
import type { Agreement, ItemSpec, Mandate, Terms, Violation } from "./jang/types.ts";

export class JangApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly violations?: Violation[],
    readonly status?: number,
  ) {
    super(message);
    this.name = "JangApiError";
  }
}

/** A typed client for the JANG REST API, shared by the MCP server and the agents. */
export class JangClient {
  constructor(
    private readonly baseUrl: string,
    private apiKey?: string,
  ) {}

  get key(): string | undefined {
    return this.apiKey;
  }

  async health(): Promise<{ ok: boolean; jangPublicKey: string }> {
    return this.request("GET", "/api/health", undefined, { auth: false });
  }

  async registerAgent(input: { agentId: string; ownerId: string }): Promise<string> {
    const { apiKey } = await this.request<{ apiKey: string }>("POST", "/api/agents", input, { auth: false });
    this.apiKey = apiKey;
    return apiKey;
  }

  /** What this agent could negotiate over. */
  async market(): Promise<{ items: MarketItem[] }> {
    return this.request("GET", "/api/market");
  }

  async marketItem(itemId: string): Promise<MarketItemDetail> {
    return this.request("GET", `/api/market/${encodeURIComponent(itemId)}`);
  }

  async lodgeMandate(mandate: Mandate): Promise<{ mandateId: string }> {
    return this.request("POST", "/api/mandates", mandate);
  }

  async openSession(input: {
    counterpartyAgentId: string;
    itemSpec: ItemSpec;
    maxRounds?: number;
    ttlSeconds?: number;
  }): Promise<SessionView> {
    return this.request("POST", "/api/sessions", input);
  }

  async getSession(sessionId: string): Promise<SessionView> {
    return this.request("GET", `/api/sessions/${sessionId}`);
  }

  async offer(sessionId: string, terms: Terms, note?: string, alternatives?: Terms[]): Promise<SessionView> {
    return this.request("POST", `/api/sessions/${sessionId}/offers`, {
      terms,
      note,
      ...(alternatives?.length ? { alternatives } : {}),
    });
  }

  async accept(sessionId: string, offerId?: string): Promise<{ session: SessionView; agreement: Agreement }> {
    return this.request("POST", `/api/sessions/${sessionId}/accept`, offerId ? { offerId } : {});
  }

  async getAgreement(agreementId: string): Promise<Agreement> {
    return this.request("GET", `/api/agreements/${agreementId}`, undefined, { auth: false });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { auth?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.auth !== false) {
      if (!this.apiKey) throw new JangApiError("UNAUTHORIZED", "no agent key configured for this client");
      headers["x-agent-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = payload.error ?? {};
      throw new JangApiError(error.code ?? "HTTP_ERROR", error.message ?? response.statusText, error.violations, response.status);
    }
    return payload as T;
  }
}
