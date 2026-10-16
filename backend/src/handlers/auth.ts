import { compare } from "bcryptjs";
import { Response } from "commoneventframework";
import { issueToken } from "../auth/jwt";
import { requireUser, safeUser } from "../auth/require-user";
import { getDatabase } from "../database/data-source";
import { User } from "../entities/User";
import { HttpError } from "../errors/HttpError";
import type { HandlerFn, InputParserFn } from "./types";

interface LoginInput {
  email: string;
  password: string;
}

// A cost-12 hash of a random, unused value; unknown emails still run bcrypt.
const dummyPasswordHash = "$2b$12$nL0Gueo43mHJSV/fLGhJJe95ny1ph6Cx./HqTA9JWo3bYipr9M2CG";

export const parseLoginInput: InputParserFn<LoginInput> = (event) => {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return new Response(400, { error: "Provide a JSON object with email and password" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(400, { error: "Provide a JSON object with email and password" });
  }
  const { email, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return new Response(400, {
      error: "Email and password are required strings; password is limited to 72 UTF-8 bytes",
    });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return new Response(400, { error: "Provide a valid email address" });
  }
  return { email: normalizedEmail, password };
};

export const login: HandlerFn<LoginInput> = async ({ email, password }) => {
  const database = await getDatabase();
  const user = await database
    .getRepository(User)
    .createQueryBuilder("user")
    .addSelect("user.password")
    .where("user.email = :email", { email })
    .getOne();
  const passwordMatches = await compare(password, user?.password ?? dummyPasswordHash);
  if (!user || !passwordMatches) throw new HttpError(401, "Invalid email or password");
  return new Response(
    200,
    { token: issueToken(user), user: safeUser(user) },
    { "Cache-Control": "no-store" },
  );
};

export const getMe: HandlerFn = async (_input, event) =>
  new Response(200, { user: await requireUser(event) }, { "Cache-Control": "no-store" });
