<script setup lang="ts">
import { RouterView } from "vue-router";
import AppNav from "@/components/layout/AppNav.vue";
import { useSession } from "@/composables/useSession";

const { user } = useSession();
</script>

<template>
  <a href="#main-content" class="sr-only focus:not-sr-only focus:block focus:p-3"
    >Skip to content</a
  >
  <AppNav v-if="user" />
  <main id="main-content" tabindex="-1" class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <RouterView />
  </main>
</template>
