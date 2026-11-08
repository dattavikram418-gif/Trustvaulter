// Browser values are inlined at build time; the server render can fall back to its runtime variables.
// Missing values show a configuration screen instead of crashing the app on first backend access.
const env = (name: string): string | undefined => {
  const built = (import.meta.env as Record<string, string | undefined>)[`VITE_${name}`];
  if (built) return built;
  return typeof process !== "undefined" ? process.env[name] : undefined;
};
export const BACKEND_CONFIGURED = Boolean(env("SUPABASE_URL") && env("SUPABASE_PUBLISHABLE_KEY"));
