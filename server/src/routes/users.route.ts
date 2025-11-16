import { z } from "zod";
import { Hono } from "hono";
import { validateBody } from "../middlewares/validation.middleware.js";

// User validation schema
const userSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const app = new Hono()
  // Add a new user
  .post("/", validateBody(userSchema), async (c) => {
    const user = c.req.valid("json");
    // TODO: Implement actual user creation logic

    // - Hash password using bcrypt or similar
    // - Store user in database
    // - Generate authentication token
    // - Send verification email

    // Demo response - don't expose password
    return c.json(
      {
        message: "User created successfully",
        user: {
          email: user.email,
        },
      },
      201,
    );
  });

export default app;
