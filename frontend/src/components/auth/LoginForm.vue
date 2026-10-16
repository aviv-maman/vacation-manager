<script setup lang="ts">
import { shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import ErrorMessage from "@/components/shared/ErrorMessage.vue";
import { useSession } from "@/composables/useSession";
import { errorMessage } from "@/lib/api";
import { homePath } from "@/router/guards";

const email = shallowRef("");
const password = shallowRef("");
const busy = shallowRef(false);
const error = shallowRef("");
const session = useSession();
const router = useRouter();
const route = useRoute();

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await session.login(email.value, password.value);
    await router.replace(homePath(session.user.value?.role));
  } catch (failure: unknown) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <p
      v-if="route.query.expired && !error"
      role="status"
      class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
    >
      Your session ended. Please log in again.
    </p>
    <ErrorMessage v-if="error" :message="error" />
    <div>
      <label class="label" for="login-email">Email address</label
      ><input
        id="login-email"
        name="email"
        v-model.trim="email"
        class="field"
        type="email"
        autocomplete="username"
        autocapitalize="none"
        :spellcheck="false"
        required
        :disabled="busy"
        placeholder="you@example.com…"
      />
    </div>
    <div>
      <label class="label" for="login-password">Password</label
      ><input
        id="login-password"
        name="password"
        v-model="password"
        class="field"
        type="password"
        autocomplete="current-password"
        required
        :disabled="busy"
      />
    </div>
    <button class="button button-primary w-full" type="submit" :disabled="busy">
      {{ busy ? "Logging in…" : "Log in" }}
    </button>
  </form>
</template>
