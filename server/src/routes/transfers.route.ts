import { Hono } from "hono";

const app = new Hono();

app.get("/", async (_c) => {});

export default app;
