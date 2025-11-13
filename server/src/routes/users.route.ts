import * as z from "zod";
import { validator } from "hono/validator";
import { Hono } from "hono";

const userSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const app = new Hono().post(
  "/",
  validator("json", (value, c) => {
    const parsed = userSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          message: "Invalid user data.",
          details: parsed.error.issues,
        },
        400,
      );
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const user = c.req.valid("json");
      // Demo
      return c.json(
        {
          message: "User created successfully",
          user,
        },
        201,
      );
    } catch {
      return c.json(
        {
          error: "UnknownError",
          message: "An unknown error occurred.",
        },
        500,
      );
    }
  },
);

export default app;
