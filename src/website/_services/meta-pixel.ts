export const META_PIXEL_ID = '1573411030753133';
const META_PIXEL_SCRIPT_SELECTOR = 'script[data-navrik-meta-pixel]';

type MetaPixelQueue = unknown[][];
export type MetaPixelCommand = ((...args: unknown[]) => void) & {
  loaded?: boolean;
  push?: MetaPixelCommand;
  queue?: MetaPixelQueue;
  version?: string;
};

export interface MetaPixelWindow {
  fbq?: MetaPixelCommand;
  _fbq?: MetaPixelCommand;
}

export interface MetaPixelDocument {
  head: Pick<HTMLHeadElement, 'querySelector' | 'appendChild'>;
  createElement(tagName: 'script'): HTMLScriptElement;
}

/**
 * Installs Meta's official browser library once. Consent and route checks stay
 * with AnalyticsService so this helper remains deterministic and testable.
 */
export function ensureMetaPixel(windowRef: MetaPixelWindow, documentRef: MetaPixelDocument): void {
  const fbq = windowRef.fbq ?? createQueueingCommand();
  windowRef.fbq ??= fbq;
  windowRef._fbq ??= fbq;

  if (documentRef.head.querySelector(META_PIXEL_SCRIPT_SELECTOR)) return;

  fbq('init', META_PIXEL_ID);
  const script = documentRef.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.setAttribute('data-navrik-meta-pixel', META_PIXEL_ID);
  documentRef.head.appendChild(script);
}

export function trackMetaPixelEvent(windowRef: MetaPixelWindow, event: 'PageView' | 'Lead'): void {
  windowRef.fbq?.('track', event);
}

function createQueueingCommand(): MetaPixelCommand {
  const command = ((...args: unknown[]): void => {
    command.queue ??= [];
    command.queue.push(args);
  }) as MetaPixelCommand;
  command.loaded = true;
  command.push = command;
  command.version = '2.0';
  return command;
}
