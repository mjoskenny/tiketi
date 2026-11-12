import { useEffect, useRef, type FormEvent } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Sparkles, Strikethrough, Underline } from 'lucide-react'
import i18n from '../lib/i18n'
import { currentLocale } from '../lib/locale'

type RichTextEditorProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
}

const ALLOWED_TAGS = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'FONT', 'H2', 'H3', 'LI', 'OL', 'P', 'S', 'STRIKE', 'STRONG', 'U', 'UL'])
const BLOCKED_TAGS = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'VIDEO', 'AUDIO'])

export function sanitizeRichTextHtml(value: string, maxLength = 500) {
  if (!value) return ''
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const output = document.createElement('div')
  let remaining = maxLength

  const copyNode = (node: Node, parent: HTMLElement) => {
    if (remaining <= 0) return
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const content = text.slice(0, remaining)
      remaining -= content.length
      parent.append(document.createTextNode(content))
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (BLOCKED_TAGS.has(node.tagName)) return
    if (!ALLOWED_TAGS.has(node.tagName)) {
      Array.from(node.childNodes).forEach(child => copyNode(child, parent))
      return
    }
    const clean = document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName.toLowerCase())
    if (node.tagName === 'FONT') {
      const family = node.getAttribute('face')
      const size = Number(node.getAttribute('size'))
      if (family && ['Arial', 'Georgia', 'monospace'].includes(family)) clean.style.fontFamily = family
      if (Number.isInteger(size) && size >= 1 && size <= 7) clean.style.fontSize = `${[10, 12, 14, 18, 24, 32, 48][size - 1]}px`
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href)) {
        clean.setAttribute('href', href)
        clean.setAttribute('target', '_blank')
        clean.setAttribute('rel', 'noopener noreferrer')
      }
    }
    Array.from(node.childNodes).forEach(child => copyNode(child, clean))
    parent.append(clean)
  }

  Array.from(parsed.body.childNodes).forEach(node => copyNode(node, output))
  return output.innerHTML
}

function getTextLength(value: string) {
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  return parsed.body.textContent?.length ?? 0
}

export default function RichTextEditor({ id, label, value, onChange, placeholder, maxLength = 500 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const localizedLabel = i18n.t(label)
  const localizedPlaceholder = i18n.t(placeholder)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor) return
    const safeHtml = sanitizeRichTextHtml(value, Math.max(maxLength, getTextLength(value)))
    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml
  }, [value, maxLength])

  const effectiveMaxLength = Math.max(maxLength, getTextLength(value))

  const applyCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    if (editorRef.current) onChange(sanitizeRichTextHtml(editorRef.current.innerHTML, effectiveMaxLength))
  }

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const editor = event.currentTarget
    const safeHtml = sanitizeRichTextHtml(editor.innerHTML, effectiveMaxLength)
    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml
    onChange(safeHtml)
  }

  const insertLink = () => {
    const url = window.prompt(i18n.t('Enter a link URL'))
    if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) applyCommand('createLink', url.trim())
  }

  const characterCount = getTextLength(value)
  const toolbarButton = (title: string, Icon: typeof Bold, command: string, commandValue?: string) => (
    <button type="button" title={i18n.t(title)} aria-label={i18n.t(title)} onMouseDown={event => event.preventDefault()} onClick={() => applyCommand(command, commandValue)}>
      <Icon size={15} strokeWidth={2} />
    </button>
  )

  return (
    <section className="organizer-rich-editor" aria-labelledby={`${id}-label`}>
      <header className="organizer-rich-editor-heading">
        <label id={`${id}-label`} htmlFor={id}>{localizedLabel}</label>
        <div className="organizer-rich-editor-heading-meta">
          <span>{Math.max(0, maxLength - characterCount)} {i18n.t('left')}</span>
          <button type="button" className="organizer-rich-editor-ai" disabled title={i18n.t('AI writing is not configured for this workspace')}>
            <Sparkles size={14} /> {i18n.t('Generate with AI')}
          </button>
        </div>
      </header>
      <div className="organizer-rich-editor-shell">
        <div className="organizer-rich-editor-toolbar" role="toolbar" aria-label={i18n.t(`${label} formatting`)}>
          <select aria-label={i18n.t('Text style')} defaultValue="p" onChange={event => applyCommand('formatBlock', event.target.value)}>
            <option value="p">{i18n.t('Normal')}</option><option value="h2">{i18n.t('Heading')}</option><option value="h3">{i18n.t('Subheading')}</option>
          </select>
          <select aria-label={i18n.t('Font family')} defaultValue="Arial" onChange={event => applyCommand('fontName', event.target.value)}>
            <option value="Arial">{i18n.t('Sans Serif')}</option><option value="Georgia">{i18n.t('Serif')}</option><option value="monospace">{i18n.t('Monospace')}</option>
          </select>
          <select aria-label={i18n.t('Text size')} defaultValue="3" onChange={event => applyCommand('fontSize', event.target.value)}>
            <option value="2">{i18n.t('Small')}</option><option value="3">{i18n.t('Normal')}</option><option value="4">{i18n.t('Large')}</option>
          </select>
          {toolbarButton('Bold', Bold, 'bold')}
          {toolbarButton('Italic', Italic, 'italic')}
          {toolbarButton('Underline', Underline, 'underline')}
          {toolbarButton('Strikethrough', Strikethrough, 'strikeThrough')}
          {toolbarButton('Block quote', Quote, 'formatBlock', 'blockquote')}
          <span className="organizer-rich-editor-toolbar-divider" />
          {toolbarButton('Numbered list', ListOrdered, 'insertOrderedList')}
          {toolbarButton('Bulleted list', List, 'insertUnorderedList')}
          {toolbarButton('Align left', AlignLeft, 'justifyLeft')}
          {toolbarButton('Align center', AlignCenter, 'justifyCenter')}
          {toolbarButton('Align right', AlignRight, 'justifyRight')}
          <button type="button" title={i18n.t('Add link')} aria-label={i18n.t('Add link')} onMouseDown={event => event.preventDefault()} onClick={insertLink}><Link2 size={15} strokeWidth={2} /></button>
          <button type="button" title={i18n.t('Remove formatting')} aria-label={i18n.t('Remove formatting')} onMouseDown={event => event.preventDefault()} onClick={() => applyCommand('removeFormat')}><RemoveFormatting size={15} strokeWidth={2} /></button>
        </div>
        <div
          id={id}
          ref={editorRef}
          className="organizer-rich-editor-content"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={localizedLabel}
          data-placeholder={localizedPlaceholder}
          onInput={handleInput}
          onBlur={() => {
            if (editorRef.current) {
              const safeHtml = sanitizeRichTextHtml(editorRef.current.innerHTML, effectiveMaxLength)
              editorRef.current.innerHTML = safeHtml
              onChange(safeHtml)
            }
          }}
        />
      </div>
      <div className="organizer-rich-editor-footer"><span>{characterCount.toLocaleString(currentLocale())} {i18n.t('characters')}</span></div>
    </section>
  )
}

export function RichTextContent({ value, className = '' }: { value: string; className?: string }) {
  const safeHtml = sanitizeRichTextHtml(value, 10000)
  if (!safeHtml) return null
  return <div className={`organizer-rich-text-content ${className}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />
}
