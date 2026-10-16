<script setup lang="ts">
import ErrorMessage from "@/components/shared/ErrorMessage.vue";
import PaginationControls from "@/components/shared/PaginationControls.vue";
import RequestTable from "./RequestTable.vue";
import type { Page, VacationRequest } from "@/types/api";

defineProps<{
  data: Page<VacationRequest> | null;
  loading: boolean;
  error: string;
  reviewable?: boolean;
  busyId?: number | null;
}>();

const emit = defineEmits<{
  reload: [];
  page: [value: number];
  approve: [id: number];
  reject: [id: number, comments: string];
}>();

function reject(id: number, comments: string) {
  emit("reject", id, comments);
}
</script>

<template>
  <div class="panel overflow-hidden" :aria-busy="loading">
    <p v-if="loading" role="status" class="p-8 text-center text-sm text-slate-500">
      Loading requests…
    </p>
    <div v-else-if="error" class="space-y-3 p-5">
      <ErrorMessage :message="error" /><button
        type="button"
        class="button button-secondary"
        @click="emit('reload')"
      >
        Try again
      </button>
    </div>
    <template v-else-if="data">
      <RequestTable
        v-if="data.items.length"
        :items="data.items"
        :reviewable="reviewable"
        :busy-id="busyId"
        @approve="emit('approve', $event)"
        @reject="reject"
      />
      <div v-else class="px-5 py-12 text-center">
        <h3 class="font-semibold">No requests to show</h3>
        <p class="mt-2 text-sm text-slate-500">
          {{
            reviewable
              ? "Try different filters, or check back later."
              : "Submit a request above to start planning your time off."
          }}
        </p>
      </div>
      <PaginationControls
        :page="data.page"
        :page-size="data.pageSize"
        :total="data.total"
        :disabled="loading || busyId != null"
        @change="emit('page', $event)"
      />
    </template>
  </div>
</template>
