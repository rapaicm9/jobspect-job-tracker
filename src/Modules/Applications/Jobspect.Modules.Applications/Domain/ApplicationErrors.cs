using Jobspect.SharedKernel;

namespace Jobspect.Modules.Applications.Domain;

/// <summary>Failures raised by the application aggregate.</summary>
internal static class ApplicationErrors
{
    /// <summary>
    /// The requested pipeline move violates the state machine (a backwards or
    /// same-stage move between active stages, or <c>Accepted</c> from anywhere
    /// but <c>Offer</c> - including out of a terminal outcome). A validation
    /// failure - it surfaces as 422/ProblemDetails at the transition endpoint.
    /// </summary>
    public static Error IllegalTransition(Stage from, Stage to) =>
        Error.Validation(
            "application.illegal_transition",
            $"An application cannot move from {from} to {to}.");

    /// <summary>
    /// No application with this id is owned by the caller. A resource owned by
    /// another user is reported the same way - a 404, never a 403, so ownership
    /// stays unobservable.
    /// </summary>
    public static Error NotFound(Guid id) =>
        Error.NotFound("application.not_found", $"No application with id {id} exists.");

    /// <summary>
    /// The application references a company the caller does not own (or that does
    /// not exist). A bad reference in the request body is a validation failure - a
    /// 422, not a 404 about the company.
    /// </summary>
    public static Error UnknownCompany(Guid companyId) =>
        Error.Validation("application.unknown_company", $"No company with id {companyId} exists.");

    /// <summary>
    /// The account has no default campaign to place the application in. Every
    /// account is provisioned one at registration, so this is an invariant breach,
    /// not a client error.
    /// </summary>
    public static readonly Error NoDefaultCampaign =
        Error.Failure("application.no_default_campaign", "This account has no default campaign.");

    /// <summary>
    /// The request names a campaign the caller does not own (or that does not
    /// exist). A bad reference in a request is a validation failure - a 422, not a
    /// 404 about the campaign, which would confirm whose it is.
    /// </summary>
    public static Error UnknownCampaign(Guid campaignId) =>
        Error.Validation("application.unknown_campaign", $"No campaign with id {campaignId} exists.");

    /// <summary>
    /// An offer-decision deadline was introduced, or moved, on an application that is
    /// not at <c>Offer</c>. The date only means something once there is an offer to
    /// answer, so acquiring one earlier is a validation failure - a 422.
    /// <para>
    /// It refuses the <em>change</em>, not the value, and the difference is the whole
    /// of the rule. An application leaves <c>Offer</c> only by closing, and it keeps
    /// the deadline it was given - which every read goes on returning, and which a
    /// full-replace edit therefore sends back. Refusing that would make accepting an
    /// offer the moment the application became uneditable, with the only way out
    /// being to drop a date the user entered. Clearing it stays open for the same
    /// reason: an account must always be able to reduce what it holds.
    /// </para>
    /// </summary>
    public static readonly Error OfferDeadlineRequiresOffer = Error.Validation(
        "application.offer_deadline_requires_offer",
        "An offer-decision deadline can only be set or changed while the application is at the Offer stage.");

    /// <summary>
    /// The cursor decodes, but it was issued under a different ordering - another
    /// column, the other direction, or a different custom field. Refused rather
    /// than restarted from the top, which would let a client page the same rows
    /// forever without noticing.
    /// <para>
    /// Lives here rather than with the custom-field errors because every sort this
    /// list offers can raise it, and the alternative to raising it is a page that
    /// looks correct and silently repeats or drops rows.
    /// </para>
    /// </summary>
    public static readonly Error SortCursorMismatch = Error.Validation(
        "cursor.sort_mismatch",
        "The cursor was issued for a different sort. Use the nextCursor returned by a previous page.");

    /// <summary>
    /// A <c>stage</c> query value that is not one of the pipeline's stages. Named
    /// rather than ignored: a list quietly returning everything when it was asked
    /// to narrow is a bug found late.
    /// </summary>
    public static string UnknownStage(string value) =>
        $"'{value}' is not a stage. Use one of: {string.Join(", ", Enum.GetNames<Stage>())}.";
}
