<script setup lang="ts">
import { shallowRef, watch } from "vue";
import ErrorMessage from "@/components/shared/ErrorMessage.vue";

const props = defineProps<{
  from: string;
  to: string;
  defaults: { from: string; to: string };
  busy: boolean;
}>();
const emit = defineEmits<{ apply: [range: { from: string; to: string }]; reset: [] }>();
const from = shallowRef(props.from);
const to = shallowRef(props.to);
const error = shallowRef("");

watch([() => props.from, () => props.to], ([start, end]) => {
  from.value = start;
  to.value = end;
  error.value = "";
});

function reset() {
  from.value = props.defaults.from;
  to.value = props.defaults.to;
  error.value = "";
  emit("reset");
}

function submit() {
  error.value = "";
  if (to.value < from.value) {
    error.value = "End of range must be on or after its start.";

    return;
  }

  const days =
    (Date.parse(`${to.value}T00:00:00Z`) - Date.parse(`${from.value}T00:00:00Z`)) / 86_400_000;

  if (days > 366) {
    error.value = "Choose a range of up to 366 days.";

    return;
  }
  emit("apply", { from: from.value, to: to.value });
}
</script>

<template>
  <form class="panel space-y-4 p-5 sm:p-6" autocomplete="off" @submit.prevent="submit">
    <ErrorMessage v-if="error" :message="error" />
    <div class="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <label for="team-from" class="label">From</label
        ><input
          id="team-from"
          name="from"
          v-model="from"
          type="date"
          class="field"
          required
          :disabled="busy"
        />
      </div>
      <div>
        <label for="team-to" class="label">To</label
        ><input
          id="team-to"
          name="to"
          v-model="to"
          type="date"
          class="field"
          required
          :min="from"
          :disabled="busy"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="button button-primary" :disabled="busy">
          {{ busy ? "Loading…" : "Show vacations" }}
        </button>
        <button type="button" class="button button-secondary" :disabled="busy" @click="reset">
          Reset filters
        </button>
      </div>
    </div>
    <p class="text-xs text-slate-500">
      Past dates and single days are welcome. Maximum range: 366 days.
    </p>
  </form>
</template>
