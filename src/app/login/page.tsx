import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer, safeNext } from "@/lib/auth";
import { googleSignInAction } from "./actions";
import { EmailSignIn } from "./email-form";

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={null}>
        <Login searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getViewer()) redirect(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          To make picks. Standings are open to everyone. First time? Open the invite link you were sent, then sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {typeof params.error === "string" && <p className="text-sm text-destructive">{params.error}</p>}
        <form action={googleSignInAction}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>
        <EmailSignIn next={next} />
      </CardContent>
    </Card>
  );
}
