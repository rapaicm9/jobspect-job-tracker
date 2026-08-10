using Jobspect.Modules.Applications.Domain;

namespace Jobspect.Modules.Applications.Features;

/// <summary>Which of the list's own columns it is ordered by.</summary>
internal enum BuiltInSortKey
{
    AppliedDate,
    ApplicationDeadline,
}

/// <summary>
/// Ordering the application list by one of its own date columns, which is what it
/// does when no custom-field sort was asked for.
/// <para>
/// The default order is an instance of this rather than a separate code path, so
/// "newest applied first" is the same machinery as every other choice and cannot
/// drift from it.
/// </para>
/// </summary>
internal sealed record BuiltInSort(BuiltInSortKey Key, bool Descending)
{
    /// <summary>Newest applied first, which is what a list of applications means by default.</summary>
    public static readonly BuiltInSort Default = new(BuiltInSortKey.AppliedDate, Descending: true);

    /// <summary>
    /// The two column names a client may ask for, spelled as the response spells
    /// them so nobody has to map between the sort and the field it sorts.
    /// </summary>
    public static BuiltInSort? Parse(string? sortBy, bool descending) => sortBy switch
    {
        "appliedDate" => new BuiltInSort(BuiltInSortKey.AppliedDate, descending),
        "applicationDeadline" => new BuiltInSort(BuiltInSortKey.ApplicationDeadline, descending),
        _ => null,
    };

    /// <summary>
    /// This sort's identity inside a cursor. The direction is part of it: the same
    /// date and id resume an ascending walk somewhere quite different from a
    /// descending one, so a cursor that crossed between them would repeat or skip
    /// the rows around its own position.
    /// </summary>
    public string Tag =>
        $"{(Key is BuiltInSortKey.AppliedDate ? "ad" : "dl")}:{(Descending ? "desc" : "asc")}";

    /// <summary>
    /// Where a row sits in this order, as the cursor records it. An applied date is
    /// always present; a deadline may not be, and those rows sort last, so the two
    /// keys are not interchangeable.
    /// </summary>
    public string KeyFor(Application application)
    {
        ArgumentNullException.ThrowIfNull(application);

        return SortKeys.Tagged(
            Tag,
            Key is BuiltInSortKey.AppliedDate
                ? SortKeys.From(application.AppliedDate)
                : SortKeys.ForOptionalDate(application.ApplicationDeadline));
    }
}
