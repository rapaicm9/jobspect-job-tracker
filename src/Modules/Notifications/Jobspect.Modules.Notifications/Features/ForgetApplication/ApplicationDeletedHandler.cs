using Jobspect.Modules.Applications.Contracts;
using Jobspect.Modules.Notifications.Persistence;
using Jobspect.SharedKernel.Events;
using Microsoft.EntityFrameworkCore;

namespace Jobspect.Modules.Notifications.Features.ForgetApplication;

/// <summary>
/// An application is gone, so everything this module kept about it goes too: the
/// reminders it raised, and the row the follow-up scan was watching.
/// <para>
/// <b>A delete rather than a retraction, and the two are not interchangeable.</b>
/// <c>RetractApplicationAsync</c> moves the <em>pending</em> rows to cancelled,
/// which is right for a closing - the application is still there, and its history
/// of what was once armed is still about something. Here it is not. A delivered
/// reminder would stay in the feed carrying a deep link to an application that no
/// longer answers, and a dismissed one would sit in the record of an application
/// nobody can look up. Cancelling reaches neither.
/// </para>
/// <para>
/// The tracked row has to go for a different reason: it is scheduling input, and
/// leaving it would have the follow-up scan notice an application still waiting
/// for an answer and raise a nudge about something that does not exist.
/// </para>
/// <para>
/// Deliveries are not deleted here, for the reason erasure gives: a delivery says
/// nothing without its reminder, so the foreign key cascades and the database
/// takes them as the reminders go.
/// </para>
/// <para>
/// <b>No tombstone, unlike the read model next door, and the asymmetry is
/// deliberate.</b> A late event can arm a reminder against an application already
/// deleted - the arming guard covers the common case, since it reads across every
/// state and finds this deletion's own rows gone rather than stale, but a slot
/// that had never been armed leaves nothing to compare against. What that costs is
/// one reminder in a feed, visible and dismissible, for an application whose page
/// says plainly that it is not there. What a tombstone costs is a table and a
/// predicate on every arming path. The read model's case is the opposite - a
/// resurrected row there is invisible, permanent, and skews every figure - which
/// is why it has one and this does not.
/// </para>
/// <para>
/// Two set-based statements, each idempotent, so a redelivery finds nothing left
/// to do. No transaction: neither depends on the other having happened, and the
/// outbox already retries the whole event, which is the layer worth retrying at.
/// </para>
/// </summary>
internal sealed class ApplicationDeletedHandler(NotificationsDbContext dbContext)
    : IEventHandler<ApplicationDeleted>
{
    public async Task HandleAsync(ApplicationDeleted integrationEvent, CancellationToken cancellationToken)
    {
        var applicationId = integrationEvent.ApplicationId;

        await dbContext.Reminders
            .Where(reminder => reminder.ApplicationId == applicationId)
            .ExecuteDeleteAsync(cancellationToken);

        await dbContext.TrackedApplications
            .Where(tracked => tracked.ApplicationId == applicationId)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
