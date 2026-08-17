/**
 * A read that owns one panel rather than the page.
 *
 * The application itself is the screen: if it cannot be read there is nothing to
 * show and the route's error boundary is the right answer. Its context - the
 * custom-field definitions, the contacts, the interviews - is not. A contacts
 * outage that hid the role, the company, the stage and the dates would cost the
 * user everything they came for to report one thing they did not.
 *
 * So those three answer with this instead of throwing, and the panel says what
 * happened while the rest of the screen carries on.
 */
export type PanelRead<T> = { kind: "loaded"; items: T[] } | { kind: "failed" };
