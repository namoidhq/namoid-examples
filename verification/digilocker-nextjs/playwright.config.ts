import { defineConfig } from "@playwright/test";
const port = process.env.TEST_PORT || "3011";
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: origin,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: origin,
    reuseExistingServer: false,
    env: {
      DEMO_MODE: "true",
      NEXT_PUBLIC_APP_URL: origin,
      PORT: port,
      HOSTNAME: "127.0.0.1",
    },
  },
});
