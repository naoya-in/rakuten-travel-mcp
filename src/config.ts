import { loadEnvFile } from 'node:process';

export interface Config {
  applicationId: string;
  accessKey: string;
  affiliateId?: string;
  referer?: string;
  timeoutMs: number;
  minIntervalMs: number;
}

export function loadEnvironment(path?: string): void {
  const selected = path ?? process.env.RAKUTEN_ENV_FILE;
  if (selected) loadEnvFile(selected);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name} in the MCP server's environment configuration.`);
    return value;
  };
  const integer = (name: string, fallback: number, min: number): number => {
    const raw = env[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > 2_147_483_647) {
      throw new Error(`${name} must be an integer between ${min} and 2147483647.`);
    }
    return value;
  };
  const referer = env.RAKUTEN_REFERER?.trim() || undefined;
  if (referer && (!URL.canParse(referer) || !/^https?:$/.test(new URL(referer).protocol))) {
    throw new Error('RAKUTEN_REFERER must be an HTTP or HTTPS URL.');
  }
  return {
    applicationId: required('RAKUTEN_APPLICATION_ID'),
    accessKey: required('RAKUTEN_ACCESS_KEY'),
    affiliateId: env.RAKUTEN_AFFILIATE_ID?.trim() || undefined,
    referer,
    timeoutMs: integer('RAKUTEN_TIMEOUT_MS', 15_000, 1),
    minIntervalMs: integer('RAKUTEN_MIN_INTERVAL_MS', 1_000, 0),
  };
}
