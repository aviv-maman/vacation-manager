import type { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import type { Response } from "commoneventframework";

export type InputParserFn = (event: CommonEvent) => unknown;

export type HandlerFn = (
  input: unknown,
  event: CommonEvent,
) => Promise<Response | Record<string, unknown>>;
