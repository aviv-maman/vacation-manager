<script setup lang="ts">
import type { VacationStatus } from "@/types/api";

defineProps<{ status: VacationStatus }>();

const colors: Record<VacationStatus, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-900",
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-900",
  Rejected: "border-rose-200 bg-rose-50 text-rose-900",
};
</script>

<template>
  <span
    class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
    :class="colors[status]"
    >{{ status }}</span
  >
</template>
