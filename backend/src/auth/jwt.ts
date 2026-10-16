import jwt from "jsonwebtoken";
import type { User } from "../entities/User";

export const TOKEN_LIFETIME_SECONDS = 60 * 60;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret.trim(), "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 UTF-8 bytes; generate a random secret");
  }

  return secret;
}

export function issueToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ role: user.role }, getJwtSecret(), {
    algorithm: "HS256",
    subject: String(user.id),
    expiresIn: TOKEN_LIFETIME_SECONDS,
  });
}

export function verifyTokenSubject(token: string): number | undefined {
  const secret = getJwtSecret();

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      !Number.isSafeInteger(Number(payload.sub)) ||
      Number(payload.sub) > 2_147_483_647 ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      return undefined;
    }

    return Number(payload.sub);
  } catch {
    return undefined;
  }
}
