using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Jobspect.Api.OpenApi;

/// <summary>
/// Says what a dictionary may hold, for the ones the schema mapper leaves silent
/// on the subject.
/// </summary>
/// <remarks>
/// <para>
/// The mapper describes a dictionary's values only when its key is a
/// <see cref="string"/>. A key of any other type - the custom-field bag is keyed
/// by definition id - produces a bare <c>type: object</c> with no
/// <c>additionalProperties</c> at all.
/// </para>
/// <para>
/// Read as JSON Schema that omission is permissive, which is why nothing on the
/// wire is wrong. Read by a generator it is the opposite: an object with no
/// declared properties and no allowance for others describes a type nothing can
/// be assigned to. So the bag arrives in a client as a map admitting no keys,
/// and every read and write of it needs a cast.
/// </para>
/// </remarks>
internal sealed class DictionarySchemaTransformer : IOpenApiSchemaTransformer
{
    public async Task TransformAsync(
        OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        // A dictionary already carrying additionalProperties is a string-keyed
        // one the mapper has described, and described better than this could.
        if (context.JsonTypeInfo.Kind is not JsonTypeInfoKind.Dictionary
            || schema.AdditionalProperties is not null
            || context.JsonTypeInfo.ElementType is not { } value)
        {
            return;
        }

        // A JsonElement is whatever JSON the field's own definition calls for -
        // text, a number, a date, a checkbox, one selection or several - and
        // nothing short of that definition says which. The empty schema is the
        // honest answer. Any other value type can describe itself.
        schema.AdditionalProperties = value == typeof(JsonElement) || value == typeof(object)
            ? new OpenApiSchema()
            : await context.GetOrCreateSchemaAsync(value, cancellationToken: cancellationToken);
    }
}
