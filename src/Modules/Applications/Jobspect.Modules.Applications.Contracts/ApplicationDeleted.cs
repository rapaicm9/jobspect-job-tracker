using Jobspect.SharedKernel;
using Jobspect.SharedKernel.Events;

namespace Jobspect.Modules.Applications.Contracts;

/// <summary>
/// An application is gone - the user removed it, and it is not coming back.
/// Analytics drops it from every figure it contributed to; Notifications drops
/// everything still armed against it, and the row it was watching for silence.
/// <para>
/// Published through the outbox, and this one has the sharpest version of the
/// reason: a consumer that misses it has no way at all to notice. The other
/// events announce a change to a row a consumer could in principle be told about
/// again; this one announces the absence of the row, and nothing later will
/// mention it.
/// </para>
/// <para>
/// It carries the ids and nothing else. Every other event here carries the values
/// a consumer cannot derive, because a consumer has to write them down; there is
/// nothing to write down about a deletion, and a payload naming the role or the
/// company would be the user's own account of their job search travelling on the
/// event that exists to be rid of it.
/// </para>
/// </summary>
public sealed record ApplicationDeleted(
    Guid EventId,
    Guid ApplicationId,
    UserId OwnerId,
    DateTimeOffset OccurredAt) : IOutboxEvent
{
    /// <summary>
    /// The name its outbox rows carry. Fixed and independent of the type name, so
    /// renaming this record never orphans rows already written.
    /// </summary>
    public static string EventType => "applications.application_deleted";
}
