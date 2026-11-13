import { Suspense } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClaimButton } from "./claim-button";

// An invite link: /join/<code>. Sign in (any method), then claim the league entry it belongs to.
export default function JoinPage(props: PageProps<"/join/[code]">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={null}>
        <Join params={props.params} />
      </Suspense>
    </main>
  );
}

async function Join({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const { code } = await params;
  const [viewer, profile] = await Promise.all([
    getViewer(),
    createAdminClient().from("profiles").select("display_name").eq("invite_code", code).maybeSingle(),
  ]);
  const name = profile.data?.display_name;

  let body;
  if (!name) body = <p className="text-sm">This invite link has already been used or isn&apos;t valid. Ask for a new one.</p>;
  else if (!viewer)
    body = (
      <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonVariants({ className: "w-full" })}>
        Sign in to continue
      </Link>
    );
  else if (viewer.profileId)
    body = (
      <p className="text-sm">
        You&apos;re signed in as {viewer.email}, already linked to <span className="font-medium">{viewer.displayName}</span>.{" "}
        <Link href="/picks" className="underline underline-offset-4">
          Go to your picks
        </Link>
      </p>
    );
  else
    body = (
      <>
        <p className="text-sm text-muted-foreground">Signed in as {viewer.email}.</p>
        <ClaimButton code={code} name={name} />
      </>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name ? `Join as ${name}` : "Invite link"}</CardTitle>
        <CardDescription>College Pick&apos;em: link your login to your league entry. You only do this once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{body}</CardContent>
    </Card>
  );
}
