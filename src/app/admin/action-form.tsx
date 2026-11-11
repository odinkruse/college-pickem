"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "./override-actions";

/**
 * A <form> bound to a Server Action through useActionState. The fields are passed in as children
 * (they can be rendered on the server); the fieldset disables them while the action runs, and the
 * action's message appears underneath.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction}>
      <fieldset disabled={pending} className={className}>
        {children}
      </fieldset>
      {state && (
        <p role="status" className={`mt-2 text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
