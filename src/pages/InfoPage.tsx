import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, MailIcon, MapPinIcon, ShieldIcon } from '../components/Icon'

export type InfoPageKind = 'help' | 'contact' | 'terms' | 'privacy' | 'refunds'
type Props = { kind: InfoPageKind; navigate: (page: string) => void }

type PageContent = {
  eyebrow: string
  title: string
  intro: string
  sections: { heading: string; body: string; bullets?: string[] }[]
}

const content: Record<InfoPageKind, PageContent> = {
  help: {
    eyebrow: 'Support / Help Center',
    title: 'Clear answers when you need them.',
    intro: 'Everything you need to know about finding events, buying tickets, managing your account, and hosting on Tiketi.',
    sections: [
      { heading: 'Buying a ticket', body: 'Choose an event, select the ticket type that fits your plans, and continue through checkout. Once the payment clears, your tickets will appear in My Tickets and can be used whenever you are ready to attend.', bullets: ['Double-check the date, venue, and ticket type before paying.', 'Keep your confirmation ready when you arrive at the event.', 'If you need help with a specific event, contact the organizer listed on the event page.'] },
      { heading: 'Managing your tickets', body: 'Sign in to view upcoming and past tickets. Your purchase history is linked to the account used during checkout, so it is best to keep the same email and login details for your account.', bullets: ['View your active tickets in My Tickets.', 'Keep your QR code or confirmation available on your phone.', 'Contact support if a ticket is missing or incorrect.'] },
      { heading: 'For organizers', body: 'Organizer accounts can publish events, create ticket tiers, track sales, and manage guest check-in. Start from your dashboard and build your event listing in a few simple steps.', bullets: ['Create your event page with clear details and pricing.', 'Add the correct venue, date, and ticket options.', 'Use the organizer tools to monitor sales and guest check-in.'] },
      { heading: 'Account and sign-in help', body: 'If you are having trouble signing in, check that you are using the same email you registered with. You can also use the password reset option if needed. Never share your login details with anyone else.', bullets: ['Use the email connected to the account you created.', 'Keep your password private and unique.', 'Contact Tiketi if you suspect an account or payment issue.'] },
      { heading: 'Changes and event updates', body: 'If an event listing seems inaccurate, unsafe, or different from what was advertised, contact the organizer or reach out to Tiketi with the event link and a short description of the issue. For urgent venue or schedule concerns, the organizer is usually the fastest point of contact.', bullets: ['Verify the event details before buying tickets.', 'Check the organizer profile for official updates.', 'Report anything misleading or suspicious.'] },
      { heading: 'Still need help?', body: 'Send us a note with your event name, account email, and the issue you are facing. We will help route it to the right person as quickly as possible.', bullets: ['Include your order number if you have one.', 'Share the event name and account email.', 'Add a brief description of the problem.'] },
    ],
  },
  contact: {
    eyebrow: 'Support / Contact Us',
    title: 'We are here to help.',
    intro: 'Whether you are attending your first event or building your next one, our team is ready to help with the next step.',
    sections: [
      { heading: 'General support', body: 'For account, ticket, or platform questions, send us a message with a clear description of what happened and the event or account involved.', bullets: ['Email: hello@tiketi.events', 'Typical response time: 24-48 business hours', 'Location: Bujumbura, Burundi'] },
      { heading: 'Questions about an event', body: 'For schedule changes, venue details, lineup updates, or event-specific concerns, the organizer often has the most current information. Their contact details are usually shown on the event page.', bullets: ['Check the organizer profile for direct details.', 'Look for venue updates before arrival.', 'Reach out to the organizer for event-specific help.'] },
      { heading: 'Organizer partnerships', body: 'If you are planning an event and want to reach more attendees through Tiketi, tell us about your event, your audience, and how you would like to grow. We are happy to talk through the setup.', bullets: ['Share your event concept and date range.', 'Tell us what kind of audience you want to reach.', 'Mention whether you need support with ticketing or promotion.'] },
      { heading: 'Report a safety or platform issue', body: 'If you see suspicious activity, impersonation, unsafe listings, or a platform issue, contact us with the relevant event or profile link and as much detail as possible. Do not send passwords or payment credentials.', bullets: ['Include the event or user link.', 'Explain what happened and when.', 'Keep sensitive credentials private.'] },
      { heading: 'Press and community', body: 'For media, partnerships, community collaborations, and local storytelling, email hello@tiketi.events with a short introduction and the kind of collaboration you are interested in.', bullets: ['Share a brief description of your idea.', 'Mention your organization or community.', 'Let us know the best contact method for follow-up.'] },
    ],
  },
  terms: {
    eyebrow: 'Legal / Terms of Service',
    title: 'The rules that keep Tiketi fair and reliable.',
    intro: 'These terms explain the responsibilities of Tiketi users, organizers, and attendees when using the platform. By using Tiketi, you agree to follow them.',
    sections: [
      { heading: 'Acceptance and eligibility', body: 'By accessing Tiketi, you confirm that you can legally enter into this agreement under the laws that apply to you. Anyone under the age required to make purchases in their jurisdiction should use Tiketi with the permission of a parent or legal guardian.', bullets: ['Use Tiketi only in a lawful way.', 'Respect local laws and venue rules.', 'Keep your account information accurate.'] },
      { heading: 'Accounts and responsibilities', body: 'Some features require an account. You are responsible for keeping your login details secure and for all activity performed through your account. Please notify Tiketi if you believe your account has been used without permission.', bullets: ['Keep your password and verification details private.', 'Use accurate profile information.', 'Report security concerns immediately.'] },
      { heading: 'Events and organizer content', body: 'Organizers are responsible for the accuracy of event listings, ticket inventory, venue details, pricing, entry rules, and refund policies. Tiketi may review, restrict, or remove listings if they are misleading, unsafe, unlawful, or inconsistent with platform standards.', bullets: ['Organizers should publish accurate event details.', 'Venue and pricing must match the listing.', 'Misleading or unsafe events may be removed.'] },
      { heading: 'Tickets, payments, and entry', body: 'A ticket purchase is subject to the event-specific terms shown at checkout. Payment processing may involve third-party providers. A confirmed ticket does not guarantee entry if the attendee violates venue rules, provides incorrect information, or arrives after the event cutoff.', bullets: ['Review the event details before purchasing.', 'Keep your ticket confirmation with you.', 'Follow the venue and event entry rules.'] },
      { heading: 'Prohibited activities', body: 'Do not scalp or fraudulently resell tickets, impersonate another person, create fake listings, upload unlawful content, bypass platform protections, or use Tiketi to harm others or interfere with the service.', bullets: ['No fake or misleading listings.', 'No fraud, impersonation, or abuse.', 'No attempts to bypass security or ticket controls.'] },
      { heading: 'Content and intellectual property', body: 'You keep ownership of content you submit, but you grant Tiketi the right to display and operate that content as needed to provide the service. Tiketi’s software, branding, design, and platform assets remain the property of Tiketi or its licensors unless otherwise stated.', bullets: ['Do not copy platform branding or code.', 'Respect other users’ intellectual property.', 'Only upload content you are allowed to share.'] },
      { heading: 'Third-party services', body: 'Payments, authentication, notifications, maps, and other services may be provided by third parties. Their own terms and privacy policies may apply, and Tiketi is not responsible for independent third-party services beyond what is reasonably within our control.', bullets: ['Third-party providers may process your data.', 'Their terms may differ from Tiketi’s rules.', 'Use caution when interacting with external services.'] },
      { heading: 'Suspension and termination', body: 'We may suspend or close an account, event listing, or access to Tiketi if there is a serious breach of these terms, a legal obligation, a security concern, or activity that jeopardizes the safety of the community.', bullets: ['Accounts can be restricted for violations.', 'Misleading or unsafe listings may be removed.', 'Security risks may trigger account action.'] },
      { heading: 'Availability and liability', body: 'Tiketi works to keep the platform available and reliable, but outages, bugs, or third-party issues can still occur. To the fullest extent permitted by law, Tiketi is not responsible for indirect losses, event cancellations, venue decisions, or actions taken by organizers or other users.', bullets: ['Tiketi is not a guarantor of every event outcome.', 'Service quality may vary by location and provider.', 'Users remain responsible for their own decisions.'] },
      { heading: 'Changes and contact', body: 'Tiketi may update these terms over time. Continued use after changes means you accept the revised terms. If you have questions, contact hello@tiketi.events.', bullets: ['Check these terms regularly.', 'Use the latest version when in doubt.', 'Contact support for clarification.'] },
    ],
  },
  privacy: {
    eyebrow: 'Legal / Privacy',
    title: 'Your information stays protected.',
    intro: 'This page explains how Tiketi handles the information involved in discovery, ticketing, support, and account management so you understand what we use and why.',
    sections: [
      { heading: 'Information you provide', body: 'This may include your name, email address, phone number, profile details, organizer information, event content, ticket details, support messages, and preferences you choose to share.', bullets: ['Account creation requires basic personal details.', 'Event listings can include organizer and venue information.', 'Support messages may include transaction or event details.'] },
      { heading: 'Information we collect automatically', body: 'When you use Tiketi, we may receive device and connection information such as browser type, approximate location data, pages viewed, dates and times, diagnostic information, and security signals used to protect the platform.', bullets: ['We use this to improve the service.', 'This helps with troubleshooting and fraud prevention.', 'It supports performance and reliability monitoring.'] },
      { heading: 'How we use information', body: 'We use information to create and secure accounts, process purchases, deliver tickets, show event information, support organizers, send service notifications, prevent fraud, understand usage, and improve the platform.', bullets: ['To keep accounts and transactions secure.', 'To show relevant event and profile information.', 'To improve user experience and support quality.'] },
      { heading: 'Event and organizer sharing', body: 'When you buy a ticket, we may share the information needed for the organizer and venue to manage attendance, check-in, and event operations. Public profile and event information may be visible to other Tiketi users.', bullets: ['Ticket holders may be identified for check-in.', 'Public profiles can be visible to other users.', 'Event information is part of the discovery experience.'] },
      { heading: 'Service providers and payments', body: 'Trusted providers may process information for hosting, authentication, payments, communications, analytics, storage, and security. They are expected to use that information only to provide services to Tiketi and as required by law.', bullets: ['Some processing is done by external providers.', 'We use providers only where needed for operations.', 'Their own policies may apply in specific cases.'] },
      { heading: 'Cookies and local storage', body: 'Tiketi may use cookies, local storage, and similar technologies to keep sessions working, remember preferences, protect accounts, understand performance, and support features like favorites or saved settings.', bullets: ['Essential cookies support the platform.', 'Preferences may be remembered for convenience.', 'Your browser settings can manage cookie behavior.'] },
      { heading: 'Retention and security', body: 'We keep information only as long as reasonably needed for the purposes described here, legal obligations, dispute resolution, and security. We use reasonable safeguards, but no online transmission or storage system can be guaranteed completely secure.', bullets: ['We retain some data for operational and legal reasons.', 'Security best practices are applied where feasible.', 'No system is risk-free, but we take precautions seriously.'] },
      { heading: 'Your choices and deletion requests', body: 'You may request access to, correction of, or deletion of your personal information by contacting hello@tiketi.events. Some records may need to remain for legal, payment, fraud-prevention, or accounting reasons.', bullets: ['You may ask to review or correct your account data.', 'Some records may be retained for compliance reasons.', 'We will respond to valid requests as appropriate.'] },
      { heading: 'Children and third-party links', body: 'Tiketi is not intended for children who cannot lawfully use ticketing services. We do not knowingly collect unnecessary personal information from children. Links to other websites are governed by those websites’ privacy practices.', bullets: ['We do not target minors inappropriately.', 'External links are outside our control.', 'Third-party sites may have different rules.'] },
      { heading: 'Legal disclosures and changes', body: 'We may disclose information when required by law, legal process, or to protect users, property, and the service. We may update this privacy policy and will publish the new version with an updated date.', bullets: ['We may share data to comply with legal obligations.', 'We may update this policy when needed.', 'Continued use means acceptance of the revised version.'] },
    ],
  },
  refunds: {
    eyebrow: 'Support / Refunds',
    title: 'Simple, fair, and clear refund support.',
    intro: 'Refund eligibility depends on the event policy shown before checkout and on any changes made by the organizer or Tiketi after purchase.',
    sections: [
      { heading: 'Before you buy', body: 'Review the refund policy displayed on the event page before completing checkout. Organizers set event-specific policy, including whether tickets are refundable, exchangeable, or non-refundable.', bullets: ['Read the event policy before paying.', 'Check the venue and schedule before committing.', 'Look for terms that apply to your ticket type.'] },
      { heading: 'If an event changes', body: 'If an event is cancelled, postponed, or materially changed, Tiketi and the organizer will communicate the next steps as soon as they are confirmed. This may include a refund, transfer, or replacement option.', bullets: ['We will notify affected ticket holders when possible.', 'Organizers may offer alternative arrangements.', 'You may need to follow the event’s final policy.'] },
      { heading: 'How to request help', body: 'Email hello@tiketi.events with your order details, event name, and reason for your request. We may ask for proof of purchase to protect the account and the event organizer.', bullets: ['Include the order or ticket reference if available.', 'Share the event name and a brief explanation.', 'Keep your purchase details ready.'] },
      { heading: 'Processing time', body: 'Approved refunds are sent through the original payment method whenever possible. Processing times depend on the payment provider and may take several business days to complete.', bullets: ['Refund timing depends on the payment provider.', 'Some repayments may take longer than others.', 'Check your account or payment channel for updates.'] },
      { heading: 'What may not be refundable', body: 'Tickets may not be refundable if the event policy says so, if the event has already started, if the buyer breaks event rules, or if the request does not match the original booking details.', bullets: ['Venue rules may affect entry and refund eligibility.', 'Events with strict policies may be non-refundable.', 'Requests must match the original ticket record.'] },
      { heading: 'Organizer responsibility', body: 'Because organizers control event details and policies, some refund decisions must be resolved directly with them. Tiketi can help route the request and explain what is visible at checkout.', bullets: ['Organizers may set their own terms.', 'Tiketi can help confirm your request path.', 'Support may need organizer confirmation on some cases.'] },
    ],
  },
}

