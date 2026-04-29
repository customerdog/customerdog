import 'server-only';

/** Common shape passed to every ticket destination dispatcher. */
export type TicketArgs = {
  summary: string;
  details: string;
  contact: {
    email?: string | null;
    phone?: string | null;
  };
  priority: 'low' | 'normal' | 'high' | 'urgent';
  visitorId: string;
  threadId: string;
  /** Fallback destination email when ticket_destination='email' and
   *  TICKET_EMAIL_TO env isn't set. Typically config.support_email so
   *  the operator only has to configure one address. */
  fallbackEmail?: string | null;
};

export type TicketResult = { resultUrl: string | null };
