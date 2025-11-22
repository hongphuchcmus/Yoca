// Thanks to obedm503 (https://github.com/honojs/hono/issues/434#issuecomment-2025800825)
import {
  HeaderMap,
  type ApolloServer,
  type BaseContext,
  type ContextFunction,
  type HTTPGraphQLRequest,
} from "@apollo/server";
import type { Context as HonoContext } from "hono";
import { stream } from "hono/streaming";
import { Hono } from "hono/tiny";
import type { BlankSchema, Env } from "hono/types";
import type { StatusCode } from "hono/utils/http-status";

export function honoApollo(
  server: ApolloServer<BaseContext>,
  getContext?: ContextFunction<[HonoContext], BaseContext>,
): Hono<Env, BlankSchema, "/">;
export function honoApollo<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  getContext: ContextFunction<[HonoContext], TContext>,
): Hono<Env, BlankSchema, "/">;
export function honoApollo<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  getContext?: ContextFunction<[HonoContext], TContext>,
) {
  const app = new Hono();

  // Handle `OPTIONS` request
  // Prefer status 200 over 204
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/OPTIONS#status_code
  app.options("/", (ctx) => ctx.text(""));

  // This `any` is safe because the overload above shows that context can
  // only be left out if you're using BaseContext as your context, and {} is a
  // valid BaseContext.
  const defaultContext: ContextFunction<[HonoContext], any> = async () => ({});
  const context = getContext ?? defaultContext;

  app.on(["GET", "POST"], "/", async (ctx) => {
    const headerMap = new HeaderMap();
    // Use `ctx.req.raw.headers` to avoid multiple loops and intermediate objects
    ctx.req.raw.headers.forEach((value, key) => {
      // When Header values are iterated over, they are automatically sorted in
      // lexicographical order, and values from duplicate header names are combined.
      // https://developer.mozilla.org/en-US/docs/Web/API/Headers
      headerMap.set(key, value);
    });
    const httpGraphQLRequest: HTTPGraphQLRequest = {
      // Avoid parsing the body unless necessary
      body: ctx.req.method === "POST" ? await ctx.req.json() : undefined,
      headers: headerMap,
      method: ctx.req.method,
      search: new URL(ctx.req.url).search,
    };

    const httpGraphQLResponse = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest,
      context: () => context(ctx),
    });

    for (const [key, value] of httpGraphQLResponse.headers) {
      ctx.header(key, value);
    }

    ctx.status((httpGraphQLResponse.status as StatusCode) ?? 200);

    if (httpGraphQLResponse.body.kind === "complete") {
      return ctx.body(httpGraphQLResponse.body.string);
    }

    // This should work but remains untested
    const asyncIterator = httpGraphQLResponse.body.asyncIterator;
    return stream(ctx, async (stream) => {
      for await (const part of asyncIterator) {
        await stream.write(part);
      }
    });
  });

  return app;
}
