import type { NextConfig } from "next";
// Invitation UI is compiled in only for an explicit local opt-in, and never on Vercel/serverless
// (mirrors invitesAvailable() in lib/invites.server.ts, which independently refuses every invitation API call).
const serverless = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const config: NextConfig = {
  transpilePackages: ["@opentab/shared"],
  env: { OT_INVITES_UI: process.env.INVITES_ENABLED === "1" && !serverless ? "1" : "0" },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
};
export default config;
