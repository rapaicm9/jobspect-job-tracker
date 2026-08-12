using System.Text;
using Jobspect.Infrastructure.Persistence;
using Jobspect.Modules.Applications.Domain;
using Jobspect.Modules.Applications.Persistence;
using Jobspect.Modules.Billing.Contracts;
using Jobspect.SharedKernel;
using Jobspect.SharedKernel.Paging;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Jobspect.Modules.Applications.Features.ListApplications;

/// <summary>
/// Lists the caller's own applications. The owner from the token is always the
/// filter, so a user only ever sees their own.
/// <para>
/// Ordering is one of the aggregate's own date columns - applied date newest first
/// unless asked otherwise - or one custom-field answer, which replaces it. Either
/// way the id breaks ties: a UUIDv7, so time-ordered, and without it a page edge
/// could repeat or skip an application among rows sharing a value. Narrowing by
/// campaign, by stage and by a custom-field answer all compose with either
/// ordering.
/// </para>
/// <para>
/// The custom-field parameters are Pro, and the check sits here rather than on the
/// route because both tiers read their applications - it is those parameters that
/// are out of reach, not the call. Narrowing to a campaign or a stage is not gated:
/// a Free account has one campaign, and a downgraded account still has to be able
/// to look inside what it holds.
/// </para>
/// </summary>
internal sealed class ListApplicationsHandler(
    ApplicationsDbContext dbContext,
    CustomFieldFilterResolver filterResolver,
    CustomFieldSortResolver sortResolver,
    OwnershipGuard ownership,
    IEntitlementQuery entitlements)
{
    public async Task<Result<PagedResponse<ApplicationSummaryResponse>>> HandleAsync(
        UserId ownerId,
        Guid? campaignId,
        IReadOnlyCollection<Stage> stages,
        CustomFieldFilter? filter,
        CustomFieldSort? sort,
        BuiltInSort builtInSort,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stages);
        ArgumentNullException.ThrowIfNull(builtInSort);
        ArgumentNullException.ThrowIfNull(page);

        if ((filter is not null || sort is not null)
            && !await entitlements.HasEntitlementAsync(ownerId, Entitlement.CustomFields, cancellationToken))
        {
            return CustomFieldErrors.QueryNotEntitled;
        }

        // A campaign that is not the caller's own is refused rather than answered
        // with an empty page - an empty page already means "nothing matched", and a
        // client cannot tell a mistyped id from a campaign it has emptied.
        if (campaignId is { } id && !await ownership.OwnsCampaignAsync(ownerId, id, cancellationToken))
        {
            return ApplicationErrors.UnknownCampaign(id);
        }

        string? probe = null;
        if (filter is not null)
        {
            var resolved = await filterResolver.ResolveAsync(ownerId, filter, cancellationToken);
            if (resolved.IsFailure)
            {
                return resolved.Error;
            }

            probe = resolved.Value;
        }

        if (sort is null)
        {
            return await ByColumnAsync(ownerId, campaignId, stages, probe, builtInSort, page, cancellationToken);
        }

        var plan = await sortResolver.ResolveAsync(ownerId, sort, cancellationToken);
        return plan.IsFailure
            ? plan.Error
            : await ByAnswerAsync(
                ownerId, campaignId, stages, probe, plan.Value, sort.Tag, page, cancellationToken);
    }

    /// <summary>
    /// Ordered by one of the list's own columns, which LINQ expresses and - for the
    /// ascending cases - an index serves.
    /// <para>
    /// A deadline is optional, and rows without one sort last whichever way the
    /// dates run, so its resume condition has three cases rather than two: past this
    /// date, level with it and past this id, or anywhere in the undated tail. Get
    /// that wrong and a page boundary quietly repeats or drops the rows around it.
    /// </para>
    /// </summary>
    private async Task<Result<PagedResponse<ApplicationSummaryResponse>>> ByColumnAsync(
        UserId ownerId,
        Guid? campaignId,
        IReadOnlyCollection<Stage> stages,
        string? probe,
        BuiltInSort sort,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        var query = Narrow(ownerId, campaignId, stages, probe);

        if (page.Position is { } position)
        {
            if (SortKeys.Position(position.SortKey, sort.Tag) is not { } payload)
            {
                return ApplicationErrors.SortCursorMismatch;
            }

            var resumed = sort.Key is BuiltInSortKey.AppliedDate
                ? ResumeByAppliedDate(query, payload, position.Id, sort.Descending)
                : ResumeByDeadline(query, payload, position.Id, sort.Descending);

            if (resumed is null)
            {
                return ApplicationErrors.SortCursorMismatch;
            }

            query = resumed;
        }

        var ordered = Order(query, sort);
        var rows = await ordered.Take(page.Limit + 1).ToListAsync(cancellationToken);

        return await PageAsync(ownerId, rows, page.Limit, sort.KeyFor, cancellationToken);
    }

    private static IQueryable<Application>? ResumeByAppliedDate(
        IQueryable<Application> query, string payload, Guid lastId, bool descending)
    {
        if (SortKeys.ToDate(payload) is not { } appliedDate)
        {
            return null;
        }

        return descending
            ? query.Where(a =>
                a.AppliedDate < appliedDate || (a.AppliedDate == appliedDate && a.Id < lastId))
            : query.Where(a =>
                a.AppliedDate > appliedDate || (a.AppliedDate == appliedDate && a.Id > lastId));
    }

    /// <summary>
    /// The three-case resume. The first arm cannot let an undated row through even
    /// though it names no null: a comparison against null is null in SQL, never
    /// true, so the undated tail is reached only by the arm that asks for it.
    /// </summary>
    private static IQueryable<Application>? ResumeByDeadline(
        IQueryable<Application> query, string payload, Guid lastId, bool descending)
    {
        if (SortKeys.ToOptionalDate(payload) is not { } resume)
        {
            return null;
        }

        if (!resume.Dated)
        {
            // Already inside the tail, which is walked by id in the sort's own
            // direction - so the dated rows are behind us and stay there.
            return descending
                ? query.Where(a => a.ApplicationDeadline == null && a.Id < lastId)
                : query.Where(a => a.ApplicationDeadline == null && a.Id > lastId);
        }

        var deadline = resume.Date;

        return descending
            ? query.Where(a =>
                a.ApplicationDeadline < deadline
                || (a.ApplicationDeadline == deadline && a.Id < lastId)
                || a.ApplicationDeadline == null)
            : query.Where(a =>
                a.ApplicationDeadline > deadline
                || (a.ApplicationDeadline == deadline && a.Id > lastId)
                || a.ApplicationDeadline == null);
    }

    /// <summary>
    /// Undated rows last in both directions. Ascending gets that from PostgreSQL,
    /// which sorts nulls last for <c>ASC</c>; descending needs the
    /// <c>IS NULL</c> key in front, because <c>DESC</c> alone puts them first.
    /// </summary>
    private static IQueryable<Application> Order(IQueryable<Application> query, BuiltInSort sort) =>
        (sort.Key, sort.Descending) switch
        {
            (BuiltInSortKey.AppliedDate, true) =>
                query.OrderByDescending(a => a.AppliedDate).ThenByDescending(a => a.Id),
            (BuiltInSortKey.AppliedDate, false) =>
                query.OrderBy(a => a.AppliedDate).ThenBy(a => a.Id),
            (_, true) => query
                .OrderBy(a => a.ApplicationDeadline == null)
                .ThenByDescending(a => a.ApplicationDeadline)
                .ThenByDescending(a => a.Id),
            _ => query.OrderBy(a => a.ApplicationDeadline).ThenBy(a => a.Id),
        };

    private IQueryable<Application> Narrow(
        UserId ownerId, Guid? campaignId, IReadOnlyCollection<Stage> stages, string? probe)
    {
        var query = dbContext.Applications
            .AsNoTracking()
            .Where(a => a.OwnerId == ownerId);

        if (campaignId is { } id)
        {
            query = query.Where(a => a.CampaignId == id);
        }

        if (stages.Count > 0)
        {
            query = query.Where(a => stages.Contains(a.Stage));
        }

        if (probe is not null)
        {
            // Containment, not a path comparison: `@>` is the one operator a
            // jsonb_path_ops GIN index serves, and the probe was built to be the
            // JSON this field's values actually are.
            query = query.Where(a => EF.Functions.JsonContains(a.CustomFieldValues, probe));
        }

        return query;
    }

    /// <summary>
    /// Ordered by one custom-field answer, which has to be SQL rather than LINQ:
    /// the ordering is <c>custom_field_values -&gt;&gt; $field</c>, and no
    /// expression tree produces that. Composing an <c>ORDER BY</c> outside a
    /// <c>FromSql</c> would be the only thing that decided row order, so the whole
    /// query - predicate, order, limit - is written here and nothing is layered on
    /// top of it.
    /// <para>
    /// Everything a client sent travels as a parameter, the field id included: it
    /// is the right-hand side of an operator, not a fragment of SQL. The only
    /// pieces built into the text are chosen from the plan - a direction keyword
    /// and whether the column is cast to numeric.
    /// </para>
    /// <para>
    /// Unanswered applications sort last whichever way the answers run, so the
    /// resume condition has three cases rather than two: past this answer, level
    /// with it and past this id, or anywhere in the unanswered tail. Get that
    /// wrong and a page boundary quietly repeats or drops the rows around it.
    /// </para>
    /// </summary>
    private async Task<Result<PagedResponse<ApplicationSummaryResponse>>> ByAnswerAsync(
        UserId ownerId,
        Guid? campaignId,
        IReadOnlyCollection<Stage> stages,
        string? probe,
        CustomFieldSortPlan plan,
        string tag,
        PageRequest page,
        CancellationToken cancellationToken)
    {
        var order = plan.OrderExpression("@fieldId");
        var direction = plan.Descending ? "DESC" : "ASC";
        var past = plan.Descending ? "<" : ">";

        var parameters = new List<NpgsqlParameter>
        {
            new("owner", ownerId.Value),
            new("fieldId", plan.FieldId.ToString()),

            // One more than asked for, so the envelope can tell whether anything
            // follows without counting what follows.
            new("limit", page.Limit + 1),
        };

        var where = new StringBuilder("a.owner_id = @owner");

        // Every narrowing the LINQ path applies has to be applied here too: this
        // query is written whole, so a filter omitted from it is a filter the client
        // asked for and silently did not get.
        if (campaignId is { } id)
        {
            parameters.Add(new NpgsqlParameter("campaignId", id));
            where.Append(" AND a.campaign_id = @campaignId");
        }


        if (stages.Count > 0)
        {
            // The names, because the column stores the converted enum as text.
            parameters.Add(new NpgsqlParameter("stages", stages.Select(s => s.ToString()).ToArray()));
            where.Append(" AND a.stage = ANY(@stages)");
        }

        if (probe is not null)
        {
            parameters.Add(new NpgsqlParameter("probe", probe));
            where.Append(" AND a.custom_field_values @> @probe::jsonb");
        }

        if (page.Position is { } position)
        {
            if (SortKeys.Position(position.SortKey, tag) is not { } payload
                || SortKeys.ToAnswer(payload) is not { } resume)
            {
                return ApplicationErrors.SortCursorMismatch;
            }

            parameters.Add(new NpgsqlParameter("lastId", position.Id));

            if (!resume.Answered)
            {
                where.Append($" AND {order} IS NULL AND a.id {past} @lastId");
            }
            else if (plan.ToParameter(resume.Answer) is { } last)
            {
                parameters.Add(new NpgsqlParameter("last", last));
                where.Append(
                    $" AND (({order} IS NOT NULL AND {order} {past} @last)"
                    + $" OR ({order} = @last AND a.id {past} @lastId)"
                    + $" OR {order} IS NULL)");
            }
            else
            {
                // The cursor decoded and is answer-shaped, but its answer is not
                // this field's kind - it came from a sort on a different field.
                // Refused rather than restarted: a client looping over page one
                // forever is worse than an error.
                return ApplicationErrors.SortCursorMismatch;
            }
        }

        var sql = $"""
            SELECT a.* FROM {ApplicationsDbContext.Schema}.applications AS a
            WHERE {where}
            ORDER BY {order} {direction} NULLS LAST, a.id {direction}
            LIMIT @limit
            """;

        var rows = await dbContext.Applications
            .FromSqlRaw(sql, [.. parameters])
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return await PageAsync(
            ownerId,
            rows,
            page.Limit,
            a => SortKeys.Tagged(tag, SortKeys.ForAnswer(plan.Render(a.CustomFieldValues))),
            cancellationToken);
    }

    /// <summary>
    /// One page from rows both paths have already read, with each row's company
    /// resolved to a name.
    /// <para>
    /// Rows map after materialization on both paths: the stored stage and work mode
    /// are converted enums, so the string projection can't happen in SQL, and the
    /// company name arrives from a second query rather than a join. A join is not
    /// available to the sorted path - it writes its own <c>ORDER BY</c>, and
    /// composing anything over a <c>FromSql</c> wraps it in a subquery that
    /// discards that ordering - so one lookup keyed by the page's company ids is
    /// what both paths can share.
    /// </para>
    /// </summary>
    private async Task<PagedResponse<ApplicationSummaryResponse>> PageAsync(
        UserId ownerId,
        List<Application> rows,
        int limit,
        Func<Application, string> sortKey,
        CancellationToken cancellationToken)
    {
        var names = await CompanyNamesAsync(ownerId, rows, cancellationToken);

        return PageBuilder.FromRows(
            rows,
            limit,
            a => a.ToSummary(Name(names, a.CompanyId)),
            a => new Cursor(a.Id, sortKey(a)));
    }

    /// <summary>
    /// The names of the companies this page names, owner-scoped like every other
    /// read here - the application already belongs to the caller, and the query
    /// staying the ownership boundary is what keeps that true if this is ever
    /// called from somewhere else.
    /// </summary>
    private async Task<Dictionary<Guid, string>> CompanyNamesAsync(
        UserId ownerId, List<Application> rows, CancellationToken cancellationToken)
    {
        var ids = rows
            .Select(a => a.CompanyId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();

        if (ids.Length == 0)
        {
            return [];
        }

        return await dbContext.Companies
            .AsNoTracking()
            .Where(c => c.OwnerId == ownerId && ids.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);
    }

    /// <summary>
    /// Null when the application names no company, and also when it names one this
    /// query did not return - a company deleted between the two reads is a name
    /// nobody can supply, not a reason to fail the page.
    /// </summary>
    private static string? Name(Dictionary<Guid, string> names, Guid? companyId) =>
        companyId is { } id && names.TryGetValue(id, out var name) ? name : null;
}
