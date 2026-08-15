"use client";

// A client wrapper around a server-rendered read view, which is the whole reason
// it takes `children` rather than rendering the facts itself: the read stays a
// Server Component, and `router.refresh()` after a save brings back a fresh one
// rather than one reconstructed from the values that were just submitted.

import { useState, useTransition } from "react";

import type { PlanTier } from "@/lib/enums";
import { Button } from "@/ui/button";

import { fetchSourceSuggestions } from "../actions/fetch-source-suggestions";
import type { ApplicationDetail } from "../application-detail";
import type { CustomFieldDefinition } from "../custom-field-answers";

import { ApplicationForm } from "./application-form";
import { DetailPanel } from "./detail-panel";

export interface EditableFactsProps {
  application: ApplicationDetail;
  definitions: readonly CustomFieldDefinition[];
  tier: PlanTier | null;
  workModes: readonly string[];
  /** The scope off the URL, so suggestions come from the search being looked at. */
  campaignId: string | null;
  children: React.ReactNode;
}

export function EditableFacts({
  application,
  definitions,
  tier,
  workModes,
  campaignId,
  children,
}: EditableFactsProps) {
  const [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [isOpening, startOpening] = useTransition();

  const open = () => {
    startOpening(async () => {
      // Fetched here rather than with the page, and from a click rather than an
      // effect. Most visits read an application and never edit it, so a hundred
      // rows read for a datalist nobody will see is a round trip spent on
      // nothing. The form opens either way - an empty answer leaves an ordinary
      // text box, which is what it degrades to.
      setSuggestions(await fetchSourceSuggestions({ campaignId }));
      setEditing(true);
    });
  };

  if (editing) {
    return (
      <DetailPanel title="Edit details">
        <ApplicationForm
          application={application}
          definitions={definitions}
          tier={tier}
          workModes={workModes}
          sourceSuggestions={suggestions}
          onDone={() => {
            setEditing(false);
          }}
        />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel
      title="Details"
      action={
        <Button type="button" variant="outline" size="sm" disabled={isOpening} onClick={open}>
          {isOpening ? "Opening…" : "Edit"}
        </Button>
      }
    >
      {children}
    </DetailPanel>
  );
}
