import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgreementReceipt } from "@/components/AgreementReceipt.tsx";
import { jangKeys } from "@/lib/server/keys.ts";
import { currentOwner } from "@/lib/server/owner.ts";
import { specFor } from "@/lib/server/marketplace.ts";
import { sidesOf } from "@/lib/server/settlement.ts";
import { store } from "@/lib/store/index.ts";

export const dynamic = "force-dynamic";

export default async function AgreementPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect("/sign-in");

  const { agreementId } = await params;
  const agreement = await store.getAgreement(agreementId);
  if (!agreement) notFound();

  const { settlement } = await sidesOf(agreementId);
  // An agreement is only ever shown to the two owners named on it. Anyone else
  // gets a not-found rather than a refusal, which would confirm it exists.
  const role =
    settlement.buyerOwnerId === owner.ownerId
      ? ("buyer" as const)
      : settlement.sellerOwnerId === owner.ownerId
        ? ("seller" as const)
        : undefined;
  if (!role) notFound();

  const itemSpec = await specFor(agreement.itemId);

  return (
    <main className="page page-wide">
      <p className="small mute" style={{ marginBottom: "0.75rem" }}>
        <Link href="/app/agreements">Agreements</Link> <span className="faint">/</span>{" "}
        <span className="mono">{agreement.agreementId}</span>
      </p>
      <div className="page-head">
        <h1>{itemSpec.title}</h1>
        <p>
          You {role === "buyer" ? "bought" : "sold"} this. The negotiation that produced it is at{" "}
          <Link href={`/app/negotiations/${agreement.sessionId}`}>its session</Link>.
        </p>
      </div>

      <AgreementReceipt
        agreement={agreement}
        settlement={settlement}
        dimensions={itemSpec.dimensions}
        jangPublicKey={jangKeys.publicKeyPem}
        you={{ ownerId: owner.ownerId, role }}
      />
    </main>
  );
}
