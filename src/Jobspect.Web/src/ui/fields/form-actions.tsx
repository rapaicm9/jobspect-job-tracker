import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";

/**
 * What went wrong with the form as a whole, with no field to blame.
 *
 * Separate from the actions so a form can put it where its own reader is
 * looking: at the top when the form is short enough to see at once, beside the
 * button when it is not. Attaching one of these to a field is the mistake it
 * exists to prevent - a server fault next to the password box invites somebody
 * to change a password that was fine.
 */
export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;

  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export interface FormActionsProps {
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
}

/**
 * The submit row.
 *
 * The label changes rather than a spinner appearing beside it, so the control
 * says what it is doing in the place the reader is already looking. Cancel
 * stays enabled while a submit is in flight: a write that is taking too long is
 * exactly when somebody wants out, and leaving is safe because the server has
 * already been told.
 */
export function FormActions({
  submitLabel,
  pendingLabel,
  pending,
  onCancel,
  cancelLabel = "Cancel",
}: FormActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>

      {onCancel !== undefined && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}
