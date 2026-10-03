export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    window.prompt('Copy the link', url)
    return 'copied'
  }
}

export function organizerShareUrl(organizer: { id: string; name: string }) {
  const slug = organizer.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${window.location.origin}/organizers/${organizer.id}/${slug}`
}
