import "server-only";

import { cache } from "react";

import { api } from "@/server/api/client";
import { requireSession } from "@/server/dal";
import { callAuthenticated } from "@/server/session/call";

import { toCustomFieldDefinition, type CustomFieldDefinition } from "../custom-field-answers";
import type { PanelRead } from "../panel-read";

/**
 * Every field the account has defined, archived ones included.
 *
 * Read for everyone, entitled or not, and the endpoint is deliberately ungated
 * to allow it: defining a field is the paid capability, reading the definitions
 * back is not. An account that has lost the entitlement still has to be able to
 * interpret the answers it recorded while it had it.
 *
 * A bare array rather than the paged envelope the other lists use, because this
 * is a bounded set a client needs in full to label anything at all.
 *
 * Memoised so the detail screen and, later, its editor share one call.
 */
export const listCustomFieldDefinitions = cache(
  async (): Promise<PanelRead<CustomFieldDefinition>> => {
    const session = await requireSession();

    const result = await callAuthenticated(session.sid, (init) =>
      api.GET("/api/v1/custom-fields", init),
    );

    if (!result.ok) return { kind: "failed" };

    return { kind: "loaded", items: result.data.map(toCustomFieldDefinition) };
  },
);
