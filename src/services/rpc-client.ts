import { getApiBaseUrl, getConfiguredWebApiBaseUrl } from '@/services/runtime';

export function getRpcBaseUrl(): string {
  return getApiBaseUrl() || getConfiguredWebApiBaseUrl() || '';
}

export function rpcFetch(...args: Parameters<typeof globalThis.fetch>): ReturnType<typeof globalThis.fetch> {
  return globalThis.fetch(...args);
}
