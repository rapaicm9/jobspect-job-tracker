using Jobspect.Modules.Applications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Jobspect.Modules.Applications.Features;

/// <summary>
/// The name of the company an application references, for the reads that return
/// an application without having resolved one. Create and update already hold it
/// - <see cref="CompanyResolver"/> answers with the company it resolved - so this
/// serves get and transition, which only ever see an id.
/// <para>
/// One company at a time. A page of them is a different question and
/// <c>ListApplicationsHandler</c> answers it with one keyed lookup for the whole
/// page, because a join is not available to the sort path it shares.
/// </para>
/// </summary>
internal sealed class CompanyNameLookup(ApplicationsDbContext dbContext)
{
    /// <summary>
    /// Owner-scoped like every other read here - the application already belongs
    /// to the caller, and the query staying the ownership boundary is what keeps
    /// that true if this is ever called from somewhere else.
    /// <para>
    /// Null when the application names no company, and also when it names one this
    /// query did not return: a company deleted between the two reads is a name
    /// nobody can supply, not a reason to fail the read.
    /// </para>
    /// </summary>
    public async Task<string?> ForAsync(
        UserId ownerId, Guid? companyId, CancellationToken cancellationToken) =>
        companyId is { } id
            ? await dbContext.Companies
                .AsNoTracking()
                .Where(c => c.Id == id && c.OwnerId == ownerId)
                .Select(c => c.Name)
                .FirstOrDefaultAsync(cancellationToken)
            : null;
}
