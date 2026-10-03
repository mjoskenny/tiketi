import { useEffect, useState, type ReactNode } from 'react'
import i18n from '../lib/i18n'

const localizedAttributes = ['placeholder', 'title', 'aria-label', 'aria-description']
const protectedContent = [
  '[data-locale-ignore]',
  '.sinc-event-description p',
  '.sinc-organizer-description',
  '.sinc-event-page h1',
  '.sinc-organizer-identities h1',
  '.organizer-reference-marquee',
]

function translateStaticText(value: string) {
  const key = value.trim()
  const directTranslation = i18n.t(key)
  if (directTranslation !== key || !i18n.resolvedLanguage?.startsWith('fr')) return directTranslation

  let partiallyTranslated = key
  const composableLabels: Array<[RegExp, string]> = [
    [/\bGeneral admission\b/g, 'Admission générale'],
    [/\bNon-consumable\b/g, 'Non consommable'],
    [/\bConsumable\b/g, 'Consommable'],
    [/\bExpires\b/g, 'Expire le'],
    [/\btickets per purchase\b/g, 'billets par achat'],
    [/\bno customer service fee\b/g, 'sans frais de service client'],
  ]
  for (const [pattern, translation] of composableLabels) partiallyTranslated = partiallyTranslated.replace(pattern, translation)
  if (partiallyTranslated !== key) return partiallyTranslated

  const dateSuffix = key.match(/^(.+) · ((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})$/)
  if (dateSuffix) {
    const date = new Date(dateSuffix[2])
    if (!Number.isNaN(date.getTime())) {
      return `${dateSuffix[1]} · ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}`
    }
  }
  const standaloneEnglishDate = key.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/)
  if (standaloneEnglishDate) {
    const date = new Date(`${standaloneEnglishDate[1]} ${standaloneEnglishDate[2]}, ${standaloneEnglishDate[3]}`)
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  }

  const dynamicPatterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^From (.+)$/, match => `À partir de ${match[1]}`],
    [/^(\d+) published events?$/, match => `${match[1]} événement${match[1] === '1' ? '' : 's'} publié${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) events? to explore$/, match => `${match[1]} événement${match[1] === '1' ? '' : 's'} à découvrir`],
    [/^(\d+) events?$/, match => `${match[1]} événement${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) tickets?$/, match => `${match[1]} billet${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) followers?$/, match => `${match[1]} abonné${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) upcoming$/, match => `${match[1]} à venir`],
    [/^(\d+) past$/, match => `${match[1]} passé${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) creators?$/, match => `${match[1]} créateur${match[1] === '1' ? '' : 's'}`],
    [/^(\d+) unread$/, match => `${match[1]} notification${match[1] === '1' ? ' non lue' : ' non lues'}`],
    [/^([\d\s,.]+) guests$/, match => `${match[1]} participants`],
    [/^Week (\d+)$/, match => `Semaine ${match[1]}`],
    [/^(\d+) updates?$/, match => `${match[1]} notification${match[1] === '1' ? '' : 's'}`],
    [/^(\d+(?:\.\d+)?)% of capacity$/, match => `${match[1]} % de la capacité`],
    [/^(Remove|Add) (.+)$/, match => `${match[1] === 'Remove' ? 'Retirer' : 'Ajouter'} ${match[2]}`],
    [/^View (.+) organizer profile$/, match => `Voir le profil de l’organisateur ${match[1]}`],
    [/^Share (.+)$/, match => `Partager ${match[1]}`],
    [/^Email (.+)$/, match => `Envoyer un e-mail à ${match[1]}`],
    [/^Turn your next idea into a$/, () => 'Transformez votre prochaine idée en'],
    [/^Good (morning|afternoon|evening), (.+)$/, match => `${match[1] === 'morning' ? 'Bonjour' : match[1] === 'afternoon' ? 'Bon après-midi' : 'Bonsoir'}, ${match[2]}`],
    [/^(.+) is now published\. Get your tickets before it sells out\.$/, match => `${match[1]} est maintenant publié. Prenez vos billets avant qu’il n’y en ait plus.`],
    [/^(.+) is now published\.$/, match => `${match[1]} est maintenant publié.`],
    [/^(.+) has updated event details\.$/, match => `${match[1]} a mis à jour les détails de l’événement.`],
    [/^(.+) has an event update\.$/, match => `Une actualité concerne l’événement ${match[1]}.`],
    [/^(.+) ticket is confirmed and ready to view\.$/, match => `Le billet pour ${match[1]} est confirmé et prêt à consulter.`],
    [/^(.+) has a sold-out ticket tier\.$/, match => `Tous les billets de l’événement ${match[1]} ont été vendus.`],
    [/^(.+) - (.+) is sold out\.$/, match => `La catégorie ${match[2]} de l’événement ${match[1]} est épuisée.`],
    [/^(.+) - (.+) has (\d+) tickets remaining\.$/, match => `Il reste ${match[3]} billets dans la catégorie ${match[2]} de l’événement ${match[1]}.`],
    [/^Your ticket order status changed to (.+)\.$/, match => `Le statut de votre commande de billets est passé à ${i18n.t(match[1])}.`],
    [/^Your organizer team role is now (.+)\.$/, match => `Votre rôle dans l’équipe organisatrice est désormais : ${match[1]}.`],
    [/^The permissions for your (.+) role were updated\.$/, match => `Les autorisations du rôle ${match[1]} ont été mises à jour.`],
    [/^Your payment was confirmed\.$/, () => 'Votre paiement a été confirmé.'],
    [/^Your payment was refunded\.$/, () => 'Votre paiement a été remboursé.'],
    [/^A new order was placed for your event\.$/, () => 'Une nouvelle commande a été passée pour votre événement.'],
    [/^An order was created or updated for your organization\.$/, () => 'Une commande a été créée ou mise à jour pour votre organisation.'],
    [/^A transaction for your organization was updated\.$/, () => 'Une transaction de votre organisation a été mise à jour.'],
    [/^Someone started following your organizer profile\.$/, () => 'Une personne a commencé à suivre le profil de votre organisation.'],
    [/^You have been invited to join an organizer team\.$/, () => 'Vous avez été invité à rejoindre une équipe organisatrice.'],
    [/^You have been invited to sell tickets for this event\.$/, () => 'Vous avez été invité à vendre des billets pour cet événement.'],
    [/^You have been invited to sell tickets for (.+)\.$/, match => `Vous avez été invité à vendre des billets pour ${match[1]}.`],
    [/^A new team member invitation is waiting for acceptance\.$/, () => 'Une nouvelle invitation à rejoindre l’équipe attend une réponse.'],
    [/^A team member accepted the organizer invitation\.$/, () => 'Un membre a accepté l’invitation de l’organisateur.'],
    [/^Your organizer team access is now active\.$/, () => 'Votre accès à l’équipe organisatrice est maintenant actif.'],
    [/^Your organizer team role was removed\.$/, () => 'Votre rôle dans l’équipe organisatrice a été supprimé.'],
    [/^Your agent sale has been paid and your commission is pending\.$/, () => 'Votre vente a été payée et votre commission est en attente.'],
  ]

  for (const [pattern, translate] of dynamicPatterns) {
    const match = key.match(pattern)
    if (match) return translate(match)
  }
  return directTranslation
}

/** Bridges existing English JSX copy into the i18next catalog while pages are migrated to use t(). */
export function LocaleContent({ children }: { children: ReactNode }) {
  const [, setLanguage] = useState(i18n.resolvedLanguage ?? 'en')

  useEffect(() => {
    const handleLanguageChanged = (language: string) => setLanguage(language)
    i18n.on('languageChanged', handleLanguageChanged)
    return () => { i18n.off('languageChanged', handleLanguageChanged) }
  }, [])

  useEffect(() => {
    const root = document.body
    const originalText = new WeakMap<Text, string>()
    const lastLocalizedText = new WeakMap<Text, string>()
    const originalAttributes = new WeakMap<Element, Map<string, string>>()
    let translating = false

    const localize = (node: Node) => {
      if (translating || !node.isConnected) return
      translating = true
      const textNodes: Text[] = []
      if (node.nodeType === Node.TEXT_NODE) textNodes.push(node as Text)
      const textWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let textNode: Text | null
      while ((textNode = textWalker.nextNode() as Text | null)) textNodes.push(textNode)
      for (const textNode of textNodes) {
        const parent = textNode.parentElement
        if (!parent || parent.closest(`input, textarea, script, style, [contenteditable="true"], ${protectedContent.join(',')}`)) continue
        const lastLocalized = lastLocalizedText.get(textNode)
        let original = originalText.get(textNode)
        if (original === undefined || (lastLocalized !== undefined && textNode.data !== lastLocalized)) {
          original = textNode.data
          originalText.set(textNode, original)
        }
        const leadingWhitespace = original.match(/^\s*/)?.[0] ?? ''
        const trailingWhitespace = original.match(/\s*$/)?.[0] ?? ''
        const key = original.trim()
        if (!key) continue
        const translated = translateStaticText(key)
        const localizedText = `${leadingWhitespace}${translated}${trailingWhitespace}`
        lastLocalizedText.set(textNode, localizedText)
        if (localizedText !== textNode.data) textNode.data = localizedText
      }

      const elements = node instanceof Element ? [node, ...node.querySelectorAll('*')] : node.parentElement ? [node.parentElement, ...node.parentElement.querySelectorAll('*')] : []
      for (const element of elements) {
        if (element.closest(`[contenteditable="true"], ${protectedContent.join(',')}`)) continue
        let originals = originalAttributes.get(element)
        if (!originals) {
          originals = new Map<string, string>()
          originalAttributes.set(element, originals)
        }
        for (const attribute of localizedAttributes) {
          if (!element.hasAttribute(attribute)) continue
          const source = originals.get(attribute) ?? element.getAttribute(attribute) ?? ''
          originals.set(attribute, source)
          const translated = translateStaticText(source)
          if (translated !== element.getAttribute(attribute)) element.setAttribute(attribute, translated)
        }
      }
      translating = false
    }

    localize(root)
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') localize(record.target)
        else record.addedNodes.forEach(localize)
        if (record.type === 'attributes' && record.target instanceof Element) localize(record.target)
      }
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: localizedAttributes })
    const onLanguageChanged = () => localize(root)
    i18n.on('languageChanged', onLanguageChanged)
    return () => {
      observer.disconnect()
      i18n.off('languageChanged', onLanguageChanged)
    }
  }, [])

  return <>{children}</>
}

export function LanguageSwitcher({ floating = false, bare = false }: { floating?: boolean; bare?: boolean }) {
  const [, setLanguage] = useState(i18n.resolvedLanguage ?? 'en')
  useEffect(() => {
    const handleLanguageChanged = (nextLanguage: string) => setLanguage(nextLanguage)
    i18n.on('languageChanged', handleLanguageChanged)
    return () => { i18n.off('languageChanged', handleLanguageChanged) }
  }, [])
  const language = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en'
  const nextLanguage = language === 'fr' ? 'en' : 'fr'
  return (
    <button
      type="button"
      className={`${floating ? 'fixed right-4 top-4 z-[100]' : ''} inline-flex h-9 w-9 items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${bare ? 'rounded-md bg-transparent p-0 shadow-none hover:bg-transparent' : 'rounded-xl border border-white/15 bg-black/60 shadow-lg hover:bg-white/10'}`}
      aria-label={`${i18n.t('Choose language')}: ${language === 'fr' ? 'Français' : 'English'}. Switch to ${nextLanguage === 'fr' ? 'Français' : 'English'}`}
      title={`Switch to ${nextLanguage === 'fr' ? 'Français' : 'English'}`}
      onClick={() => {
        window.localStorage.setItem('tiketi-language', nextLanguage)
        void i18n.changeLanguage(nextLanguage)
      }}
    >
      <img
        src={`https://flagcdn.com/w40/${language === 'fr' ? 'fr' : 'gb'}.png`}
        alt=""
        aria-hidden="true"
        className="h-5 w-7 rounded-sm border border-white/50 object-cover"
      />
    </button>
  )
}
