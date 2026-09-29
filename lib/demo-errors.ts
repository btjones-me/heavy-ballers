import {AppError} from './types';

// Return only our own safe copy: upstream messages may contain private details.
export async function providerFailure(response: Response): Promise<AppError> {
  const body = await response.json().catch(() => null) as {error?: {code?: string; type?: string}} | null;
  const code = body?.error?.code ?? body?.error?.type;
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return new AppError('The AI account has no available credit or has reached its billing limit. The site admin needs to check the connected AI account’s billing. This is separate from the website’s £5 monthly allowance.', 503, 'AI_CREDIT_LIMIT');
  if (response.status === 401) return new AppError('The AI provider rejected the API key. It may have expired or been revoked. The site admin needs to replace the key before the demo can continue.', 503, 'AI_AUTH');
  if (response.status === 403 || response.status === 404) return new AppError('The AI account cannot access the configured model. The site admin needs to check model access and the demo’s model setting.', 503, 'AI_MODEL_ACCESS');
  if (response.status === 429) return new AppError('The AI provider is receiving too many requests. Wait about a minute, then continue the demo.', 503, 'AI_RATE_LIMIT');
  if (response.status >= 500) return new AppError(`The AI provider is temporarily unavailable (HTTP ${response.status}). Wait a minute and try again.`, 503, 'AI_UNAVAILABLE');
  return new AppError(`The AI provider could not accept the demo request (HTTP ${response.status}). Ask the site admin to check the model and request settings.`, 503, 'AI_REQUEST_REJECTED');
}

export function connectionFailure(service: 'AI provider' | 'match-report service', error: unknown): AppError {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  const timeout = name === 'TimeoutError' || name === 'AbortError';
  return new AppError(timeout ? `The ${service} took too long to respond. Some details may already be saved. Check the saved result, then try the last message again.` : `The website could not connect to the ${service}. Try again shortly; if it persists, ask the site admin to check the connection.`, 503, timeout ? 'DEMO_TIMEOUT' : 'DEMO_CONNECTION');
}
