<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { useSession } from "@/composables/useSession";
import { homePath } from "@/router/guards";

const { user, logout } = useSession();
const router = useRouter();

async function signOut() {
  logout();
  await router.replace("/login");
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div
      class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
    >
      <RouterLink
        :to="homePath(user?.role)"
        class="flex items-center gap-3 font-semibold tracking-tight"
      >
        <span
          aria-hidden="true"
          class="grid size-10 place-items-center rounded-xl bg-emerald-800 text-sm text-white"
          >VM</span
        >
        <span>Vacation Manager</span>
      </RouterLink>
      <nav
        aria-label="Main navigation"
        class="order-3 flex w-full gap-2 text-slate-600 sm:order-none sm:w-auto"
      >
        <RouterLink
          v-if="user?.role === 'Requester'"
          to="/requests"
          class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
          active-class="bg-emerald-50 text-emerald-900"
          >My requests</RouterLink
        >
        <RouterLink
          v-else
          to="/dashboard"
          class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
          active-class="bg-emerald-50 text-emerald-900"
          >Review requests</RouterLink
        >
        <RouterLink
          to="/team"
          class="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
          active-class="bg-emerald-50 text-emerald-900"
          >Team planning</RouterLink
        >
      </nav>
      <div class="flex items-center gap-3">
        <div class="text-right">
          <p class="text-sm font-semibold">{{ user?.name }}</p>
          <p class="text-xs text-slate-500">{{ user?.role }}</p>
        </div>
        <button type="button" class="button button-secondary" @click="signOut">Log out</button>
      </div>
    </div>
  </header>
</template>
