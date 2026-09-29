// Both ends must check origin AND the exact window, not just a message name.
export function acceptsFrameMessage(event: { origin: string; source: unknown; data: unknown }, origin: string, peer: unknown): boolean {
  return Boolean(peer && event.origin === origin && event.source === peer && event.data && typeof event.data === 'object' && 'type' in event.data);
}
