import { defineConfig } from "vite";

// The site has five pages. Vite builds only index.html unless it's told about the others.
export default defineConfig({
  // The project site lives at https://<owner>.github.io/generic-grocery/, not at the root.
  base: "/generic-grocery/",
  build: {
    rolldownOptions: {
      input: ["index.html", "deals.html", "departments.html", "pickup.html", "turkey.html"],
    },
  },
});
