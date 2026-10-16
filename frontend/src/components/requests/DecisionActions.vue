<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef } from "vue";

const props = defineProps<{ requestId: number; disabled: boolean; busy: boolean }>();
const emit = defineEmits<{ approve: [id: number]; reject: [id: number, comments: string] }>();
const rejecting = shallowRef(false);
const comments = shallowRef("");
const input = useTemplateRef<HTMLTextAreaElement>("comment");

async function openRejection() {
  rejecting.value = true;
  await nextTick();
  input.value?.focus();
}

function reject() {
  if (comments.value.trim() && !props.disabled)
    emit("reject", props.requestId, comments.value.trim());
}
</script>

<template>
  <div class="min-w-48">
    <p v-if="busy" role="status" class="mb-2 text-xs text-slate-500">Saving decision…</p>
    <form v-if="rejecting" class="space-y-2" autocomplete="off" @submit.prevent="reject">
      <label :for="`comment-${requestId}`" class="label">Rejection comment</label
      ><textarea
        :id="`comment-${requestId}`"
        name="comments"
        ref="comment"
        v-model="comments"
        class="field"
        rows="2"
        maxlength="500"
        required
        :disabled="disabled"
      />
      <div class="flex gap-2">
        <button
          class="button button-primary"
          type="submit"
          :disabled="disabled || !comments.trim()"
        >
          Confirm rejection</button
        ><button
          class="button button-secondary"
          type="button"
          :disabled="disabled"
          @click="rejecting = false"
        >
          Cancel
        </button>
      </div>
    </form>
    <div v-else class="flex gap-2">
      <button
        type="button"
        class="button button-primary"
        :disabled="disabled"
        @click="emit('approve', requestId)"
      >
        Approve</button
      ><button
        type="button"
        class="button button-secondary"
        :disabled="disabled"
        @click="openRejection"
      >
        Reject
      </button>
    </div>
  </div>
</template>
