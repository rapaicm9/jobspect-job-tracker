import "server-only";

import { headers } from "next/headers";

import { api, callApi } from "@/server/api/client";

import type { Credential } from "./credential";
import { deviceLabelFrom } from "./device-label";

/** Where a signed-in account lands. Sprint 4 fills this screen in. */
export const SIGNED_IN = "/applications";

export async function currentDeviceLabel(): Promise<string> {
  return deviceLabelFrom((await headers()).get("user-agent"));
}

/**
 * Turns a credential into a token pair.
 *
 * The switch is the point of the union: a passkey assertion reaches the same
 * pair by a different endpoint, and adding it here is the whole change. Both
 * callers of this - and registration, which answers with the same pair - hand
 * the result straight to `createSession`, which does not ask how it was got.
 */
export async function exchangeCredential(credential: Credential, deviceLabel: string) {
  switch (credential.kind) {
    case "password":
      return callApi(() =>
        api.POST("/api/v1/identity/login", {
          body: { email: credential.email, password: credential.password, deviceLabel },
        }),
      );
  }
}
