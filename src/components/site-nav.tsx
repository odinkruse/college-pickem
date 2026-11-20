import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import { getViewer } from "@/lib/auth";

const link = "py-2 uppercase text-foreground hover:text-primary";

/** The header's links depend on who is signed in, so this renders inside a Suspense boundary. */
export async function SiteNav() {
  const viewer = await getViewer();
  return (
    <>
      <Link href="/standings" className={link}>
        Standings
      </Link>
      {viewer?.profileId && (
        <>
          <Link href="/picks" className={link}>
            Picks
          </Link>
          <Link href="/picks/season" className={link}>
            Season
          </Link>
          <Link href="/picks/team" className={link}>
            My team
          </Link>
        </>
      )}
      {viewer?.isAdmin && (
        <Link href="/admin" className={link}>
          Admin
        </Link>
      )}
      <span className="ml-auto flex items-center gap-3">
        {viewer ? (
          <>
            <form action={signOutAction}>
              <button type="submit" className={link}>
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className={link}>
            Sign in
          </Link>
        )}
      </span>
    </>
  );
}

/** Shown while the signed-in state loads. */
export function SiteNavFallback() {
  return (
    <Link href="/standings" className={link}>
      Standings
    </Link>
  );
}
