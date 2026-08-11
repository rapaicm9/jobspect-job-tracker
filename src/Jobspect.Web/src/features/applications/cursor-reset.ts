/**
 * Thrown on the client, never on the server.
 *
 * The action reports a stale cursor as a value because a class thrown inside a
 * Server Action does not survive the trip - Next replaces it with a generic
 * message and a digest. Throwing it here, in code the browser is already
 * running, keeps it something the list can recognise and act on: reset the walk
 * and refetch, which the user reads as a refresh rather than as an error.
 */
export class CursorResetError extends Error {
  constructor() {
    super("The cursor no longer describes this list.");
    this.name = "CursorResetError";
  }
}
