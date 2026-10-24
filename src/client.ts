import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from './config.js';
import type { ApiDefinition } from './catalog.js';

export type JsonObject = Record<string, unknown>;
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class RakutenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: string,
  ) { super(message); this.name = 'RakutenError'; }
}

export class RakutenClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly config: Config, private readonly fetcher: typeof fetch = fetch) {}

  redact(text: string): string {
    for (const value of [this.config.accessKey, this.config.applicationId, this.config.affiliateId]) {
      if (value) {
        text = text.split(value).join('[REDACTED]');
        text = text.split(encodeURIComponent(value)).join('[REDACTED]');
      }
    }
    return text;
  }

  async request(api: ApiDefinition, input: JsonObject, signal?: AbortSignal): Promise<JsonObject> {
    const args = api.schema.parse(input) as JsonObject;
    const execute = async () => {
      signal?.throwIfAborted();
      const pause = this.config.minIntervalMs - (Date.now() - this.lastStartedAt);
      if (pause > 0) await delay(pause, undefined, { signal });
      signal?.throwIfAborted();
      this.lastStartedAt = Date.now();
      return this.fetchApi(api, args, signal);
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => undefined);
    try { return await result; }
    catch (error) {
      if (error instanceof RakutenError) throw error;
      if (signal?.aborted) throw new RakutenError('cancelled', 'Rakuten Travel request was cancelled.');
      throw new RakutenError('network_error', 'Unable to reach Rakuten Travel. Check your network connection.');
    }
  }

  private async fetchApi(api: ApiDefinition, args: JsonObject, signal?: AbortSignal): Promise<JsonObject> {
    const url = new URL(`https://openapi.rakuten.co.jp/engine/api/Travel/${api.api}/${api.version}`);
    url.searchParams.set('applicationId', this.config.applicationId);
    url.searchParams.set('format', 'json');
    if (this.config.affiliateId) url.searchParams.set('affiliateId', this.config.affiliateId);
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        const serialized = Array.isArray(value) ? value.join(',') : String(value);
        const normalized = ['hotelNo', 'squeezeCondition', 'hotelChainCode', 'elements', 'genre'].includes(key)
          ? serialized.split(',').map(token => token.trim()).join(',') : serialized;
        url.searchParams.set(key, normalized);
      }
    }
    const headers: Record<string, string> = { accessKey: this.config.accessKey, accept: 'application/json' };
    if (this.config.referer) {
      headers.Referer = this.config.referer;
      headers.Origin = new URL(this.config.referer).origin;
    }
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await this.fetcher(url, { headers, signal: requestSignal, redirect: 'error' });
      const text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); }
      catch {
        throw new RakutenError('invalid_response', `Rakuten returned a non-JSON response (HTTP ${response.status}).`,
          response.status, response.headers.get('retry-after') ?? undefined);
      }
      if (!response.ok || (isObject(body) && (typeof body.error === 'string' || isObject(body.errors)))) {
        const gateway = isObject(body) && isObject(body.errors) ? body.errors : undefined;
        const code = isObject(body) && typeof body.error === 'string' ? body.error
          : gateway && typeof gateway.errorMessage === 'string' ? gateway.errorMessage : 'http_error';
        const description = isObject(body) && typeof body.error_description === 'string'
          ? body.error_description : code === 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING'
            ? 'Set RAKUTEN_REFERER to a website URL registered in this Rakuten application\'s Allowed websites settings.'
            : gateway && typeof gateway.errorMessage === 'string' ? gateway.errorMessage : `Rakuten returned HTTP ${response.status}.`;
        const detail = this.redact(description);
        throw new RakutenError(this.redact(code), detail, response.status, response.headers.get('retry-after') ?? undefined);
      }
      if (!isObject(body)) throw new RakutenError('invalid_response', 'Rakuten returned an unexpected JSON structure.', response.status);
      return body;
    } catch (error) {
      if (error instanceof RakutenError) throw error;
      if (signal?.aborted) throw new RakutenError('cancelled', 'Rakuten Travel request was cancelled.');
      if (timeout.aborted) throw new RakutenError('timeout', `Rakuten Travel did not respond within ${this.config.timeoutMs} ms.`);
      throw new RakutenError('network_error', 'Unable to reach Rakuten Travel. Check your network connection.');
    }
  }
}
