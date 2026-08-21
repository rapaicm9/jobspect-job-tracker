using Jobspect.Infrastructure.Outbox;
using Jobspect.Modules.Applications.Contracts;
using Jobspect.Modules.Applications.Domain;
using Jobspect.Modules.Applications.Features;
using Jobspect.Modules.Applications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Jobspect.Modules.Applications.Features.DeleteApplication;

/// <summary>
/// Removes one of the caller's applications. Ownership is the query, so another
/// user's application is a 404 rather than a refusal that confirms it exists.
/// <para>
/// <b>The children go by cascade, deliberately.</b> The activity timeline, the
/// interviews and the contacts attached to this application are all declared
/// <c>Cascade</c> against it, so one statement takes the lot. That is the opposite
/// of the choice erasure makes next door, which lists every table by owner - and
/// the difference is what each is for. Erasure has to account for rows with no
/// application to cascade from, and its explicit list is the module stating what
/// it holds. Here there is exactly one root and the foreign keys already describe
/// its reach.
/// </para>
/// <para>
/// <b>A contact attached to a company as well goes with it</b>, rather than being
/// detached and kept. Keeping it would satisfy the domain invariant - a contact
/// needs an application or a company - and strand the row: contacts are only ever
/// listed against an application, so a company-only contact is one no screen can
/// show and no user can reach again. An unreachable row is worse than the delete
/// they asked for, so the confirmation says the contacts go.
/// </para>
/// <para>
/// The campaign and the company are untouched. Both are referenced <em>by</em> the
/// application rather than the other way round, and both outlive it - a company is
/// shared across applications, and a campaign is the folder this one sat in.
/// </para>
/// <para>
/// The delete and its announcement are one transaction, so there is no instant
/// where the application is gone and nothing has said so. That transaction is
/// handed to a retrying execution strategy, which means the block inside it has to
/// survive being run twice against one <c>DbContext</c> - see the comment at the
/// outbox write.
/// </para>
/// </summary>
internal sealed class DeleteApplicationHandler(ApplicationsDbContext dbContext, TimeProvider timeProvider)
{
    public async Task<Result> HandleAsync(UserId ownerId, Guid id, CancellationToken cancellationToken)
    {
        // Existence and ownership in one question, and only the answer to it: the
        // row is about to go by a set-based statement, and a tracked copy would
        // only be something to remember not to save.
        var exists = await dbContext.Applications
            .AnyAsync(a => a.Id == id && a.OwnerId == ownerId, cancellationToken);
        if (!exists)
        {
            return ApplicationErrors.NotFound(id);
        }

        var now = timeProvider.GetUtcNow();

        // Minted outside the block that records it: the execution strategy may
        // replay that block, and an event id is what a consumer recognizes a
        // redelivery by (ADR 0009), so it has to be the same id each time even
        // though the row carrying it will not be the same row.
        var announcement = new ApplicationDeleted(Guid.CreateVersion7(), id, ownerId, now);

        // The retrying execution strategy refuses a transaction it did not start, so
        // the whole sequence is handed to it to replay as one.
        var strategy = dbContext.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

            // Owner-scoped as well as keyed, so a replay cannot widen: the guard
            // above answered a question about this owner, and the statement that
            // acts on it asks the same one.
            await dbContext.Applications
                .Where(a => a.Id == id && a.OwnerId == ownerId)
                .ExecuteDeleteAsync(cancellationToken);

            // Built here, on every attempt, for the reason DeleteCampaignHandler
            // spells out: a SaveChanges that succeeds under a commit that then
            // fails leaves its entity tracked as Unchanged while the database has
            // rolled it back, and Add is a no-op on anything already tracked. A
            // replay reusing that instance would delete the application and record
            // nothing announcing it - a fact no consumer could recover, since the
            // outbox prunes and there is no stream to catch up from.
            dbContext.Outbox.Add(OutboxMessage.For(announcement));
            await dbContext.SaveChangesAsync(cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        });

        return Result.Success();
    }
}
