<script setup lang="ts">
import { formatDate } from "@/lib/dates";
import type { TeamVacation } from "@/types/api";

defineProps<{ items: TeamVacation[] }>();
</script>

<template>
  <div
    class="panel overflow-x-auto"
    role="region"
    aria-label="Approved team vacations"
    tabindex="0"
  >
    <table class="w-full min-w-120">
      <caption class="sr-only">
        Approved team vacations in the selected date range
      </caption>
      <thead class="border-b border-slate-200 bg-slate-50">
        <tr>
          <th scope="col" class="table-head">Employee</th>
          <th scope="col" class="table-head">Start date</th>
          <th scope="col" class="table-head">End date</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <!-- Rows are stateless. Index keys also distinguish identical public name/date triples. -->
        <tr v-for="(vacation, index) in items" :key="index">
          <td class="table-cell font-medium">{{ vacation.name }}</td>
          <td class="table-cell">{{ formatDate(vacation.startDate) }}</td>
          <td class="table-cell">{{ formatDate(vacation.endDate) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
