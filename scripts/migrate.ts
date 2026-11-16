import { connect } from "../src/lib/db";
const db = connect();
db.sqlite.close();
console.log("Schema migration applied.");
