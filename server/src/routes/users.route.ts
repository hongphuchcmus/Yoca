import { z } from "zod";
import { validator } from "hono/validator";
import { Hono } from "hono";

// User validation schema
const userSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type UserInput = z.infer<typeof userSchema>;

const app = new Hono();

/**
 * Create a new user
 * POST /users
 */
app.post(
  "/",
  validator("json", (value, c) => {
    const parsed = userSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          message: "Invalid user data",
          details: parsed.error.format(),
        },
        400
      );
    }
    return parsed.data;
  }),
  async (c: any) => {
    const user: UserInput = c.req.valid("json");

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
          // Never return password in response
        },
      },
      201
    );
  }
);

export default app;
