import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreateApplicationForm, listUsedSources } from "@/features/applications";
import { withCampaignScope } from "@/features/campaigns";
import { WORK_MODES } from "@/lib/enums";
import { requireSession } from "@/server/dal";

export const metadata: Metadata = { title: "Add an application — Jobspect" };

/**
 * A route rather than a dialog, and the entry points are the reason: the list,
 * the board and the command palette all offer this, and the palette fires from
 * whichever screen the user is on. A route makes each of those a plain link with
 * no shared state anywhere.
 */
export default async function NewApplicationPage({ searchParams }: PageProps<"/applications/new">) {
  await requireSession();

  // Read straight rather than through a parser cache: one value, wanted by one
  // component, and threading it is cheaper than a cache nothing else reads.
  const { campaignId } = await searchParams;
  const scope = typeof campaignId === "string" ? campaignId : null;

  // With the page rather than from a click, unlike the editor: this route exists
  // only to show the form, so there is no visit that pays for a read it will not
  // use. It answers with an empty list on any failure, and the field degrades to
  // an ordinary text box.
  const sources = await listUsedSources(scope);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={withCampaignScope("/applications", scope)}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All applications
        </Link>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Add an application
          </h1>
          <p className="text-sm text-muted-foreground">
            Only the role is required. Everything else can be filled in later.
          </p>
        </div>
      </div>

      <CreateApplicationForm
        workModes={WORK_MODES}
        sourceSuggestions={sources}
        campaignId={scope}
      />
    </div>
  );
}
