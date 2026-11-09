import "server-only";

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing environment variable ${variable}`);
    this.name = "MissingEnvError";
  }
}

/**
 * Reads a server-side environment variable, throwing a clear error if it is unset.
 * Called at use time (not module load) so a missing variable breaks only the feature
 * that needs it, not the whole build.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}
