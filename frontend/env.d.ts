/// <reference types="vite/client" />

import "vue-router";
import type { Role } from "./src/types/api";

declare module "vue-router" {
  interface RouteMeta {
    roles?: Role[];
    guestOnly?: boolean;
    title?: string;
  }
}
