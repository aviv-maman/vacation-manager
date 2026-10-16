<script setup lang="ts">
import type { Employee, VacationStatus } from "@/types/api";

defineProps<{ users: Employee[]; disabled?: boolean }>();

const status = defineModel<"" | VacationStatus>("status", { required: true });
const employee = defineModel<string>("employee", { required: true });
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <div>
      <label for="status-filter" class="label">Status</label
      ><select id="status-filter" name="status" v-model="status" class="field" :disabled="disabled">
        <option value="">All statuses</option>
        <option>Pending</option>
        <option>Approved</option>
        <option>Rejected</option>
      </select>
    </div>
    <div>
      <label for="employee-filter" class="label">Employee</label
      ><select
        id="employee-filter"
        name="userId"
        v-model="employee"
        class="field"
        :disabled="disabled"
      >
        <option value="">All employees</option>
        <option v-for="user in users" :key="user.id" :value="String(user.id)">
          {{ user.name }}
        </option>
      </select>
    </div>
  </div>
</template>
