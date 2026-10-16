<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ page: number; pageSize: number; total: number; disabled?: boolean }>();
const emit = defineEmits<{ change: [page: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<template>
  <nav
    aria-label="Request pages"
    class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"
  >
    <p class="text-sm text-slate-600" aria-live="polite">
      Page {{ page }} of {{ pages }} <span class="mx-1 text-slate-300">·</span> {{ total }}
      {{ total === 1 ? "request" : "requests" }}
    </p>
    <div class="flex gap-2">
      <button
        type="button"
        class="button button-secondary"
        :disabled="disabled || page <= 1"
        aria-label="Previous page"
        @click="emit('change', page - 1)"
      >
        Previous
      </button>
      <button
        type="button"
        class="button button-secondary"
        :disabled="disabled || page >= pages"
        aria-label="Next page"
        @click="emit('change', page + 1)"
      >
        Next
      </button>
    </div>
  </nav>
</template>
