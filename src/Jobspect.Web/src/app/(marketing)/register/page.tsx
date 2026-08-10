import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CredentialForm, register } from "@/features/auth";
import { verifySession } from "@/server/dal";

export const metadata: Metadata = { title: "Create an account — Jobspect" };

export default async function RegisterPage() {
  const state = await verifySession();
  if (state.status === "active") redirect("/applications");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Already have one?{" "}
          <Link href="/login" className="text-primary underline underline-offset-4">
            Sign in
          </Link>
          .
        </p>
      </div>

      <CredentialForm
        action={register}
        submitLabel="Create account"
        pendingLabel="Creating account…"
        passwordAutoComplete="new-password"
        // Stated before submitting rather than discovered afterwards. The API
        // enforces these and answers with every unmet rule at once; showing them
        // up front means most people never see that list.
        passwordHint="At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol."
      />
    </main>
  );
}
