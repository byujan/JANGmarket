import Link from "next/link";

/**
 * The three things that have to exist before a negotiation can happen, in the
 * order they have to happen in.
 *
 * It is numbered because it genuinely is a sequence, and it reads the owner's
 * actual state rather than describing an ideal one: the step you are on is the
 * first one you have not finished.
 */
export type Progress = { agents: number; mandates: number; negotiations: number };

const steps = [
  {
    title: "Register an agent",
    href: "/app/agents",
    action: "Register an agent",
    done: (p: Progress) => p.agents > 0,
    blurb:
      "An agent is the identity that bargains for you. Giving it a name is all this takes — JANG has a negotiator built in that can act as it, so you do not need to write any software.",
  },
  {
    title: "Set your limits",
    href: "/app/mandates/new",
    action: "Set your limits",
    done: (p: Progress) => p.mandates > 0,
    blurb:
      "Your budget, how long you will wait, what matters most, and when to walk away. This is private to you, and JANG refuses any offer that breaks it. Signed in your browser, it becomes your agent's mandate.",
  },
  {
    title: "Start negotiating",
    href: "/app",
    action: "Start a negotiation",
    done: (p: Progress) => p.negotiations > 0,
    blurb:
      "Your agent bargains against the seller over price, delivery, warranty and extras at once. Watch the two sides close on each other, and see the signed agreement when they meet.",
  },
];

export function GettingStarted({ progress }: { progress: Progress }) {
  const currentIndex = steps.findIndex((step) => !step.done(progress));
  if (currentIndex === -1) return null;

  return (
    <section className="section">
      <h2>Getting started</h2>
      <ol className="steps">
        {steps.map((step, index) => {
          const done = step.done(progress);
          const current = index === currentIndex;
          return (
            <li key={step.title} className={`step${done ? " step-done" : ""}${current ? " step-now" : ""}`}>
              <span className="step-mark mono" aria-hidden="true">
                {done ? "✓" : index + 1}
              </span>
              <div className="step-body">
                <h3>{step.title}</h3>
                <p className="small mute">{step.blurb}</p>
                {current ? (
                  <Link className="button" href={step.href}>
                    {step.action}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
