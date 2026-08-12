using System.Net;
using Jobspect.IntegrationTests.Infrastructure;
using Shouldly;

namespace Jobspect.IntegrationTests;

/// <summary>
/// <c>GET /api/v1/applications</c> against a real database: a user's own
/// applications, newest applied first, and never anyone else's.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ListApplicationsEndpointTests(ApiFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Returns_the_callers_applications_newest_applied_first()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await CreateAsync(tokens.AccessToken, "Middle", "2026-07-15");
        await CreateAsync(tokens.AccessToken, "Newest", "2026-07-20");
        await CreateAsync(tokens.AccessToken, "Oldest", "2026-07-10");

        var applications = await (await _client.ListApplicationsAsync(tokens.AccessToken)).ReadApplicationListAsync();

        applications.Select(a => a.Role).ShouldBe(["Newest", "Middle", "Oldest"]);
    }

    [Fact]
    public async Task Does_not_return_another_users_applications()
    {
        var mine = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var theirs = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await CreateAsync(theirs.AccessToken, "Theirs", "2026-07-20");
        await CreateAsync(mine.AccessToken, "Mine", "2026-07-20");

        var applications = await (await _client.ListApplicationsAsync(mine.AccessToken)).ReadApplicationListAsync();

        applications.ShouldHaveSingleItem().Role.ShouldBe("Mine");
    }

    [Fact]
    public async Task Returns_empty_when_the_user_has_none()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        var applications = await (await _client.ListApplicationsAsync(tokens.AccessToken)).ReadApplicationListAsync();

        applications.ShouldBeEmpty();
    }

    [Fact]
    public async Task Requires_authentication()
    {
        var response = await _client.ListApplicationsAsync(accessToken: null);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Carries_every_column_a_table_shows()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        (await _client.CreateApplicationAsync(tokens.AccessToken, new
        {
            role = "Platform Engineer",
            companyName = "Acme Corp",
            compensation = new { amount = 95000m, currency = "EUR" },
            location = "Rotterdam",
            workMode = "Hybrid",
            source = "Referral",
            appliedDate = "2026-07-20",
            applicationDeadline = "2026-08-15",
        })).StatusCode.ShouldBe(HttpStatusCode.Created);

        var row = (await (await _client.ListApplicationsAsync(tokens.AccessToken))
            .ReadApplicationListAsync()).ShouldHaveSingleItem();

        // The company's name, not just its id. Company search is a type-ahead with a
        // minimum term and a result cap, so a client holding an id has no way to turn
        // it into a name - which would leave the busiest column on the screen empty.
        row.CompanyName.ShouldBe("Acme Corp");
        row.CompanyId.ShouldNotBeNull();

        row.Compensation.ShouldNotBeNull();
        row.Compensation.Amount.ShouldBe(95000m);
        row.Compensation.Currency.ShouldBe("EUR");
        row.Location.ShouldBe("Rotterdam");
        row.Source.ShouldBe("Referral");
        row.WorkMode.ShouldBe("Hybrid");
        row.ApplicationDeadline.ShouldBe(new DateOnly(2026, 8, 15));
    }

    [Fact]
    public async Task Leaves_the_company_name_null_when_there_is_no_company()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await CreateAsync(tokens.AccessToken, "No company", "2026-07-20");

        var row = (await (await _client.ListApplicationsAsync(tokens.AccessToken))
            .ReadApplicationListAsync()).ShouldHaveSingleItem();

        row.CompanyId.ShouldBeNull();
        row.CompanyName.ShouldBeNull();
    }

    [Fact]
    public async Task Resolves_a_name_for_every_company_on_the_page()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        foreach (var company in (string[])["Acme", "Globex", "Initech"])
        {
            (await _client.CreateApplicationAsync(
                tokens.AccessToken, new { role = $"Engineer at {company}", companyName = company }))
                .StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        var rows = await (await _client.ListApplicationsAsync(tokens.AccessToken))
            .ReadApplicationListAsync();

        // One lookup serves the whole page, so a page of distinct companies has to
        // come back as complete as a page of one.
        rows.Select(row => row.CompanyName).ShouldBe(["Acme", "Globex", "Initech"], ignoreOrder: true);
    }

    private async Task CreateAsync(string? accessToken, string role, string appliedDate) =>
        (await _client.CreateApplicationAsync(accessToken, new { role, appliedDate }))
            .StatusCode.ShouldBe(HttpStatusCode.Created);
}
