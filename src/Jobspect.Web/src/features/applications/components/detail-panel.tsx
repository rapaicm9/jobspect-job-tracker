/**
 * The container every region of the detail screen sits in, and the one place the
 * "this could not be read" state is worded.
 *
 * The same three utilities `application-cards.tsx` already uses rather than a
 * vendored primitive: the forms commit vendors `card` as part of one batch, and
 * pulling half of that batch forward for a border buys nothing.
 */

export interface DetailPanelProps {
  title: string;
  /** A control belonging to the panel rather than to anything inside it. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailPanel({ title, action, children }: DetailPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** An empty panel, or one whose read failed. One line either way. */
export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * What a failed context read says.
 *
 * It names the panel and says the page is otherwise intact, because that is the
 * question a reader has: the rest of this screen loaded, so is what they are
 * looking at complete? Nothing here offers a retry - reloading the page is the
 * retry, and a button that re-runs one server read does not exist yet.
 */
export function PanelUnavailable({ subject }: { subject: string }) {
  return <PanelNote>{subject} could not be loaded. The rest of this page is up to date.</PanelNote>;
}
