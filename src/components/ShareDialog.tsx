import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, FacebookIcon, InstagramIcon, LinkIcon, TwitterXIcon, WhatsAppIcon, XIcon } from './Icon'

type Props = {
  open: boolean
  title: string
  url: string
  description?: string
  onClose: () => void
}

export default function ShareDialog({ open, title, url, description = 'Send it to someone who would love it.', onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy the link', url)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return createPortal(
    <div className="event-share-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="event-share-dialog" role="dialog" aria-modal="true" aria-labelledby="organizer-share-title">
        <div className="event-share-heading">
          <div><strong id="organizer-share-title">Share {title}</strong><small>{description}</small></div>
          <button type="button" className="event-share-close" onClick={onClose} aria-label="Close share dialog"><XIcon size={17} /></button>
        </div>
        <div className="event-share-options">
          <a href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={22} /><span>WhatsApp</span></a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer"><FacebookIcon size={22} /><span>Facebook</span></a>
          <a href="https://www.instagram.com/" target="_blank" rel="noreferrer"><InstagramIcon size={22} /><span>Instagram</span></a>
          <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} target="_blank" rel="noreferrer"><TwitterXIcon size={20} /><span>X</span></a>
          <button type="button" onClick={() => void copyLink()}><LinkIcon size={21} /><span>{copied ? <><CheckIcon size={13} />Copied</> : 'Copy link'}</span></button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
