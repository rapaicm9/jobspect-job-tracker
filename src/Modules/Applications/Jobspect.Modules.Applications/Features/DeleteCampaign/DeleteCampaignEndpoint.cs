using Jobspect.Modules.Applications.Features;
using Jobspect.Modules.Identity.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Jobspect.Modules.Applications.Features.DeleteCampaign;

/// <summary>
/// <c>DELETE /campaigns/{id}</c> - removes one of the caller's campaigns, moving its
/// applications to the default first. Another user's campaign is a 404; the default
/// is a 409.
/// <para>
/// The cheapest delete in the module, and the only one that costs nothing: a
/// campaign holds the grouping and none of the content, so removing it can be
/// undone by making another. A contact, an interview and a custom field all hold
/// something the user wrote and are retired rather than removed. An application
/// holds the most of all and can still be deleted outright - see
/// <c>DeleteApplicationEndpoint</c> - because the alternative there was hiding a
/// row the user asked to be rid of.
/// </para>
/// <para>
/// Not gated, and deliberately: this is how an account that has lost the entitlement
/// returns to a single campaign. Refusing it would leave such an account holding
/// campaigns it can neither use nor be rid of.
/// </para>
/// </summary>
internal static class DeleteCampaignEndpoint
{
    public static void Map(IEndpointRouteBuilder campaigns) =>
        campaigns.MapDelete("/{id:guid}", HandleAsync)
            .WithName("deleteCampaign")
            .RequireAuthorization();

    private static async Task<Results<NoContent, ProblemHttpResult>> HandleAsync(
        Guid id,
        IUserContext userContext,
        DeleteCampaignHandler handler,
        CancellationToken cancellationToken)
    {
        if (userContext.UserId is not { } ownerId)
        {
            return Caller.MissingSubject.ToProblem();
        }

        var result = await handler.HandleAsync(ownerId, id, cancellationToken);
        return result.IsSuccess
            ? TypedResults.NoContent()
            : result.Error.ToProblem();
    }
}
