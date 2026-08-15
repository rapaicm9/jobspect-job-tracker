"use client";

// Client from top to bottom: it owns open state, a global key handler and a
// filter over its own items.

import { Combobox } from "@base-ui/react/combobox";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useCampaignScope, useScopedHref, type Campaign } from "@/features/campaigns";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "../nav-items";

/**
 * Commands are addressed by their label rather than by an object.
 *
 * Base UI filters the `items` it is given, and a list of strings is the shape it
 * filters without being told how. A campaign label is prefixed so it cannot
 * collide with a destination - somebody is entitled to call a campaign "Board".
 */
const CAMPAIGN_PREFIX = "Campaign: ";

/**
 * The one command that does something rather than going somewhere.
 *
 * It still resolves to a route, which is what keeps it a `router.push` like the
 * destinations beside it: creating lives at its own URL precisely so that the
 * palette can reach it from whichever screen the user happens to be on.
 */
const CREATE_LABEL = "Add application";
const CREATE_HREF = "/applications/new";

export interface CommandPaletteProps {
  campaigns: Campaign[];
}

export function CommandPalette({ campaigns }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, setCampaignId] = useCampaignScope(campaigns);
  const scopedHref = useScopedHref();

  const items = [
    CREATE_LABEL,
    ...NAV_ITEMS.map((item) => item.label),
    // Only offered when there is a choice, for the same reason the switcher is
    // hidden then: a command that changes nothing is noise in a list meant to be
    // scanned.
    ...(campaigns.length > 1 ? campaigns.map((c) => `${CAMPAIGN_PREFIX}${c.name}`) : []),
  ];

  const run = useCallback(
    (label: string | null) => {
      if (label === null) return;
      setOpen(false);

      if (label === CREATE_LABEL) {
        router.push(scopedHref(CREATE_HREF));
        return;
      }

      if (label.startsWith(CAMPAIGN_PREFIX)) {
        const name = label.slice(CAMPAIGN_PREFIX.length);
        const campaign = campaigns.find((candidate) => candidate.name === name);
        if (campaign !== undefined) void setCampaignId(campaign.id);
        return;
      }

      const destination = NAV_ITEMS.find((item) => item.label === label);
      if (destination !== undefined) router.push(scopedHref(destination.href));
    },
    [campaigns, router, scopedHref, setCampaignId],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;

      // Ctrl+K is the browser's own search shortcut, so this only works if the
      // event is claimed.
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <>
      <PaletteTrigger
        onOpen={() => {
          setOpen(true);
        }}
      />

      {/* The Combobox wraps the Dialog and shares its open state, which is what
          makes it forget the query, the highlight and the input value each time
          it closes - so it opens ready rather than where it was left. */}
      <Combobox.Root items={items} inline open={open} onOpenChange={setOpen} onValueChange={run}>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 bg-foreground/20" />

            <Dialog.Popup
              className={cn(
                "fixed top-24 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2",
                "rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg",
              )}
            >
              {/* A dialog needs a name, and this one's is not on screen: the input
                below says what it is far better than a heading would. */}
              <Dialog.Title className="sr-only">Commands</Dialog.Title>

              <Combobox.Input
                placeholder="Go to a screen or switch campaign"
                className={cn(
                  "h-(--control-height-lg) w-full rounded-md bg-transparent px-3 text-sm text-foreground",
                  "outline-none placeholder:text-muted-foreground",
                )}
              />

              <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing matches that.
              </Combobox.Empty>

              <Combobox.List className="mt-1 max-h-72 overflow-y-auto">
                {(label: string) => (
                  <Combobox.Item
                    key={label}
                    value={label}
                    className={cn(
                      "flex cursor-default items-center justify-between rounded-md px-3 py-2 text-sm",
                      "data-highlighted:bg-secondary data-highlighted:text-secondary-foreground",
                    )}
                  >
                    <span>{label.replace(CAMPAIGN_PREFIX, "")}</span>
                    <span className="text-xs text-muted-foreground">{hintFor(label)}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </Combobox.Root>
    </>
  );
}

/** What kind of thing this command is, in the trailing hint. */
function hintFor(label: string): string {
  if (label === CREATE_LABEL) return "Create";

  return label.startsWith(CAMPAIGN_PREFIX) ? "Campaign" : "Go to";
}

/** The platform never changes under a session, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

function readShortcutHint(): string {
  return navigator.userAgent.toLowerCase().includes("mac") ? "⌘K" : "Ctrl K";
}

/**
 * The palette is reachable by keyboard alone, which is the same as saying most
 * people will never find it. The button is how they do.
 */
function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  // The server has no idea whose keyboard this is, so it renders no hint at all
  // and the client fills one in. `useSyncExternalStore` is the shape for a value
  // that differs between the two: setting it from an effect would be a render
  // pass with the wrong answer in it, which React 19 lints against.
  const hint = useSyncExternalStore(subscribeToNothing, readShortcutHint, () => "");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-(--control-height-md) min-h-(--target-min) items-center gap-2 rounded-lg border border-border px-3",
        "text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      Commands
      {hint !== "" && <kbd className="text-xs">{hint}</kbd>}
    </button>
  );
}
