import { formatDate } from "@/lib/dates";

import {
  toCustomFieldAnswers,
  type CustomFieldAnswer,
  type CustomFieldDefinition,
} from "../custom-field-answers";
import type { PanelRead } from "../panel-read";

import { DetailPanel, PanelUnavailable } from "./detail-panel";

const LOCALE = "en-GB";

function AnswerValue({ answer }: { answer: CustomFieldAnswer }) {
  switch (answer.kind) {
    case "text":
    case "select":
      return <>{answer.value}</>;

    case "url":
      return (
        <a
          href={answer.value}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline underline-offset-4 hover:text-muted-foreground"
        >
          {answer.value}
        </a>
      );

    case "number":
      return <span className="tabular-nums">{answer.value.toLocaleString(LOCALE)}</span>;

    case "checkbox":
      // Words rather than a tick or a colour: a mark that means "yes" is a mark
      // somebody has to already know the meaning of.
      return <>{answer.value ? "Yes" : "No"}</>;

    case "date": {
      const formatted = formatDate(answer.value);
      return formatted === null ? (
        <>{answer.value}</>
      ) : (
        <time dateTime={answer.value}>{formatted}</time>
      );
    }

    case "multi-select":
      return <>{answer.values.join(", ")}</>;

    case "unreadable":
      // The answer is stored and this build cannot make sense of its shape.
      // Saying so beats rendering raw JSON at somebody.
      return <span className="text-muted-foreground">Cannot be displayed</span>;
  }
}

export interface CustomFieldPanelProps {
  values: Record<string, unknown>;
  definitions: PanelRead<CustomFieldDefinition>;
}

/**
 * The account's own fields, read-only and rendered for everyone.
 *
 * Defining a field is the paid capability; reading the answers back is not, and
 * the API keeps the definitions endpoint open for exactly this reason. An
 * account that has lost the entitlement must still be able to interpret its own
 * applications, so nothing here checks a tier. The upgrade affordance belongs on
 * the editor, where the capability actually bites.
 */
export function CustomFieldPanel({ values, definitions }: CustomFieldPanelProps) {
  if (definitions.kind === "failed") {
    // Silent when there is nothing to label. The bag is the only evidence left
    // that this application has answers at all, so an empty one means the failed
    // read hid nothing and a populated one means it hid something worth saying.
    if (Object.keys(values).length === 0) return null;

    return (
      <DetailPanel title="Your fields">
        <PanelUnavailable subject="Your custom fields" />
      </DetailPanel>
    );
  }

  const answers = toCustomFieldAnswers(values, definitions.items);

  // No answers and nothing to say. An account with no fields defined has no use
  // for an empty panel, and one that has fields but has not answered them here
  // is not being told anything by a column of blanks.
  if (answers.length === 0) return null;

  return (
    <DetailPanel title="Your fields">
      <dl className="flex flex-col gap-3">
        {answers.map((answer) => (
          <div key={answer.definitionId} className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">
              {answer.label}
              {/* Archiving retires a field from new applications; the answers
                  already given still have to mean something. */}
              {answer.archived && <span className="ml-1.5">(archived)</span>}
            </dt>
            <dd className="text-sm text-foreground">
              <AnswerValue answer={answer} />
            </dd>
          </div>
        ))}
      </dl>
    </DetailPanel>
  );
}
