#!/usr/bin/env tsx
/**
 * Pool results/hw7/*.json into results/hw7/SUMMARY.md and summary.json.
 * Reads the per-market rows, not the printed summaries, so every number here
 * can be traced to a row.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const TUNING = [20261028];
const FRESH = [20261101, 20261102];
const VARIANTS = ["base", "fix", "option1", "option2", "fix+option1", "fix+option2"];
const CASES = ["ordinary", "narrow", "asymmetric", "nozopa"];
const CONDS = ["jang", "priceOnly", "posted", "oracle"] as const;

type Row = any;
const files = readdirSync("results/hw7").filter((f) => f.endsWith(".json") && f.includes("-seed"));
const runs = files.map((f) => JSON.parse(readFileSync(`results/hw7/${f}`, "utf8")));

const rowsFor = (variant: string, seeds: number[], kind: string): Row[] =>
  runs.filter((r) => r.variant === variant && seeds.includes(r.seed)).flatMap((r) => r.rows.filter((x: Row) => x.case === kind));

function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (c - h), 100 * (c + h)];
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (k: number, n: number) => (n ? `${k}/${n} (${Math.round((100 * k) / n)}%)` : "-");
const ci = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return n ? `${lo.toFixed(0)}-${hi.toFixed(0)}%` : "-";
};
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

function stats(rows: Row[]) {
  const feas = rows.filter((x) => x.feasible);
  const out: any = {
    markets: rows.length,
    feasible: feas.length,
    feasiblePriceOnly: rows.filter((x) => x.feasiblePriceOnly).length,
    falseAgreements: rows.filter((x) => !x.feasible && (x.jang.agreed || x.priceOnly.agreed)).length,
    violations: rows.reduce((a, x) => a + (x.jang.violations ?? 0) + (x.priceOnly.violations ?? 0), 0),
    jangOnly: feas.filter((x) => x.jang.agreed && !x.priceOnly.agreed).length,
    priceOnlyOnly: feas.filter((x) => !x.jang.agreed && x.priceOnly.agreed).length,
    bothClosed: feas.filter((x) => x.jang.agreed && x.priceOnly.agreed),
  };
  for (const c of CONDS) {
    const closed = feas.filter((x) => x[c].agreed);
    const q = closed.map((x) => x[c].q);
    out[c] = {
      closed: closed.length,
      pareto: q.filter((v: any) => v.paretoOptimal).length,
      efficiency: mean(q.map((v: any) => v.efficiency)),
      distance: mean(q.map((v: any) => v.paretoDistance)),
      buyerShare: mean(q.map((v: any) => v.buyerShare)),
      rounds: mean(rows.map((x) => x[c].rounds ?? NaN).filter(Number.isFinite)),
      ms: mean(rows.map((x) => x[c].ms ?? NaN).filter(Number.isFinite)),
    };
  }
  // Paired on markets both closed: JANG efficiency minus price-only efficiency.
  const diffs = out.bothClosed.map((x: Row) => x.jang.q.efficiency - x.priceOnly.q.efficiency);
  out.pairedEffDiff = mean(diffs);
  out.pairedN = diffs.length;
  out.pairedJangBetter = diffs.filter((d: number) => d > 1e-9).length;
  delete out.bothClosed;
  return out;
}

const md: string[] = [];
const json: any = {};
md.push("# HW7 results", "", `Generated from ${files.length} result files by \`scripts/hw7/summarize.ts\`.`, "");
md.push("Closing rate is over markets where a deal was feasible (exhaustive search). Pareto, efficiency and buyer share are over closed deals, scored against the full four-term market. Rounds and ms are per negotiation, over all markets.", "");

for (const [label, seeds] of [["Fresh seeds 20261101 + 20261102", FRESH], ["Tuning seed 20261028", TUNING]] as const) {
  md.push(`## ${label}`, "");
  for (const variant of VARIANTS) {
    md.push(`### variant \`${variant}\``, "");
    md.push("| case | feasible | JANG close | 95% CI | price-only close | 95% CI | posted | oracle | JANG-only / PO-only | JANG pareto | PO pareto | JANG eff | PO eff | paired eff diff (n, JANG better) | JANG buyer share | PO buyer share | JANG rounds | PO rounds | JANG ms | false agr. | violations |");
    md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const kind of CASES) {
      const s = stats(rowsFor(variant, [...seeds], kind));
      json[`${label}|${variant}|${kind}`] = s;
      md.push(
        `| ${kind} | ${s.feasible}/${s.markets} | ${pct(s.jang.closed, s.feasible)} | ${ci(s.jang.closed, s.feasible)} | ${pct(s.priceOnly.closed, s.feasible)} | ${ci(s.priceOnly.closed, s.feasible)} | ${pct(s.posted.closed, s.feasible)} | ${pct(s.oracle.closed, s.feasible)} | ${s.jangOnly} / ${s.priceOnlyOnly} | ${pct(s.jang.pareto, s.jang.closed)} | ${pct(s.priceOnly.pareto, s.priceOnly.closed)} | ${f(s.jang.efficiency)} | ${f(s.priceOnly.efficiency)} | ${f(s.pairedEffDiff, 3)} (${s.pairedN}, ${s.pairedJangBetter}) | ${f(s.jang.buyerShare)} | ${f(s.priceOnly.buyerShare)} | ${f(s.jang.rounds, 1)} | ${f(s.priceOnly.rounds, 1)} | ${f(s.jang.ms, 1)} | ${s.falseAgreements} | ${s.violations} |`,
      );
    }
    md.push("");
  }
}
// ---------------------------------------------------------------- Claude agents
const llmFiles = readdirSync("results/hw7").filter((f) => f.startsWith("llm-") && f.endsWith(".json"));
const llm = llmFiles.flatMap((f) => JSON.parse(readFileSync(`results/hw7/${f}`, "utf8")).records.map((r: any) => ({ ...r, file: f })));
if (llm.length) {
  md.push("## Claude agents", "", `From ${llmFiles.join(", ")}. Each row pools the repetitions of one case and condition.`, "");
  md.push("| case | condition | runs | agreed | violations | mean rounds | efficiency (mean, min-max) | buyer share | mean seconds | mean tokens in/out | mean API-equivalent USD |");
  md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const keys = [...new Set(llm.map((r: any) => `${r.case}|${r.condition}`))];
  for (const key of keys) {
    const rs = llm.filter((r: any) => `${r.case}|${r.condition}` === key);
    const ok = rs.filter((r: any) => r.agreed);
    const eff = ok.map((r: any) => r.quality.efficiency);
    const viol = ok.filter((r: any) => !r.audit.ok).length;
    md.push(
      `| ${key.replace("|", " | ")} | ${rs.length} | ${ok.length} | ${viol} | ${f(mean(rs.map((r: any) => r.rounds)), 1)} | ${f(mean(eff))} (${eff.length ? `${f(Math.min(...eff))}-${f(Math.max(...eff))}` : "-"}) | ${f(mean(ok.map((r: any) => r.quality.buyerShare)))} | ${f(mean(rs.map((r: any) => r.seconds)), 0)} | ${f(mean(rs.map((r: any) => r.tokens.input + r.tokens.cacheRead + r.tokens.cacheWrite)), 0)} / ${f(mean(rs.map((r: any) => r.tokens.output)), 0)} | ${f(mean(rs.map((r: any) => r.apiEquivalentUsd)), 3)} |`,
    );
  }
  md.push("");
}

writeFileSync("results/hw7/SUMMARY.md", md.join("\n") + "\n");
writeFileSync("results/hw7/summary.json", JSON.stringify(json, null, 1) + "\n");
console.log("wrote results/hw7/SUMMARY.md");
