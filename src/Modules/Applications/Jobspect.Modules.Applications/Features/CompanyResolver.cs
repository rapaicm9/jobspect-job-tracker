using Jobspect.Modules.Applications.Domain;
using Jobspect.Modules.Applications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Jobspect.Modules.Applications.Features;

/// <summary>
/// The company an application ends up referencing, named as well as identified.
/// The name comes back because the responses carry one and the caller would
/// otherwise have to read what this method just read.
/// </summary>
internal sealed record ResolvedCompany(Guid Id, string Name);

/// <summary>
/// Turns a create/update request's company inputs into the company the application
/// should reference, honouring the picker's two modes: an existing company chosen
/// by <c>companyId</c>, or a new one typed as <c>companyName</c>. The request
/// validator has already ensured at most one is set.
/// <para>
/// A new company is <em>added but not saved</em> - the calling handler commits it
/// alongside the application and its first activity entry in one transaction, so
/// a company never lingers without the application that introduced it. Resolving a
/// name reuses an exact (case-insensitive) match first, since §3.3 is exact
/// selection with no fuzzy dedup, so "creating" the same company twice references
/// the one row instead of duplicating it.
/// </para>
/// </summary>
internal sealed class CompanyResolver(ApplicationsDbContext dbContext)
{
    public async Task<Result<ResolvedCompany?>> ResolveAsync(
        UserId ownerId, Guid? companyId, string? companyName, CancellationToken cancellationToken)
    {
        if (companyId is { } id)
        {
            // Ownership is still the query, so a company that is not the caller's
            // own comes back as no row at all.
            var owned = await dbContext.Companies
                .Where(c => c.Id == id && c.OwnerId == ownerId)
                .Select(c => new { c.Id, c.Name })
                .FirstOrDefaultAsync(cancellationToken);

            return owned is null
                ? ApplicationErrors.UnknownCompany(id)
                : new ResolvedCompany(owned.Id, owned.Name);
        }

        var name = companyName?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return (ResolvedCompany?)null;
        }

        // The stored name, not the typed one: the match is case-insensitive, so
        // "globex" against a recorded "Globex" references that company and is
        // answered with how it is written.
        var match = name.ToLowerInvariant();
        var existing = await dbContext.Companies
            .Where(c => c.OwnerId == ownerId && c.Name.ToLower() == match)
            .Select(c => new { c.Id, c.Name })
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is not null)
        {
            return new ResolvedCompany(existing.Id, existing.Name);
        }

        // Id generated here so the application can carry the FK in the same
        // SaveChanges; the row is queued, not committed.
        var company = new Company { Id = Guid.CreateVersion7(), OwnerId = ownerId, Name = name };
        dbContext.Companies.Add(company);
        return new ResolvedCompany(company.Id, company.Name);
    }
}
