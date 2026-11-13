import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

// Everything under /picks belongs to one member: they must be signed in and linked to an entry.
export default function PicksLayout({ children }: LayoutProps<"/picks">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 text-muted-foreground">Loading…</main>}>
      <MemberGate>{children}</MemberGate>
    </Suspense>
  );
}

async function MemberGate({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/picks");
  if (!viewer.profileId) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
        <p className="text-muted-foreground">
          You&apos;re signed in as {viewer.email}, but this login isn&apos;t linked to a league entry yet. Open the invite link you were sent
          (ask the commissioner if you don&apos;t have one).
        </p>
      </main>
    );
  }
  return children;
}
