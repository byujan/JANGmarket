"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AgentsIcon,
  AgreementsIcon,
  ConsoleIcon,
  LimitsIcon,
  ListIcon,
  MarketIcon,
  NegotiationsIcon,
  OperationsIcon,
} from "./NavIcons.tsx";

/**
 * The console's navigation. Client-side so the current page can be marked,
 * and so moving between pages keeps the shell mounted instead of reloading it.
 */
const primary = [
  { href: "/app", label: "Console", exact: true, Icon: ConsoleIcon },
  { href: "/app/agents", label: "Agents", Icon: AgentsIcon },
  { href: "/app/items", label: "Market", exact: true, Icon: MarketIcon },
  { href: "/app/items/new", label: "List an item", Icon: ListIcon },
  { href: "/app/mandates/new", label: "Your limits", Icon: LimitsIcon },
  { href: "/app/negotiations", label: "Negotiations", Icon: NegotiationsIcon },
  { href: "/app/agreements", label: "Agreements", Icon: AgreementsIcon },
];

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const isCurrent = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="siderail" aria-label="Console">
      <ul>
        {primary.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={isCurrent(item.href, item.exact) ? "here" : undefined}
              aria-current={isCurrent(item.href, item.exact) ? "page" : undefined}
            >
              <item.Icon />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {isAdmin ? (
        <>
          <p className="siderail-divider small faint">Operator</p>
          <ul>
            <li>
              <Link
                href="/admin"
                className={isCurrent("/admin") ? "here" : undefined}
                aria-current={isCurrent("/admin") ? "page" : undefined}
              >
                <OperationsIcon />
                Operations
              </Link>
            </li>
          </ul>
        </>
      ) : null}
    </nav>
  );
}
