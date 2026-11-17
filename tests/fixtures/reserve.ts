import { connect } from "../../src/lib/db";
import { Engine } from "../../src/lib/engine";
const db = connect(process.argv[2]);
try {
  new Engine(db).confirm(process.argv[3], "Door");
  console.log("reserved");
} catch (error) {
  console.log((error as Error).message);
  process.exitCode = 2;
} finally {
  db.sqlite.close();
}
