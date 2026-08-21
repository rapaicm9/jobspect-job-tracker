using System.Net;
using Jobspect.IntegrationTests.Infrastructure;
using Jobspect.Modules.Applications.Contracts;
using Jobspect.Modules.Applications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Jobspect.IntegrationTests;

/// <summary>
/// Removing an application against a real database. The claims: the row goes and
/// takes everything hanging off it; nothing outliving it is touched; another
/// user's application is absent rather than refused; and the deletion is announced
/// exactly once, because no consumer can learn of it any other way.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class DeleteApplicationEndpointTests(ApiFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Deleting_an_application_removes_it()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);

        var response = await _client.DeleteApplicationAsync(tokens.AccessToken, application.Id);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await _client.GetApplicationAsync(tokens.AccessToken, application.Id))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task It_takes_the_timeline_the_interviews_and_the_contacts_with_it()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);

        await ShouldSucceedAsync(_client.CreateContactAsync(
            tokens.AccessToken, new { applicationId = application.Id, name = "Alice Recruiter" }));
        await ShouldSucceedAsync(_client.CreateInterviewAsync(tokens.AccessToken, application.Id, new
        {
            scheduledAt = "2026-09-01T14:00:00Z",
            type = "technical",
            format = "remote",
        }));
        await ShouldSucceedAsync(_client.AddNoteAsync(
            tokens.AccessToken, application.Id, new { note = "They want a second round." }));

        await ShouldSucceedAsync(_client.DeleteApplicationAsync(tokens.AccessToken, application.Id));

        // Asked of the tables rather than of the endpoints: the children have no
        // route of their own once their application is gone, so a 404 from one
        // would be the parent's absence and would prove nothing about the rows.
        (await ChildRowCountsAsync(application.Id)).ShouldAllBe(child => child.Rows == 0);
    }

    [Fact]
    public async Task A_contact_that_also_belongs_to_a_company_goes_too()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);
        var companyId = application.CompanyId.ShouldNotBeNull();

        var contact = await (await _client.CreateContactAsync(tokens.AccessToken, new
        {
            applicationId = application.Id,
            companyId,
            name = "Alice Recruiter",
        })).ReadContactAsync();

        await ShouldSucceedAsync(_client.DeleteApplicationAsync(tokens.AccessToken, application.Id));

        // Detaching it and keeping the company link would satisfy the invariant and
        // strand the row: contacts are only ever listed against an application, so
        // what survived would be unreachable rather than kept.
        (await _client.GetContactAsync(tokens.AccessToken, contact.Id))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task The_campaign_and_the_company_outlive_it()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);
        var campaignId = await fixture.DefaultCampaignIdAsync(UserId.From(tokens.UserId), Ct);
        var companyId = application.CompanyId.ShouldNotBeNull();

        await ShouldSucceedAsync(_client.DeleteApplicationAsync(tokens.AccessToken, application.Id));

        // Both are referenced by the application rather than the other way round,
        // and both are shared: a company spans applications, and a campaign is the
        // folder this one happened to sit in.
        (await _client.GetCampaignAsync(tokens.AccessToken, campaignId))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
        (await CompanyExistsAsync(companyId)).ShouldBeTrue();
    }

    [Fact]
    public async Task Another_users_application_is_absent_rather_than_refused()
    {
        var mine = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var theirs = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(theirs.AccessToken);

        var response = await _client.DeleteApplicationAsync(mine.AccessToken, application.Id);

        await response.ShouldBeProblemAsync(404, "application.not_found");

        // And it is still there, which is the half a 404 alone would not prove.
        (await _client.GetApplicationAsync(theirs.AccessToken, application.Id))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Deleting_it_twice_is_a_404_the_second_time()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);

        await ShouldSucceedAsync(_client.DeleteApplicationAsync(tokens.AccessToken, application.Id));
        var second = await _client.DeleteApplicationAsync(tokens.AccessToken, application.Id);

        // No idempotency key covers this, and none is needed: the row is gone, and
        // a caller who only wants it gone reads both answers the same way.
        await second.ShouldBeProblemAsync(404, "application.not_found");
    }

    [Fact]
    public async Task One_that_never_existed_is_a_404()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        var response = await _client.DeleteApplicationAsync(tokens.AccessToken, Guid.CreateVersion7());

        await response.ShouldBeProblemAsync(404, "application.not_found");
    }

    [Fact]
    public async Task It_needs_a_caller()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);

        (await _client.DeleteApplicationAsync(accessToken: null, application.Id))
            .StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task It_announces_the_deletion_exactly_once()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(tokens.AccessToken);

        await ShouldSucceedAsync(_client.DeleteApplicationAsync(tokens.AccessToken, application.Id));

        // A consumer that misses this one has no way at all to notice: nothing
        // later mentions the application, and the outbox prunes what it delivers.
        var message = await fixture.SingleMessageForAsync(
            application.Id, ApplicationDeleted.EventType, Ct);
        message.OwnerId.ShouldBe(UserId.From(tokens.UserId));
    }

    [Fact]
    public async Task A_refused_delete_announces_nothing()
    {
        var mine = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var theirs = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var application = await CreateAsync(theirs.AccessToken);

        await ShouldFailAsync(_client.DeleteApplicationAsync(mine.AccessToken, application.Id));

        (await fixture.EventTypesForAsync(application.Id, Ct))
            .ShouldNotContain(ApplicationDeleted.EventType);
    }

    private async Task<ApplicationView> CreateAsync(string? accessToken) =>
        await (await _client.CreateApplicationAsync(accessToken, new
        {
            role = "Staff Engineer",
            companyName = "Acme Corp",
        })).ReadApplicationAsync();

    private static async Task ShouldSucceedAsync(Task<HttpResponseMessage> request) =>
        (await request).IsSuccessStatusCode.ShouldBeTrue();

    private static async Task ShouldFailAsync(Task<HttpResponseMessage> request) =>
        (await request).IsSuccessStatusCode.ShouldBeFalse();

    /// <summary>
    /// How many rows each table cascading off an application still holds for it.
    /// Read from the tables because the children have no route once the parent is
    /// gone.
    /// </summary>
    private async Task<IReadOnlyList<(string Table, int Rows)>> ChildRowCountsAsync(Guid applicationId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationsDbContext>();

        return
        [
            ("activity_log", await dbContext.ActivityLog.CountAsync(e => e.ApplicationId == applicationId, Ct)),
            ("contacts", await dbContext.Contacts.CountAsync(c => c.ApplicationId == applicationId, Ct)),
            ("interviews", await dbContext.Interviews.CountAsync(i => i.ApplicationId == applicationId, Ct)),
        ];
    }

    private async Task<bool> CompanyExistsAsync(Guid companyId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationsDbContext>();

        return await dbContext.Companies.AnyAsync(company => company.Id == companyId, Ct);
    }
}
