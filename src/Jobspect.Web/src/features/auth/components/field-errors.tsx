/**
 * A field's messages, as a list.
 *
 * Not a single string, and not the first message: the API answers a weak
 * password with every unmet rule at once - four of them - and showing one at a
 * time turns a single correction into four round trips.
 *
 * The id is what the input points `aria-describedby` at, so a screen reader
 * reads the messages as part of the field rather than as loose text near it.
 */
export function FieldErrors({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (messages === undefined || messages.length === 0) return null;

  return (
    <ul id={id} className="space-y-0.5 text-sm text-destructive">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
