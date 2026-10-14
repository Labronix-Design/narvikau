import { createContactEmailHandler } from './contact-email.js';

// Endpoint mode is server-owned. Only the validated dealer/fitment selection
// comes from the browser; contact and quote attribution cannot be selected here.
export function createPartnerEmailHandler(dependencies = {}) {
  return createContactEmailHandler({ ...dependencies, partner: true });
}

export const handler = createPartnerEmailHandler();
