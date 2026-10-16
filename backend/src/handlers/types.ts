import type { buildCommonEvent, Response } from "commoneventframework";

export type CommonEvent = ReturnType<typeof buildCommonEvent>;

export type InputParserFn<Input = unknown> = (
  event: CommonEvent,
) => Input | Response | Promise<Input | Response>;

export type HandlerFn<Input = unknown> = (
  input: Input,
  event: CommonEvent,
) => Promise<Response | Record<string, unknown>>;
