import {reset, seed} from "drizzle-seed";
import * as dbSchema from "./schema.js";
import {db} from "./index.js";

async function main(){
    try {
        console.log("Reseting db...");
        await reset(db, dbSchema);
        console.log("Seeding...");
        await seed(db, {users: dbSchema.users}, {count: 20});
        console.log("Done.");
    } catch(err){
        console.log(err);
    } finally {
        console.log("Exit.")
    }
}

await main();

process.exit(0);