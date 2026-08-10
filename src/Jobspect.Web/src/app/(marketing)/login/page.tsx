import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CredentialForm, login, SessionEndedNotice } from "@/features/auth";
import { verifySession, type SessionEndedReason } from "@/server/dal";

export const metadata: Metadata = { title: "Sign in — Jobspect" };

function reasonFrom(value: string | string[] | undefined): SessionEndedReason | null {
  return value === "expired" || value === "revoked" ? value : null;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // The proxy sends a cookie-less request here, but a cookie's presence is not a
  // session - only this can tell the difference, so the already-signed-in case
  // is caught here rather than there.
  const state = await verifySession();
  if (state.status === "active") redirect("/applications");

  const reason = reasonFrom((await searchParams).reason);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="text-primary underline underline-offset-4">
            Create an account
          </Link>
          .
        </p>
      </div>

      {reason !== null && <SessionEndedNotice reason={reason} />}

      <CredentialForm
        action={login}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        passwordAutoComplete="current-password"
      />
    </main>
  );
}
