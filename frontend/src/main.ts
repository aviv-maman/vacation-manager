import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { setUnauthorizedHandler } from "./lib/api";
import "./assets/main.css";

setUnauthorizedHandler(() => {
  void router.replace({ path: "/login", query: { expired: "1" } });
});

const app = createApp(App);

app.use(router);

app.mount("#app");
