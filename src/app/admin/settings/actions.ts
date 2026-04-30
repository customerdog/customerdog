'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabase, type ConfigRow } from '@/lib/supabase';

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const patch: Partial<ConfigRow> = {
    company_name:
      String(formData.get('company_name') ?? '').trim() || 'Your Company',
    brand_color: String(formData.get('brand_color') ?? '#dc2626').trim(),
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
