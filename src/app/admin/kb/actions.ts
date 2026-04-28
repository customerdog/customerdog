'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addSource,
  deleteSource,
  fetchAndParseUrl,
  setSourceActive,
} from '@/lib/kb';

const REDIRECT_OK = '/admin/kb';
const REDIRECT_ERR = (msg: string) =>
  `/admin/kb?error=${encodeURIComponent(msg)}`;

/** Fetch a URL, extract text, store as a `url` source. */
export async function addUrlAction(formData: FormData): Promise<void> {
  const url = String(formData.get('url') ?? '').trim();
  if (!url) redirect(REDIRECT_ERR('URL is required'));
  try {
    const parsed = await fetchAndParseUrl(url);
    await addSource({ type: 'url', source: url, parsed_content: parsed });
  } catch (e) {
    redirect(REDIRECT_ERR((e as Error).message));
  }
  revalidatePath('/admin/kb');
  redirect(`${REDIRECT_OK}?added=url`);
}

/** Store pasted markdown directly as a `markdown` source. */
export async function addMarkdownAction(formData: FormData): Promise<void> {
  const label = String(formData.get('label') ?? '').trim();
  const content = String(formData.get('content') ?? '');
  if (!label) redirect(REDIRECT_ERR('Label is required'));
  if (!content.trim()) redirect(REDIRECT_ERR('Content is empty'));
  try {
    await addSource({
      type: 'markdown',
      source: label,
      parsed_content: content,
    });
  } catch (e) {
    redirect(REDIRECT_ERR((e as Error).message));
  }
  revalidatePath('/admin/kb');
  redirect(`${REDIRECT_OK}?added=markdown`);
}

/** Delete a source by id. */
export async function deleteSourceAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect(REDIRECT_ERR('Missing id'));
  try {
    await deleteSource(id);
  } catch (e) {
    redirect(REDIRECT_ERR((e as Error).message));
  }
  revalidatePath('/admin/kb');
  redirect(REDIRECT_OK);
}

/** Toggle `active` flag on a source — disable without deleting. */
export async function toggleActiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  if (!id) redirect(REDIRECT_ERR('Missing id'));
  try {
    await setSourceActive(id, active);
  } catch (e) {
    redirect(REDIRECT_ERR((e as Error).message));
  }
  revalidatePath('/admin/kb');
  redirect(REDIRECT_OK);
}