export default function InfoPage({ kind, navigate }: Props) {
  const page = content[kind]
  const isLegal = kind === 'terms' || kind === 'privacy'

  return (
    <main className="info-page">
      <section className="info-hero">
        <div className="info-hero-inner">
          <button onClick={() => navigate('home')} className="info-back"><ArrowLeftIcon size={16} /> Back to Tiketi</button>
          <p className="info-eyebrow"><span /> {page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.intro}</p>
          <small>Last updated: 10 September 2026</small>
        </div>
        <div className="info-hero-mark" aria-hidden="true">{isLegal ? <ShieldIcon size={42} /> : <CheckIcon size={42} />}</div>
      </section>

      <section className="info-content">
        <div className="info-content-main">{page.sections.map((section, index) => <article className="info-section" key={section.heading}><span className="info-section-number">{String(index + 1).padStart(2, '0')}</span><div><h2>{section.heading}</h2><p>{section.body}</p>{section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}><CheckIcon size={14} />{bullet}</li>)}</ul>}</div></article>)}</div>
        <aside className="info-aside"><div className="info-aside-card"><MailIcon size={20} /><strong>Need a person?</strong><p>Our support team is ready to help with your next question.</p><a href="mailto:hello@tiketi.events">Email Tiketi <ArrowRightIcon size={14} /></a></div><div className="info-aside-meta"><span><MapPinIcon size={14} /> Bujumbura, Burundi</span><span>We reply within 24-48 hours</span></div></aside>
      </section>
    </main>
  )
}
