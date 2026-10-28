import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", use: { baseURL: "http://localhost:3105", headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined }, webServer: { command: "npm run start -- --port 3105", url: "http://localhost:3105/login", reuseExistingServer: false }, reporter: "list" });
