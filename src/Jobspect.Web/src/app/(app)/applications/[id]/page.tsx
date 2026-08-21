import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ActivityTimeline,
  ContactsPanel,
  CustomFieldPanel,
  DeleteApplicationButton,
  DetailFacts,
  DetailHeader,
  DetailQueryProvider,
  EditableFacts,
  getApplication,
  InterviewsPanel,
  legalMoves,
  listActivity,
  listApplicationContacts,
  listApplicationInterviews,
  listCustomFieldDefinitions,
  TransitionMenu,
} from "@/features/applications";
import { listCampaigns } from "@/features/campaigns/server";
import { WORK_MODES } from "@/lib/enums";
import { getAccount, getPlan } from "@/server/dal";

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
  const [application, definitions, contacts, interviews, activity, account, campaigns, plan] =
    await Promise.all([
      getApplication(id),
      listCustomFieldDefinitions(),
      listApplicationContacts(id),
      listApplicationInterviews(id),
      listActivity(id),
      getAccount(),
      listCampaigns(),
      // Read before anything can be edited, because the tier decides what an
      // absent custom-field bag means to the handler - unchanged for an account
      // that may not write it, cleared for one that may.
      getPlan(),
    ]);

  // Another user's application answers 404 exactly as a deleted one does, and
  // this page says the same thing for both. It is absent, not denied.
  if (application === null) notFound();

  const timeZoneId = account?.timeZoneId ?? null;
  const campaignName =
    campaigns.find((campaign) => campaign.id === application.campaignId)?.name ?? null;

  // Computed here because the stage lists live behind `server-only`. The menu is
  // handed the answers rather than the rules.
  const moves = legalMoves(application.stage);

  return (
    // Above everything, so the menu in the header can invalidate the timeline's
    // walk below it. The regions inside stay Server Components.
    <DetailQueryProvider>
      <div className="flex flex-col gap-6">
        <DetailHeader
          application={application}
          campaignId={scope}
          actions={
            <div className="flex items-center gap-2">
              <TransitionMenu
                applicationId={application.id}
                advanceTo={moves.advanceTo}
                closeAs={moves.closeAs}
              />
              <DeleteApplicationButton
                applicationId={application.id}
                role={application.role}
                campaignId={scope}
              />
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {/* The read view stays a Server Component and is handed in as
                children, so saving refreshes it from the server rather than
                rebuilding it from what was just submitted. */}
            <EditableFacts
              application={application}
              definitions={definitions.kind === "loaded" ? definitions.items : []}
              tier={plan?.tier ?? null}
              workModes={WORK_MODES}
              campaignId={scope}
            >
              <DetailFacts
                application={application}
                campaignName={campaignName}
                timeZoneId={timeZoneId}
              />
            </EditableFacts>
          </div>

          <div className="flex flex-col gap-6">
            <InterviewsPanel
              applicationId={application.id}
              interviews={interviews}
              timeZoneId={timeZoneId}
            />
            <ContactsPanel applicationId={application.id} contacts={contacts} />
            <CustomFieldPanel values={application.customFields} definitions={definitions} />
          </div>
        </div>

        {/* Full width below the grid. */}
        <ActivityTimeline
          applicationId={application.id}
          timeZoneId={timeZoneId}
          initialPage={activity.kind === "page" ? activity.page : null}
        />
      </div>
    </DetailQueryProvider>
  );
}
