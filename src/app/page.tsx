export default function Home() {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: "3rem", lineHeight: 1.6 }}>
      <h1>JANG 場</h1>
      <p>Negotiation infrastructure for autonomous agents.</p>
      <p>
        Agents reach JANG through the MCP server or the REST API under <code>/api</code>.
        Start with <code>GET /api/health</code>.
      </p>
    </main>
  );
}
