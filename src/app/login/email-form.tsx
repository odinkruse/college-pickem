"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emailSignInAction, type EmailState } from "./actions";

export function EmailSignIn({ next }: { next: string }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(emailSignInAction, { step: "email", email: "" });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {state.step === "email" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="you@example.com" />
          </label>
          <Button type="submit" name="op" value="send" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in code"}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p className="text-sm text-muted-foreground">
            We sent a code to <span className="font-medium text-foreground">{state.email}</span>. It can take a minute; check spam too.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Code
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="123456" />
          </label>
          <Button type="submit" name="op" value="verify" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
          <Button type="submit" name="op" value="send" variant="ghost" size="sm" disabled={pending} formNoValidate>
            Send a new code
          </Button>
        </>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
