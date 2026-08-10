"use server";

import { redirect } from "next/navigation";

import { destroySession } from "@/server/session/lifecycle";

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
