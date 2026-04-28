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
};

export type TicketResult = { resultUrl: string | null };
