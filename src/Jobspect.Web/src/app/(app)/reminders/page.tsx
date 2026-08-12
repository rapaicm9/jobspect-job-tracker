import type { Metadata } from "next";

import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Reminders — Jobspect" };

export default async function RemindersPage() {
  await requireSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reminders</h1>
      <p className="text-sm text-muted-foreground">
        Interviews, deadlines and follow-ups Jobspect has raised, most recent first.
      </p>
    </div>
  );
}
