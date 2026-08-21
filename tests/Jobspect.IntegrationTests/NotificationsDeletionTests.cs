using Jobspect.IntegrationTests.Infrastructure;
using Jobspect.Modules.Applications.Contracts;
using Jobspect.Modules.Notifications.Domain;
using Jobspect.Modules.Notifications.Features.ForgetApplication;
using Jobspect.Modules.Notifications.Persistence;
using Jobspect.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Jobspect.IntegrationTests;

/// <summary>
/// What this module does when an application is removed outright.
/// <para>
/// The distinction these tests exist for is delete versus retract. A closing
/// cancels what is pending and leaves the history, because the application is
/// still there to be looked at. A deletion has to take the history too - a
/// delivered reminder in the feed carries a deep link, and a dismissed one sits in
/// the record of something nobody can open. Retraction reaches neither, so a
/// handler written as one would pass every test the closing already has.
/// </para>
/// <para>
/// Driven by handing the handler its event, as the retraction tests do: rows in
/// the two delivered states cannot be produced through an endpoint. One test at
/// the foot goes over HTTP for the wiring.
/// </para>
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class NotificationsDeletionTests(ApiFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Far enough ahead that no sweep at a real clock could find these rows due.
    private static readonly DateTimeOffset Armed = new(2031, 6, 1, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset DueAt = new(2031, 7, 1, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Deleted = new(2031, 6, 3, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task It_takes_every_reminder_whatever_state_it_reached()
    {
        var applicationId = Guid.CreateVersion7();
        await SeedAsync(applicationId, ReminderKind.FollowUp, ReminderState.Pending);
        await SeedAsync(applicationId, ReminderKind.ApplicationDeadlineMorningOf, ReminderState.Sent);
        await SeedAsync(applicationId, ReminderKind.ApplicationDeadlineThreeDaysBefore, ReminderState.Dismissed);
        await SeedAsync(applicationId, ReminderKind.InterviewMorningBefore, ReminderState.Cancelled);
        await SeedAsync(applicationId, ReminderKind.InterviewHourBefore, ReminderState.Dropped);

        await DeleteAsync(applicationId);

        // A retraction would have left four of these five standing, and the two
        // that matter most: the feed holds the delivered states, so Sent and
        // Dismissed are exactly the rows a reader would still be shown.
        (await ReminderCountAsync(applicationId)).ShouldBe(0);
    }

    [Fact]
    public async Task It_takes_the_row_the_follow_up_scan_reads()
    {
        var applicationId = Guid.CreateVersion7();
        await TrackAsync(applicationId);

        await DeleteAsync(applicationId);

        // Scheduling input rather than a record. Left behind, the scan would see an
        // application still waiting for an answer and nudge about one that is gone.
        (await IsTrackedAsync(applicationId)).ShouldBeFalse();
    }

    [Fact]
    public async Task The_deliveries_go_with_their_reminders()
    {
        var applicationId = Guid.CreateVersion7();
        var reminderId = await SeedAsync(applicationId, ReminderKind.FollowUp, ReminderState.Sent);
        await SeedDeliveryAsync(reminderId);

        await DeleteAsync(applicationId);

        // Not deleted by this handler, and not an oversight: a delivery says
        // nothing without its reminder, so the foreign key cascades.
        (await DeliveryCountAsync(reminderId)).ShouldBe(0);
    }

    [Fact]
    public async Task It_leaves_another_applications_reminders_alone()
    {
        var deleted = Guid.CreateVersion7();
        var kept = Guid.CreateVersion7();
        await SeedAsync(deleted, ReminderKind.FollowUp, ReminderState.Pending);
        await SeedAsync(kept, ReminderKind.FollowUp, ReminderState.Pending);
        await TrackAsync(deleted);
        await TrackAsync(kept);

        await DeleteAsync(deleted);

        (await ReminderCountAsync(kept)).ShouldBe(1);
        (await IsTrackedAsync(kept)).ShouldBeTrue();
    }

    [Fact]
    public async Task Redelivering_it_finds_nothing_left_to_do()
    {
        var applicationId = Guid.CreateVersion7();
        await SeedAsync(applicationId, ReminderKind.FollowUp, ReminderState.Pending);
        await TrackAsync(applicationId);

        await DeleteAsync(applicationId);
        await Should.NotThrowAsync(DeleteAsync(applicationId));

        (await ReminderCountAsync(applicationId)).ShouldBe(0);
    }

    [Fact]
    public async Task An_application_this_module_never_held_is_not_an_error() =>
        await Should.NotThrowAsync(DeleteAsync(Guid.CreateVersion7()));

    [Fact]
    public async Task Deleting_an_application_over_http_takes_its_reminders()
    {
        var client = fixture.CreateClient();
        var tokens = await fixture.RegisterWithDefaultCampaignAsync(client, Ct, timeZoneId: "Europe/Belgrade");

        var created = await (await client.CreateApplicationAsync(
            tokens.AccessToken, new { role = "Platform Engineer" })).ReadApplicationAsync();

        (await client.CreateInterviewAsync(tokens.AccessToken, created.Id, new
        {
            scheduledAt = DateTimeOffset.UtcNow.AddDays(30),
            type = "Technical",
            format = "Remote",
        })).IsSuccessStatusCode.ShouldBeTrue();

        await Poll.UntilAsync(
            async () => await ReminderCountAsync(created.Id) == 2,
            "the outbox should deliver the scheduling and arm both instants",
            Ct);

        (await client.DeleteApplicationAsync(tokens.AccessToken, created.Id))
            .IsSuccessStatusCode.ShouldBeTrue();

        // Zero rows rather than two cancelled ones, which is what the closing path
        // next door leaves and the difference this handler exists for.
        await Poll.UntilAsync(
            async () => await ReminderCountAsync(created.Id) == 0,
            "deleting the application should take its reminders rather than cancel them",
            Ct);
    }

    // ------------------------------------------------------------------------ driving

    private async Task DeleteAsync(Guid applicationId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        await new ApplicationDeletedHandler(dbContext).HandleAsync(
            new ApplicationDeleted(Guid.CreateVersion7(), applicationId, UserId.New(), Deleted), Ct);
    }

    // ------------------------------------------------------------------------ seeding

    private async Task<Guid> SeedAsync(Guid applicationId, ReminderKind kind, ReminderState state)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        var reminder = new Reminder
        {
            OwnerId = UserId.New(),
            Kind = kind,
            State = state,
            DueAt = DueAt,
            ApplicationId = applicationId,
            SourceRecordedAt = Armed,
        };

        dbContext.Reminders.Add(reminder);
        await dbContext.SaveChangesAsync(Ct);

        return reminder.Id;
    }

    private async Task SeedDeliveryAsync(Guid reminderId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        dbContext.ReminderDeliveries.Add(new ReminderDelivery
        {
            ReminderId = reminderId,
            Channel = DeliveryChannel.InApp,
            DeliveredAt = Armed,
        });

        await dbContext.SaveChangesAsync(Ct);
    }

    private async Task TrackAsync(Guid applicationId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        dbContext.TrackedApplications.Add(new TrackedApplication
        {
            ApplicationId = applicationId,
            OwnerId = UserId.New(),
            AppliedDate = new DateOnly(2031, 5, 1),
        });

        await dbContext.SaveChangesAsync(Ct);
    }

    // ------------------------------------------------------------------------ reading

    private async Task<int> ReminderCountAsync(Guid applicationId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        return await dbContext.Reminders.CountAsync(r => r.ApplicationId == applicationId, Ct);
    }

    private async Task<int> DeliveryCountAsync(Guid reminderId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        return await dbContext.ReminderDeliveries.CountAsync(d => d.ReminderId == reminderId, Ct);
    }

    private async Task<bool> IsTrackedAsync(Guid applicationId)
    {
        using var scope = fixture.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();

        return await dbContext.TrackedApplications.AnyAsync(t => t.ApplicationId == applicationId, Ct);
    }
}
