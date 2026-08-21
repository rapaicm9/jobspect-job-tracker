using Jobspect.Modules.Applications.Contracts;
using Jobspect.SharedKernel.Events;

namespace Jobspect.Modules.Analytics.Features.ProjectApplicationFacts;

/// <summary>
/// An application was removed, so it stops contributing to every figure it was
/// part of.
/// <para>
/// There is nothing to decrement. Each figure is aggregated over the base rows on
/// read rather than accumulated into a counter, so taking the row out of the reads
/// takes the application out of the funnel, the response rate, the durations and
/// the weekly trend in one move - and no arithmetic has to be run backwards to
/// match what the row once contributed.
/// </para>
/// <para>
/// The row itself stays, tombstoned. The alternative loses this module's numbers
/// permanently in a way nothing can repair: see
/// <see cref="Domain.ApplicationFacts.DeletedAt"/>.
/// </para>
/// </summary>
internal sealed class ApplicationDeletedProjection(ApplicationFactsWriter writer)
    : IEventHandler<ApplicationDeleted>
{
    public Task HandleAsync(ApplicationDeleted integrationEvent, CancellationToken cancellationToken) =>
        writer.DeletionAsync(
            integrationEvent.ApplicationId,
            integrationEvent.OwnerId,
            integrationEvent.OccurredAt,
            cancellationToken);
}
