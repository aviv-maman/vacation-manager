import type { RouteLocationNormalized } from "vue-router";
import { useSession } from "@/composables/useSession";
import type { Role } from "@/types/api";

export function homePath(role?: Role): string {
  return role === "Validator" ? "/dashboard" : "/requests";
}

export async function authGuard(to: RouteLocationNormalized) {
  const session = useSession();

  try {
    await session.ensureUser();
  } catch {
    // A 401 clears the session in Axios. Other failures appear in the screen's data area.
  }

  const user = session.user.value;

  if (to.meta.roles && !user) return { path: "/login" };
  if (user && (to.meta.guestOnly || (to.meta.roles && !to.meta.roles.includes(user.role)))) {
    return { path: homePath(user.role) };
  }

  return true;
}
