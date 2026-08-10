import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";

import type { SessionEndedReason } from "@/server/dal";

/**
 * Why the user is looking at this page rather than the one they asked for.
 *
 * The two cases read differently on purpose. An expiry is routine and the
 * wording should not alarm anyone. A revoked family is not routine: the API saw
 * a refresh token that had already been used, treated it as a replay, and signed
 * every device out. That is worth saying plainly - it is the one event where a
 * user might need to do something about an account, and calling it "your session
 * expired" would bury it.
 */
export function SessionEndedNotice({ reason }: { reason: SessionEndedReason }) {
  if (reason === "revoked") {
    return (
      <Alert variant="destructive">
        <AlertTitle>You were signed out of every device</AlertTitle>
        <AlertDescription>
          A sign-in token was reused, so we ended every session on this account as a precaution.
          Signing in again is safe. If this was not you, change your password once you are back in.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertDescription>Your session ended. Please sign in again to continue.</AlertDescription>
    </Alert>
  );
}
