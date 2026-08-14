import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ContactsPanel,
  CustomFieldPanel,
  DetailFacts,
  DetailHeader,
  getApplication,
  InterviewsPanel,
  listApplicationContacts,
  listApplicationInterviews,
  listCustomFieldDefinitions,
} from "@/features/applications";
import { listCampaigns } from "@/features/campaigns/server";
import { getAccount } from "@/server/dal";

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await params;

  // Memoised, so naming the tab costs the page below nothing.
  const application = await getApplication(id);
  if (application === null) return { title: "Application — Jobspect" };

  const subject =
    application.companyName === null
      ? application.role
      : `${application.role} at ${application.companyName}`;

  return { title: `${subject} — Jobspect` };
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]">) {
  const { id } = await params;

  // Read straight rather than through a parser cache: one value, wanted by one
  // component, and threading it is cheaper than a cache nothing else reads.
  const { campaignId } = await searchParams;
  const scope = typeof campaignId === "string" ? campaignId : null;

  // In parallel because none of them needs another's answer. The account and the
  // campaigns are already memoised by the shell layout, so both are free here.
  const [application, definitions, contacts, interviews, account, campaigns] = await Promise.all([
    getApplication(id),
    listCustomFieldDefinitions(),
    listApplicationContacts(id),
    listApplicationInterviews(id),
    getAccount(),
    listCampaigns(),
  ]);

  // Another user's application answers 404 exactly as a deleted one does, and
  // this page says the same thing for both. It is absent, not denied.
  if (application === null) notFound();

  const timeZoneId = account?.timeZoneId ?? null;
  const campaignName =
    campaigns.find((campaign) => campaign.id === application.campaignId)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* The transition menu drops into the header's `actions` slot; the activity
          timeline goes full width below this grid. Neither exists yet. */}
      <DetailHeader application={application} campaignId={scope} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetailFacts
            application={application}
            campaignName={campaignName}
            timeZoneId={timeZoneId}
          />
        </div>

        <div className="flex flex-col gap-6">
          <InterviewsPanel interviews={interviews} timeZoneId={timeZoneId} />
          <ContactsPanel contacts={contacts} />
          <CustomFieldPanel values={application.customFields} definitions={definitions} />
        </div>
      </div>
    </div>
  );
}
