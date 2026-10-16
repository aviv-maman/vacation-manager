<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div
    role="alert"
    class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
  >
    {{ message }}
  </div>
</template>
