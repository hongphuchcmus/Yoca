import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dbSchema from "./schema.js";
import { buildSchema } from "drizzle-graphql";
import { printSchema } from "graphql";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Storage } from "@services/storage.js";
import "@util/load-env.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

const client = postgres(process.env.POSTGRES_DB_URL!);
export const db = drizzle({ client, schema: dbSchema });
export const { schema: graphqlSchema } = buildSchema(db);

const graphqlSchemaLocation = join(currentDir, "schema.graphql");
const genComment =
`#######################################################
 # Generated GraphQL schema for preview, has no usage  #
 #######################################################\n`

Storage.saveText(
    graphqlSchemaLocation,
    genComment + printSchema(graphqlSchema)
);
