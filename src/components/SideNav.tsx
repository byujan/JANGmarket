"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The console's navigation. Client-side so the current page can be marked,
 * and so moving between pages keeps the shell mounted instead of reloading it.
 */
const primary = [
  { href: "/app", label: "Console", exact: true },
  { href: "/app/agents", label: "Agents" },
  { href: "/app/items", label: "Market", exact: true },
  { href: "/app/items/new", label: "List an item" },
  { href: "/app/mandates/new", label: "Your limits" },
  { href: "/app/negotiations", label: "Negotiations" },
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
                Operations
              </Link>
            </li>
          </ul>
        </>
      ) : null}
    </nav>
  );
}
