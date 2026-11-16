import { connect } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import { Engine } from "../src/lib/engine";
const db = connect();
seed(db);
const e = new Engine(db);
if (!db.sqlite.prepare("SELECT id FROM orders").get()) {
  for (let i = 0; i < 4; i++) {
    const r = e.message(
      "c" + i,
      "seed-" + i,
      [
        "1 kg tomato, 2 bunch coriander",
        "ara kilo vendakkai, rendu kattu arai keerai",
        "2 kg onion, 1 kg potato",
        "1 kg carrot",
      ][i],
    );
    e.confirm(r.orderId, "At my door");
  }
  e.message("c0", "seed-special", "naalaiku murungakkai 1 kg vangitu vaanga");
}
db.sqlite.close();
console.log("Fictional demo data ready.");
