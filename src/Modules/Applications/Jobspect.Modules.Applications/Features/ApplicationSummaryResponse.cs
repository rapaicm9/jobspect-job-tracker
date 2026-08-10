using Jobspect.Modules.Applications.Domain;

namespace Jobspect.Modules.Applications.Features;

/// <summary>
/// An application as a list row - what a board or table shows at a glance, not the
/// full record. Narrower than <see cref="ApplicationResponse"/> on purpose: no
/// posting url, no offer-decision deadline, no document labels and no custom-field
/// answers, all of which belong to the one application a reader has opened.
/// <para>
/// What it does carry is every column a table shows, because the alternative is a
/// screen that reads the detail of each row it renders. <see cref="CompanyName"/>
/// is the reason this matters more than convenience: company search is a
/// type-ahead with a minimum term and a result cap, so a client holding an id has
/// no way to turn it into a name.
/// </para>
/// </summary>
internal sealed record ApplicationSummaryResponse(
    Guid Id,
    Guid CampaignId,
    Guid? CompanyId,
    string? CompanyName,
    Stage Stage,
    string Role,
    MoneyResponse? Compensation,
    string? Location,
    WorkMode? WorkMode,
    string? Source,
    DateOnly AppliedDate,
    DateOnly? ApplicationDeadline,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

internal static class ApplicationSummaryMapping
{
    /// <summary>
    /// The row as a list entry. The company name arrives from the caller rather
    /// than from a navigation property: one lookup for a whole page beats one join
    /// this list cannot express on both of its query paths.
    /// </summary>
    public static ApplicationSummaryResponse ToSummary(
        this Application application, string? companyName) => new(
        application.Id,
        application.CampaignId,
        application.CompanyId,
        companyName,
        application.Stage,
        application.Role,
        application.Compensation is { } money ? new MoneyResponse(money.Amount, money.Currency) : null,
        application.Location,
        application.WorkMode,
        application.Source,
        application.AppliedDate,
        application.ApplicationDeadline,
        application.CreatedAt,
        application.UpdatedAt);
}
