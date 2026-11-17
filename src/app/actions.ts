"use server";
import { headers } from "next/headers";
import { engine, localRequest } from "@/lib/service";

export async function savePurchaseSummary() {
  try {
    const incoming = await headers();
    // Same local-administration boundary as API routes; never trust forwarded hosts.
    const request = new Request(
      `http://${incoming.get("host") || "invalid"}/dashboard`,
      { headers: incoming },
    );
    localRequest(request);
    return { data: engine().summary() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
