import {
  loadEnv,
  buildCommonEvent,
  getRouteConfig,
  resolveHandlerRef,
  Response,
  startDevServer,
} from "commoneventframework";
import type { APIGatewayProxyStructuredResultV2, Context, LambdaEvent } from "commoneventframework";
import type { HandlerFn, InputParserFn } from "./handlers/types";
import { getJwtSecret } from "./auth/jwt";
import { HttpError } from "./errors/HttpError";
import { databaseHttpError } from "./errors/database-error";
import "./generated/HandlerRegistry";

const envReady = loadEnv().then(() => {
  getJwtSecret();
});

export async function handler(
  event: LambdaEvent,
  _context: Context,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    await envReady;

    const commonEvent = buildCommonEvent(event);
    const route = getRouteConfig(commonEvent);

    // Expose only application routes, rather than CEF's automatic diagnostics.
    if (!route?.handler || route.handler.startsWith("__builtin__/")) {
      return new Response(404, { error: "Route not found" });
    }

    const handle = resolveHandlerRef(route.handler) as HandlerFn | undefined;

    if (!handle) throw new Error("Handler configuration is invalid");

    const parse = route.inputParser
      ? (resolveHandlerRef(route.inputParser) as InputParserFn | undefined)
      : undefined;

    if (route.inputParser && !parse) throw new Error("Input parser configuration is invalid");

    const input = parse ? await parse(commonEvent) : {};

    if (input instanceof Response) return input;

    const result = await handle(input, commonEvent);

    return result instanceof Response ? result : new Response(200, result);
  } catch (error: unknown) {
    const failure = error instanceof HttpError ? error : databaseHttpError(error);

    if (failure) {
      return new Response(
        failure.statusCode,
        { error: failure.message },
        failure.statusCode === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
      );
    }
    console.error(JSON.stringify({ type: "UnexpectedRequestError" }));

    return new Response(500, { error: "An unexpected error occurred" });
  }
}

if (process.argv.includes("--local")) {
  envReady
    .then(() => startDevServer(handler))
    .catch((error: unknown) => {
      console.error(
        "Could not start the local server:",
        error instanceof Error ? error.message : "Unknown startup error",
      );
      process.exitCode = 1;
    });
}
