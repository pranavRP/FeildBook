import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const serverEnv = {
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get siteUrl() {
    return process.env.SITE_URL || "http://localhost:3000";
  },
  get timezone() {
    return process.env.APP_TIMEZONE || "America/Los_Angeles";
  },
  get apiRateLimitPerMinute() {
    return Number(process.env.API_RATE_LIMIT_PER_MINUTE || 60);
  },
};
