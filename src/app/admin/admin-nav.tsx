import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/games", label: "Games & lines" },
  { href: "/admin/players", label: "Players" },
] as const;

export function AdminNav({ active }: { active: (typeof LINKS)[number]["href"] }) {
  return (
    <nav aria-label="Admin" className="flex gap-4 border-b pb-2 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.href === active ? "page" : undefined}
          className={l.href === active ? "font-semibold" : "text-muted-foreground hover:text-foreground"}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
