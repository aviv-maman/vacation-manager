<script setup lang="ts">
import LoginForm from "@/components/auth/LoginForm.vue";
</script>

<template>
  <section
    class="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:mt-12 md:grid-cols-2"
    aria-labelledby="login-title"
  >
    <div class="flex flex-col justify-between gap-16 bg-emerald-950 p-8 text-white sm:p-12">
      <div class="flex items-center gap-3 text-sm font-semibold">
        <span class="grid size-10 place-items-center rounded-xl bg-white/15" aria-hidden="true"
          >VM</span
        >Vacation Manager
      </div>
      <div>
        <p class="mb-4 text-sm font-medium text-emerald-200">TIME OFF, WELL PLANNED</p>
        <h1 id="login-title" class="text-4xl leading-tight font-semibold tracking-tight">
          Make room<br />for a break.
        </h1>
        <p class="mt-6 max-w-xs leading-relaxed text-emerald-100">
          Request time off, keep decisions clear, and see when your team is away.
        </p>
      </div>
      <p class="text-sm text-emerald-200">A little planning. More peace of mind.</p>
    </div>
    <div class="flex flex-col justify-center p-8 sm:p-12">
      <h2 class="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p class="mt-2 mb-8 text-sm text-slate-500">Log in to your Requester or Validator account.</p>
      <LoginForm />
    </div>
  </section>
</template>
