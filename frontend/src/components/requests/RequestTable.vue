<script setup lang="ts">
import StatusBadge from "@/components/shared/StatusBadge.vue";
import DecisionActions from "./DecisionActions.vue";
import { formatDate } from "@/lib/dates";
import type { VacationRequest } from "@/types/api";

defineProps<{ items: VacationRequest[]; reviewable?: boolean; busyId?: number | null }>();

const emit = defineEmits<{ approve: [id: number]; reject: [id: number, comments: string] }>();

function reject(id: number, comments: string) {
  emit("reject", id, comments);
}
</script>

<template>
  <div class="overflow-x-auto" role="region" aria-label="Vacation requests" tabindex="0">
    <table class="w-full min-w-160 border-collapse">
      <caption class="sr-only">
        Vacation requests, newest first
      </caption>
      <thead class="border-b border-slate-200 bg-slate-50">
        <tr>
          <th v-if="reviewable" scope="col" class="table-head">Employee</th>
          <th scope="col" class="table-head">Dates</th>
          <th scope="col" class="table-head">Status</th>
          <th scope="col" class="table-head">Reason &amp; comments</th>
          <th v-if="reviewable" scope="col" class="table-head">Decision</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="request in items" :key="request.id" class="hover:bg-slate-50/60">
          <td v-if="reviewable" class="table-cell font-medium">{{ request.user?.name }}</td>
          <td class="table-cell whitespace-nowrap">
            <p class="font-medium">{{ formatDate(request.startDate) }}</p>
            <p class="mt-1 text-xs text-slate-500">through {{ formatDate(request.endDate) }}</p>
          </td>
          <td class="table-cell"><StatusBadge :status="request.status" /></td>
          <td class="table-cell min-w-48 max-w-sm">
            <p class="whitespace-pre-wrap wrap-anywhere text-slate-600">
              {{ request.reason || "No reason provided" }}
            </p>
            <p
              v-if="request.comments"
              class="mt-2 whitespace-pre-wrap wrap-anywhere text-slate-900"
            >
              <span class="font-semibold">Rejection comment:</span> {{ request.comments }}
            </p>
          </td>
          <td v-if="reviewable" class="table-cell">
            <DecisionActions
              v-if="request.status === 'Pending'"
              :request-id="request.id"
              :disabled="busyId != null"
              :busy="busyId === request.id"
              @approve="emit('approve', $event)"
              @reject="reject"
            /><span v-else class="text-xs text-slate-400">Decision complete</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
