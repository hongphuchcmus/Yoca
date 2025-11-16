import z from "zod";
import { validator } from "hono/validator";

export function validateQuery<T extends z.ZodType>(schema: T) {
  return validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          message: "Invalid query parameters",
          details: parsed.error.issues,
        },
        400,
      );
    }
    return parsed.data;
  });
}

export function validateBody<T extends z.ZodType>(schema: T) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          message: "Invalid json parameters",
          details: parsed.error.issues,
        },
        400,
      );
    }
    return parsed.data;
  });
}

export function validateParam<T extends z.ZodType>(schema: T) {
  return validator("param", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          message: "Invalid route parameters",
          details: parsed.error.issues,
        },
        400,
      );
    }
    return parsed.data;
  });
}
