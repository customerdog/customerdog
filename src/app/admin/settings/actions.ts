'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabase, type ConfigRow } from '@/lib/supabase';

const ALLOWED_DEST = ['email', 'slack', 'linear', 'zendesk'] as const;
const ALLOWED_CONTACT = ['none', 'email', 'phone', 'either'] as const;

function asEnum<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return (allowed as readonly string[]).includes(String(raw))
    ? (String(raw) as T[number])
    : fallback;
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const patch: Partial<ConfigRow> = {
    company_name: String(formData.get('company_name') ?? '').trim() || 'Your Company',
    brand_color: String(formData.get('brand_color') ?? '#dc2626').trim(),
    ticket_destination: asEnum(
      formData.get('ticket_destination'),
      ALLOWED_DEST,
      'email',
    ),
    visitor_contact_required: asEnum(
      formData.get('visitor_contact_required'),
      ALLOWED_CONTACT,
      'email',
    ),
    support_email: String(formData.get('support_email') ?? '').trim() || null,
    system_prompt_extras:
      String(formData.get('system_prompt_extras') ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase().from('config').update(patch).eq('id', 1);
  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/admin/settings');
  redirect('/admin/settings?saved=1');
}
