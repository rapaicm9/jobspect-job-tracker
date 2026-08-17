using Jobspect.Modules.Applications.Domain;
using Jobspect.Modules.Applications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Jobspect.Modules.Applications.Features.GetApplication;

/// <summary>
/// Reads one of the caller's applications. Ownership is the query - it filters on
/// the owner from the token - so an id that belongs to someone else is
/// indistinguishable from one that doesn't exist: both return
/// <see cref="ApplicationErrors.NotFound"/>, a 404, never a 403.
/// </summary>
internal sealed class GetApplicationHandler(
    ApplicationsDbContext dbContext, CompanyNameLookup companyNames)
{
    public async Task<Result<ApplicationResponse>> HandleAsync(
        UserId ownerId, Guid id, CancellationToken cancellationToken)
    {
        var application = await dbContext.Applications
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id && a.OwnerId == ownerId, cancellationToken);
        if (application is null)
        {
            return ApplicationErrors.NotFound(id);
        }

        // A second read rather than a join. The response carries a name a client
        // cannot look up for itself - company search is a type-ahead with a
        // minimum term and a result cap - and one keyed read is what the
        // transition handler, which holds a tracked row it cannot project, can do
        // the same way.
        var companyName = await companyNames.ForAsync(ownerId, application.CompanyId, cancellationToken);

        return application.ToResponse(companyName);
    }
}
