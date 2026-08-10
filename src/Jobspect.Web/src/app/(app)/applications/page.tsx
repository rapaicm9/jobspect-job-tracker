import type { Metadata } from "next";

import { logout } from "@/features/auth";
import { getAccount, requireSession } from "@/server/dal";
import { Button } from "@/ui/button";

export const metadata: Metadata = { title: "Applications — Jobspect" };

// A placeholder, and the first page in the product that requires a session. The
// dense table and everything around it arrive with the next sprint; what this
// carries until then is proof that the session layer works end to end - the
// cookie resolves, the token refreshes under lock, and the API answers to it.
export default async function ApplicationsPage() {
  await requireSession();
  const account = await getAccount();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {account?.email ?? "an unknown account"}.
        </p>
      </div>

      <form action={logout}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
