using Jobspect.Modules.Applications.Domain;
using Jobspect.Modules.Applications.Features;
using Jobspect.Modules.Identity.Contracts;
using Jobspect.SharedKernel.Paging;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Jobspect.Modules.Applications.Features.ListApplications;

/// <summary>
/// <c>GET /applications?campaignId=&amp;stage=&amp;customFieldId=&amp;customFieldValue=&amp;sortBy=</c>
/// - one page of the caller's own applications as list rows, newest applied first
/// unless another order is asked for, optionally narrowed to one campaign, to a set
/// of pipeline stages, and to those answering one of the account's custom fields
/// with a given value. Scoped to the token's subject; a user never sees another's.
/// Takes <c>limit</c> and the <c>cursor</c> a previous page returned.
/// <para>
/// The two filter parameters travel together: an id says which field, a value says
/// what to match, and one without the other is a request that cannot be answered.
/// Whether the value suits the field's type needs the definition, so the handler
/// settles that.
/// </para>
/// <para>
/// <c>stage</c> repeats to mean "any of these", which is what makes "everything
/// still alive" one request rather than four. <c>sortBy</c> and
/// <c>sortCustomFieldId</c> are alternatives - a list has one order - and a
/// direction needs one of them to apply to.
/// </para>
/// </summary>
internal static class ListApplicationsEndpoint
{
    public static void Map(IEndpointRouteBuilder applications) =>
        applications.MapGet("", HandleAsync)
            .WithName("listApplications")
            .RequireAuthorization();

    private static async Task<Results<Ok<PagedResponse<ApplicationSummaryResponse>>, ProblemHttpResult>> HandleAsync(
        Guid? campaignId,
        string[]? stage,
        Guid? customFieldId,
        string? customFieldValue,
        string? sortBy,
        Guid? sortCustomFieldId,
        string? sortDirection,
        int? limit,
        string? cursor,
        IUserContext userContext,
        ListApplicationsHandler handler,
        CancellationToken cancellationToken)
    {
        if (userContext.UserId is not { } ownerId)
        {
            return Caller.MissingSubject.ToProblem();
        }

        if (ValidateQuery(stage, customFieldId, customFieldValue, sortBy, sortCustomFieldId, sortDirection)
            is { } queryErrors)
        {
            return Problems.Validation(queryErrors);
        }

        if (PagingParameters.Validate(limit, cursor) is { } errors)
        {
            return Problems.Validation(errors);
        }

        var filter = customFieldId is { } fieldId ? new CustomFieldFilter(fieldId, customFieldValue!) : null;
        var sort = sortCustomFieldId is { } sortFieldId
            ? new CustomFieldSort(sortFieldId, Descending(sortDirection))
            : null;

        // Trusted to parse, because ValidateQuery refused every value that would
        // not. The default carries the order this list has always had.
        var builtInSort = BuiltInSort.Parse(sortBy, Descending(sortDirection)) ?? BuiltInSort.Default;

        var result = await handler.HandleAsync(
            ownerId,
            campaignId,
            Stages(stage),
            filter,
            sort,
            builtInSort,
            PagingParameters.From(limit, cursor),
            cancellationToken);

        return result.IsSuccess
            ? TypedResults.Ok(result.Value)
            : result.Error.ToProblem();
    }

    /// <summary>
    /// The requested stages, deduplicated - repeating one narrows to the same rows
    /// as naming it once, so it is not worth refusing.
    /// </summary>
    private static IReadOnlyCollection<Stage> Stages(string[]? stage) =>
        stage is null
            ? []
            : [.. stage
                .Select(value => Enum.Parse<Stage>(value, ignoreCase: true))
                .Distinct()];

    /// <summary>Descending unless the client asked otherwise; the default list reads newest-first too.</summary>
    private static bool Descending(string? sortDirection) =>
        !string.Equals(sortDirection, "asc", StringComparison.OrdinalIgnoreCase);

    private static Dictionary<string, string[]>? ValidateQuery(
        string[]? stage,
        Guid? customFieldId,
        string? customFieldValue,
        string? sortBy,
        Guid? sortCustomFieldId,
        string? sortDirection)
    {
        var errors = new ValidationErrors();

        ValidateFilter(customFieldId, customFieldValue, errors);
        ValidateStages(stage, errors);

        // Parsed here rather than bound as the enum: a parameter typed as Stage or
        // as a sort enum hands an unknown value to the model binder, which answers a
        // bare 400 with nothing naming the parameter. Every refusal on this endpoint
        // is a field-keyed 422 instead.
        if (sortBy is not null && BuiltInSort.Parse(sortBy, descending: true) is null)
        {
            errors.Add("sortBy", "Applications can be sorted by appliedDate or applicationDeadline.");
        }

        if (sortDirection is not null
            && !string.Equals(sortDirection, "asc", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(sortDirection, "desc", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("sortDirection", "The sort direction must be asc or desc.");
        }

        // A direction with nothing to apply it to would be quietly ignored, and a
        // client that believes it asked for an order it didn't get is the bug this
        // avoids.
        if (sortDirection is not null && sortBy is null && sortCustomFieldId is null)
        {
            errors.Add("sortDirection", "A sortDirection needs the sortBy or sortCustomFieldId it orders by.");
        }

        // A list has one order. Two requested orders means one of them is being
        // ignored, and the client cannot tell which.
        if (sortBy is not null && sortCustomFieldId is not null)
        {
            errors.Add("sortBy", "A list is ordered by sortBy or by sortCustomFieldId, not both.");
        }

        return errors.ToResultOrNull();
    }

    private static void ValidateStages(string[]? stage, ValidationErrors errors)
    {
        if (stage is null)
        {
            return;
        }

        foreach (var value in stage)
        {
            if (!Enum.TryParse<Stage>(value, ignoreCase: true, out _))
            {
                errors.Add("stage", ApplicationErrors.UnknownStage(value));
            }
        }
    }

    /// <summary>
    /// The two filter parameters are meaningless apart, so half a filter is a
    /// client error rather than a filter quietly ignored - a list that returns
    /// everything when it was asked to narrow is the kind of bug found late.
    /// </summary>
    private static void ValidateFilter(Guid? customFieldId, string? customFieldValue, ValidationErrors errors)
    {
        if (customFieldId is null && customFieldValue is not null)
        {
            errors.Add("customFieldId", "A customFieldValue needs the customFieldId it applies to.");
        }

        if (customFieldId is not null && customFieldValue is null)
        {
            errors.Add("customFieldValue", "A customFieldId needs the customFieldValue to match.");
        }
    }
}
