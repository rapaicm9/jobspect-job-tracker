using Jobspect.Modules.Applications.Features;
using Jobspect.Modules.Identity.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Jobspect.Modules.Applications.Features.DeleteApplication;

/// <summary>
/// <c>DELETE /applications/{id}</c> - removes one of the caller's applications and
/// everything hanging off it. Another user's application is a 404, and so is a
/// second delete of the same one.
/// <para>
/// Not a transition to a hidden stage. The pipeline records what happened to an
/// application, and "the user typed it twice" is not something that happened to
/// it - there is no outcome to file a mistake under. An archive flag would put a
/// predicate on every read in this module, which is a larger and quieter surface
/// than the delete itself.
/// </para>
/// <para>
/// No <c>Idempotency-Key</c>, and none is offered: the replay cache covers POSTs,
/// and this needs no cover. A retried delete finds the row already gone and says
/// so, which is the same answer as the first call for a caller that only wants it
/// gone.
/// </para>
/// </summary>
internal static class DeleteApplicationEndpoint
{
    public static void Map(IEndpointRouteBuilder applications) =>
        applications.MapDelete("/{id:guid}", HandleAsync)
            .WithName("deleteApplication")
            .RequireAuthorization();

    private static async Task<Results<NoContent, ProblemHttpResult>> HandleAsync(
        Guid id,
        IUserContext userContext,
        DeleteApplicationHandler handler,
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
