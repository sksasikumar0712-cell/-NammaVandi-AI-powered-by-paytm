import { database } from "./db";
import { seed } from "./seed";
import { Engine } from "./engine";
export function engine() {
  const db = database();
  seed(db);
  return new Engine(db);
}
export function localRequest(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    throw Error("Cross-origin request rejected");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw Error("Local administration only. Bind the server to localhost.");
}
