using Jobspect.IntegrationTests.Infrastructure;
using Shouldly;

namespace Jobspect.IntegrationTests;

/// <summary>
/// Ordering the application list by one of its own date columns, against real
/// PostgreSQL.
/// <para>
/// Applied date is always present, so it orders the obvious way. A deadline is not,
/// and applications without one sort last whichever way the dates run - which is why
/// its resume condition has three cases instead of two, and why the paging tests
/// below are the only thing that would notice if it were wrong. A two-case predicate
/// returns perfectly plausible pages that quietly repeat or drop the rows around the
/// boundary.
/// </para>
/// <para>
/// The other subject here is the cursor. A position means nothing outside the order
/// it was taken from: the same date and id resume an ascending walk somewhere quite
/// different from a descending one, so a cursor that crossed between them would walk
/// the wrong rows and look right doing it.
/// </para>
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class BuiltInSortTests(ApiFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly HttpClient _client = fixture.CreateClient();

    [Fact]
    public async Task Applied_date_orders_both_ways()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var middle = await AppliedAsync(tokens, "Middle", "2026-07-15");
        var newest = await AppliedAsync(tokens, "Newest", "2026-07-20");
        var oldest = await AppliedAsync(tokens, "Oldest", "2026-07-10");

        (await SortedAsync(tokens, "appliedDate", "desc")).ShouldBe([newest, middle, oldest]);
        (await SortedAsync(tokens, "appliedDate", "asc")).ShouldBe([oldest, middle, newest]);
    }

    [Fact]
    public async Task The_default_order_is_applied_date_newest_first()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var older = await AppliedAsync(tokens, "Older", "2026-07-10");
        var newer = await AppliedAsync(tokens, "Newer", "2026-07-20");

        // Asking for it by name and not asking at all are the same list - the
        // default is an instance of the same sort, not a separate path that could
        // drift from it.
        var byDefault = await (await _client.ListApplicationsAsync(tokens.AccessToken))
            .ReadApplicationListAsync();

        byDefault.Select(row => row.Id).ShouldBe([newer, older]);
        (await SortedAsync(tokens, "appliedDate", "desc")).ShouldBe([newer, older]);
    }

    [Fact]
    public async Task Deadlines_order_chronologically_with_the_undated_last_both_ways()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var soon = await DeadlineAsync(tokens, "Soon", "2026-08-01");
        var later = await DeadlineAsync(tokens, "Later", "2026-09-01");
        var none = await DeadlineAsync(tokens, "None", deadline: null);

        // Last in both directions. An application with no deadline is not "the
        // furthest away" - it is not in the running at all, and burying it under the
        // dated ones is the only reading that holds when the direction flips.
        (await SortedAsync(tokens, "applicationDeadline", "asc")).ShouldBe([soon, later, none]);
        (await SortedAsync(tokens, "applicationDeadline", "desc")).ShouldBe([later, soon, none]);
    }

    [Fact]
    public async Task A_deadline_sort_pages_across_the_boundary_into_the_undated_tail()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var soon = await DeadlineAsync(tokens, "Soon", "2026-08-01");
        var later = await DeadlineAsync(tokens, "Later", "2026-09-01");
        var noneA = await DeadlineAsync(tokens, "None A", deadline: null);
        var noneB = await DeadlineAsync(tokens, "None B", deadline: null);

        // One row at a time, so every page boundary is tested - including the one
        // that lands between the dated rows and the tail, and the one inside it.
        (await WalkAsync(tokens, "applicationDeadline", "asc", limit: 1))
            .ShouldBe([soon, later, noneA, noneB]);

        var descending = await WalkAsync(tokens, "applicationDeadline", "desc", limit: 1);
        descending.Take(2).ShouldBe([later, soon]);
        descending.Skip(2).ShouldBe([noneB, noneA]);
    }

    [Fact]
    public async Task Rows_sharing_a_deadline_are_still_walked_once()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var first = await DeadlineAsync(tokens, "First", "2026-08-01");
        var second = await DeadlineAsync(tokens, "Second", "2026-08-01");
        var third = await DeadlineAsync(tokens, "Third", "2026-08-01");

        // Ids break the tie, and they are UUIDv7 - so they ascend in the order the
        // rows were created, and every row appears exactly once.
        (await WalkAsync(tokens, "applicationDeadline", "asc", limit: 1))
            .ShouldBe([first, second, third]);
    }

    [Fact]
    public async Task Paging_an_applied_date_sort_walks_the_same_rows_once()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var older = await AppliedAsync(tokens, "Older", "2026-07-10");
        var same = await AppliedAsync(tokens, "Same day", "2026-07-20");
        var newer = await AppliedAsync(tokens, "Newer", "2026-07-20");

        // The two sharing a date are separated by their ids, which ascend with
        // creation - so this is one page each and no row twice.
        (await WalkAsync(tokens, "appliedDate", "asc", limit: 1)).ShouldBe([older, same, newer]);
    }

    [Fact]
    public async Task A_cursor_does_not_cross_between_the_two_columns()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await DeadlineAsync(tokens, "One", "2026-08-01");
        await DeadlineAsync(tokens, "Two", "2026-09-01");

        var page = await (await _client.ListApplicationsAsync(
            tokens.AccessToken, limit: 1, sortBy: "applicationDeadline", sortDirection: "asc"))
            .ReadPageAsync<ApplicationSummaryView>();
        page.NextCursor.ShouldNotBeNull();

        await (await _client.ListApplicationsAsync(
                tokens.AccessToken, cursor: page.NextCursor, sortBy: "appliedDate", sortDirection: "asc"))
            .ShouldBeProblemAsync(422, "cursor.sort_mismatch");
    }

    [Fact]
    public async Task A_cursor_does_not_cross_between_the_two_directions()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await AppliedAsync(tokens, "One", "2026-07-10");
        await AppliedAsync(tokens, "Two", "2026-07-20");

        var page = await (await _client.ListApplicationsAsync(
            tokens.AccessToken, limit: 1, sortBy: "appliedDate", sortDirection: "asc"))
            .ReadPageAsync<ApplicationSummaryView>();
        page.NextCursor.ShouldNotBeNull();

        // The subtle one, and the reason the direction is part of the cursor's
        // identity: the payload reads perfectly well in the other direction and
        // positions the walk at the wrong end of the list.
        await (await _client.ListApplicationsAsync(
                tokens.AccessToken, cursor: page.NextCursor, sortBy: "appliedDate", sortDirection: "desc"))
            .ShouldBeProblemAsync(422, "cursor.sort_mismatch");
    }

    [Fact]
    public async Task A_cursor_from_the_default_order_still_works_unasked()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var newer = await AppliedAsync(tokens, "Newer", "2026-07-20");
        var older = await AppliedAsync(tokens, "Older", "2026-07-10");

        var first = await (await _client.ListApplicationsAsync(tokens.AccessToken, limit: 1))
            .ReadPageAsync<ApplicationSummaryView>();
        first.Items.Single().Id.ShouldBe(newer);

        // The default order and "appliedDate desc" are the same sort, so a cursor
        // from one is a cursor from the other. A client that never sends sortBy has
        // to keep paging.
        var second = await (await _client.ListApplicationsAsync(
            tokens.AccessToken, limit: 1, cursor: first.NextCursor))
            .ReadPageAsync<ApplicationSummaryView>();

        second.Items.Single().Id.ShouldBe(older);
    }

    [Fact]
    public async Task A_malformed_cursor_is_a_bad_field_rather_than_a_changed_sort()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        // Two different things to tell a client: this one cannot recover by starting
        // the walk again, because nothing it holds is a position.
        await (await _client.ListApplicationsAsync(tokens.AccessToken, cursor: "not-a-cursor!!"))
            .ShouldBeValidationProblemAsync("cursor");
    }

    [Fact]
    public async Task A_column_the_list_cannot_sort_by_is_refused()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);

        await (await _client.ListApplicationsAsync(tokens.AccessToken, sortBy: "role"))
            .ShouldBeValidationProblemAsync("sortBy");
    }

    [Fact]
    public async Task Two_orders_at_once_are_refused()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        await fixture.UnlockProAsync(_client, tokens, Ct);
        var field = await (await _client.CreateCustomFieldAsync(
            tokens.AccessToken, new { label = "Priority", type = "number" })).ReadCustomFieldAsync();

        // A list has one order. Answering with one of them silently would leave the
        // client believing it got the other.
        await (await _client.ListApplicationsAsync(
                tokens.AccessToken, sortCustomFieldId: field.Id, sortBy: "appliedDate"))
            .ShouldBeValidationProblemAsync("sortBy");
    }

    [Fact]
    public async Task Sorting_by_a_column_needs_no_entitlement()
    {
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(_client, Ct);
        var newer = await AppliedAsync(tokens, "Newer", "2026-07-20");

        // The custom-field sort is the paid capability; the list's own columns are
        // part of reading the list.
        (await SortedAsync(tokens, "appliedDate", "asc")).ShouldContain(newer);
    }

    /// <summary>Walks every page at the given size and returns the rows in the order they arrived.</summary>
    private async Task<IReadOnlyList<Guid>> WalkAsync(
        AuthTokens tokens, string sortBy, string direction, int limit)
    {
        var seen = new List<Guid>();
        string? cursor = null;

        do
        {
            var page = await (await _client.ListApplicationsAsync(
                tokens.AccessToken,
                limit: limit,
                cursor: cursor,
                sortDirection: direction,
                sortBy: sortBy)).ReadPageAsync<ApplicationSummaryView>();

            seen.AddRange(page.Items.Select(row => row.Id));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        return seen;
    }

    private async Task<IReadOnlyList<Guid>> SortedAsync(AuthTokens tokens, string sortBy, string direction) =>
        [.. (await (await _client.ListApplicationsAsync(
            tokens.AccessToken, sortDirection: direction, sortBy: sortBy))
            .ReadApplicationListAsync()).Select(row => row.Id)];

    private async Task<Guid> AppliedAsync(AuthTokens tokens, string role, string appliedDate) =>
        (await (await _client.CreateApplicationAsync(tokens.AccessToken, new { role, appliedDate }))
            .ReadApplicationAsync()).Id;

    private async Task<Guid> DeadlineAsync(AuthTokens tokens, string role, string? deadline) =>
        (await (await _client.CreateApplicationAsync(
            tokens.AccessToken, new { role, applicationDeadline = deadline }))
            .ReadApplicationAsync()).Id;
}
