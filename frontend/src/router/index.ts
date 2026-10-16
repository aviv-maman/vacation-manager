import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "./guards";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: "/requests" },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { guestOnly: true, title: "Log in" },
    },
    {
      path: "/requests",
      name: "requests",
      component: () => import("@/views/RequesterView.vue"),
      meta: { roles: ["Requester"], title: "My requests" },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("@/views/ValidatorView.vue"),
      meta: { roles: ["Validator"], title: "Review requests" },
    },
    {
      path: "/team",
      name: "team",
      component: () => import("@/views/TeamView.vue"),
      meta: { roles: ["Requester", "Validator"], title: "Team planning" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(authGuard);
router.afterEach((to) => {
  document.title = `${to.meta.title ?? "Welcome"} · Vacation Manager`;
});

export default router;
