using System.Net;
using Jobspect.IntegrationTests.Infrastructure;
using Shouldly;

namespace Jobspect.IntegrationTests;

/// <summary>
/// Narrowing the application list to a set of pipeline stages, against real
/// PostgreSQL.
/// <para>
/// The parameter repeats because the question people actually ask is "what is still
/// alive", which is four stages at once. A single value would answer it in four
/// requests the client then has to merge - and merging paged feeds by hand is how a
/// list starts disagreeing with itself.
/// </para>
/// <para>
/// It has to narrow on both query paths. The custom-field sort writes its own SQL,
/// so a filter added to the LINQ path alone is one the client asked for and silently
/// did not get - a list that returns everything looks like data, not like a bug.
/// </para>
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class StageFilterTests(ApiFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Narrows_to_one_stage()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var screening = await AtStageAsync(tokens, "Screening", "Screening");
        await AtStageAsync(tokens, "Applied");

        (await RolesAsync(tokens, "Screening")).ShouldBe([screening]);
    }

    [Fact]
    public async Task Narrows_to_several_stages_at_once()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var applied = await AtStageAsync(tokens, "Applied");
        var screening = await AtStageAsync(tokens, "Screening", "Screening");
        var interview = await AtStageAsync(tokens, "Interview", "Screening", "Interview");
        await AtStageAsync(tokens, "Rejected", "Rejected");

        // The four active stages, which is what "still alive" means and what one
        // value cannot say.
        var alive = await RolesAsync(tokens, "Applied", "Screening", "Interview", "Offer");

        alive.ShouldBe([interview, screening, applied], ignoreOrder: true);
    }

    [Fact]
    public async Task Repeating_a_stage_narrows_to_the_same_rows()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var screening = await AtStageAsync(tokens, "Screening", "Screening");

        (await RolesAsync(tokens, "Screening", "Screening")).ShouldBe([screening]);
    }

    [Fact]
    public async Task A_value_that_is_not_a_stage_is_refused()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        // Named, not ignored: a list that quietly returns everything when it was
        // asked to narrow is the kind of bug found late.
        await (await _client.ListApplicationsAsync(tokens.AccessToken, stages: ["Wishlist"]))
            .ShouldBeValidationProblemAsync("stage");
    }

    [Fact]
    public async Task Stages_are_matched_case_insensitively()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var screening = await AtStageAsync(tokens, "Screening", "Screening");

        (await RolesAsync(tokens, "screening")).ShouldBe([screening]);
    }

    [Fact]
    public async Task Composes_with_a_campaign()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await fixture.UnlockProAsync(_client, tokens, Ct);
        var other = await (await _client.CreateCampaignAsync(tokens.AccessToken, new { name = "Second search" }))
            .ReadCampaignAsync();

        await AtStageAsync(tokens, "Here", "Screening");
        var there = await (await _client.CreateApplicationAsync(
            tokens.AccessToken, new { role = "There", campaignId = other.Id })).ReadApplicationAsync();
        await _client.TransitionApplicationAsync(tokens.AccessToken, there.Id, "Screening");

        // Both are at Screening, so only the campaign separates them.
        (await RolesAsync(tokens, "Screening")).ShouldBe(["Here", "There"], ignoreOrder: true);

        var rows = await (await _client.ListApplicationsAsync(
            tokens.AccessToken, campaignId: other.Id, stages: ["Screening"])).ReadApplicationListAsync();

        rows.Select(row => row.Role).ShouldBe(["There"]);
    }

    [Fact]
    public async Task Composes_with_a_custom_field_sort_which_writes_its_own_sql()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await fixture.UnlockProAsync(_client, tokens, Ct);
        var field = await (await _client.CreateCustomFieldAsync(
            tokens.AccessToken, new { label = "Priority", type = "number" })).ReadCustomFieldAsync();

        var kept = await (await _client.CreateApplicationAsync(tokens.AccessToken, new
        {
            role = "Kept",
            customFields = new Dictionary<string, object?> { [field.Id.ToString()] = 2 },
        })).ReadApplicationAsync();
        await _client.TransitionApplicationAsync(tokens.AccessToken, kept.Id, "Screening");

        // Left at Applied, and answering the sorted field so it would be returned
        // by an unnarrowed sort.
        await _client.CreateApplicationAsync(tokens.AccessToken, new
        {
            role = "Dropped",
            customFields = new Dictionary<string, object?> { [field.Id.ToString()] = 1 },
        });

        var rows = await (await _client.ListApplicationsAsync(
                tokens.AccessToken,
                sortCustomFieldId: field.Id,
                sortDirection: "asc",
                stages: ["Screening"]))
            .ReadApplicationListAsync();

        rows.Select(row => row.Role).ShouldBe(["Kept"]);
    }

    [Fact]
    public async Task Composes_with_a_built_in_sort()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var older = await (await _client.CreateApplicationAsync(
            tokens.AccessToken, new { role = "Older", appliedDate = "2026-07-01" })).ReadApplicationAsync();
        var newer = await (await _client.CreateApplicationAsync(
            tokens.AccessToken, new { role = "Newer", appliedDate = "2026-07-20" })).ReadApplicationAsync();
        await _client.TransitionApplicationAsync(tokens.AccessToken, older.Id, "Screening");
        await _client.TransitionApplicationAsync(tokens.AccessToken, newer.Id, "Screening");
        await AtStageAsync(tokens, "Untouched");

        var rows = await (await _client.ListApplicationsAsync(
                tokens.AccessToken, sortBy: "appliedDate", sortDirection: "asc", stages: ["Screening"]))
            .ReadApplicationListAsync();

        rows.Select(row => row.Role).ShouldBe(["Older", "Newer"]);
    }

    [Fact]
    public async Task Never_reaches_another_users_applications()
    {
        var mine = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var theirs = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await AtStageAsync(theirs, "Theirs", "Screening");
        var mineAtScreening = await AtStageAsync(mine, "Mine", "Screening");

        (await RolesAsync(mine, "Screening")).ShouldBe([mineAtScreening]);
    }

    [Fact]
    public async Task Needs_no_entitlement()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        // Free accounts read their own pipeline. The custom-field parameters are the
        // paid capability; narrowing to a stage is not one.
        (await _client.ListApplicationsAsync(tokens.AccessToken, stages: ["Applied"]))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    /// <summary>Creates an application and walks it to the given stages in order.</summary>
    private async Task<string> AtStageAsync(AuthTokens tokens, string role, params string[] stages)
    {
        var application = await (await _client.CreateApplicationAsync(tokens.AccessToken, new { role }))
            .ReadApplicationAsync();

        foreach (var stage in stages)
        {
            (await _client.TransitionApplicationAsync(tokens.AccessToken, application.Id, stage))
                .StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        return role;
    }

    private async Task<IReadOnlyList<string>> RolesAsync(AuthTokens tokens, params string[] stages) =>
        [.. (await (await _client.ListApplicationsAsync(tokens.AccessToken, stages: stages))
            .ReadApplicationListAsync()).Select(row => row.Role)];
}
