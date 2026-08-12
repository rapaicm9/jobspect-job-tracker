using System.Globalization;

namespace Jobspect.Modules.Applications.Features;

/// <summary>
/// Renders the value a list is sorted by into the cursor's sort key, and reads it
/// back. Every rendering is exact and culture-invariant, because a cursor decoded
/// on the next request has to compare identically to the value still in the column
/// - a lossy rendering would silently skip or repeat the rows around a page edge.
/// <para>
/// The value handed in must be the one the database returned, never one computed
/// locally: a <c>timestamptz</c> is stored to the microsecond, so an instant from
/// the clock would not compare equal to the row it came from.
/// </para>
/// </summary>
internal static class SortKeys
{
    private const string DateFormat = "yyyy-MM-dd";

    public static string From(DateOnly value) => value.ToString(DateFormat, CultureInfo.InvariantCulture);

    public static DateOnly? ToDate(string value) =>
        DateOnly.TryParseExact(value, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : null;

    /// <summary>
    /// An instant as its UTC tick count - exact, and ordered the same as the
    /// column, which a formatted string would only be by accident.
    /// </summary>
    public static string From(DateTimeOffset value) => value.UtcTicks.ToString(CultureInfo.InvariantCulture);

    public static DateTimeOffset? ToInstant(string value) =>
        long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ticks)
        && ticks >= 0
        && ticks <= DateTimeOffset.MaxValue.UtcTicks
            ? new DateTimeOffset(ticks, TimeSpan.Zero)
            : null;

    /// <summary>
    /// A row that has nothing to sort by - no answer to the field, or no deadline.
    /// Those rows sort last, so a page can end inside that group and the next page
    /// has to know it is resuming there rather than among the values.
    /// </summary>
    private const string Absent = "n:";

    /// <summary>An application that did, with the answer following.</summary>
    private const string AnsweredPrefix = "v:";

    /// <summary>A row that has a deadline, with the date following.</summary>
    private const string DatedPrefix = "d:";

    /// <summary>
    /// The position in a sort by an optional date, where a row without one sorts
    /// last in both directions. The marker is what separates "no deadline" from a
    /// deadline that failed to render, which an empty string could not.
    /// </summary>
    public static string ForOptionalDate(DateOnly? value) =>
        value is { } date ? DatedPrefix + From(date) : Absent;

    /// <summary>
    /// Reads that position back: whether the last row had a deadline, and what it
    /// was if so. Null when the key was not written by a sort of this kind.
    /// </summary>
    public static (bool Dated, DateOnly Date)? ToOptionalDate(string value) => value switch
    {
        Absent => (false, default(DateOnly)),
        _ when value.StartsWith(DatedPrefix, StringComparison.Ordinal) =>
            ToDate(value[DatedPrefix.Length..]) is { } date ? (true, date) : null,
        _ => null,
    };

    private const char TagSeparator = '#';

    /// <summary>
    /// A sort key with the identity of the sort that issued it in front of the
    /// position itself.
    /// <para>
    /// A list that can be ordered several ways needs this, because a position is
    /// only meaningful under the ordering it was taken from: the same date and id
    /// resume a descending walk in one place and an ascending walk in another. A
    /// cursor carrying no identity is accepted by the wrong sort and returns pages
    /// that look right and quietly repeat or drop the rows around the boundary.
    /// The cursor is opaque by contract (ADR-0008), so the identity rides inside it
    /// rather than becoming a parameter a client has to echo back correctly.
    /// </para>
    /// </summary>
    public static string Tagged(string tag, string position) => $"{tag}{TagSeparator}{position}";

    /// <summary>
    /// The position inside a tagged key, or <c>null</c> when the key was issued
    /// under a different sort - or under none, which is what an older or
    /// hand-made cursor looks like.
    /// </summary>
    public static string? Position(string sortKey, string tag) =>
        sortKey.Length > tag.Length
        && sortKey.StartsWith(tag, StringComparison.Ordinal)
        && sortKey[tag.Length] == TagSeparator
            ? sortKey[(tag.Length + 1)..]
            : null;

    /// <summary>
    /// The position in a custom-field sort, where the answer may be missing
    /// entirely - and an empty answer is a real answer, so the two cannot both be
    /// the empty string. Hence the marker.
    /// <para>
    /// It stays inside the sort key rather than becoming a third field on the
    /// cursor: the cursor is opaque by contract (ADR-0008), so its payload is free
    /// to carry this without the wire format changing.
    /// </para>
    /// </summary>
    public static string ForAnswer(string? answer) =>
        answer is null ? Absent : AnsweredPrefix + answer;

    /// <summary>
    /// Reads that position back: whether the last row had answered, and what it
    /// answered if so. Null when the key was not written by this list.
    /// </summary>
    public static (bool Answered, string Answer)? ToAnswer(string value) => value switch
    {
        Absent => (false, string.Empty),
        _ when value.StartsWith(AnsweredPrefix, StringComparison.Ordinal) =>
            (true, value[AnsweredPrefix.Length..]),
        _ => null,
    };
}
