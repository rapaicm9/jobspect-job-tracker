import type { Metadata } from "next";

import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Settings — Jobspect" };

export default async function SettingsPage() {
  await requireSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Your account, your plan, and the custom fields, campaigns and follow-up rule behind them.
      </p>
    </div>
  );
}
