import { getDatabase } from "../database/data-source";
import { User } from "../entities/User";
import type { UserRole } from "../entities/User";
import { HttpError } from "../errors/HttpError";
import type { CommonEvent } from "../handlers/types";
import { verifyTokenSubject } from "./jwt";

export type SafeUser = Pick<User, "id" | "name" | "email" | "role">;

export function safeUser(user: User): SafeUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function requireUser(
  event: CommonEvent,
  roles?: readonly UserRole[],
): Promise<SafeUser> {
  const authorization = Object.entries(event.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "authorization",
  )?.[1];
  const match = typeof authorization === "string" ? /^Bearer +(\S+)$/i.exec(authorization) : null;
  const userId = match?.[1] ? verifyTokenSubject(match[1]) : undefined;
  if (!userId) throw new HttpError(401, "Authentication required");

  const database = await getDatabase();
  const user = await database.getRepository(User).findOneBy({ id: userId });
  if (!user) throw new HttpError(401, "Authentication required");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "Forbidden");
  return safeUser(user);
}
