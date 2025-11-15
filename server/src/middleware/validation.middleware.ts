/**
 * Validation Middleware
 * Provides reusable validation schemas and middleware for routes
 */

import { z } from "zod";
import { validator } from "hono/validator";

// Common validation schemas
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const addressParamSchema = z.object({
  address: z.string().min(32).max(44), // Solana address length
});

export const tokenIdParamSchema = z.object({
  id: z.string().min(1),
});

export const tokenAddressesQuerySchema = z.object({
  addresses: z.string().min(1),
});

/**
 * Creates a validator middleware for query parameters
 */
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

/**
 * Creates a validator middleware for route parameters
 */
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
