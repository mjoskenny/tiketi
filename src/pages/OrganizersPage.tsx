import { useEffect, useState } from 'react'
import { ArrowRightIcon, BarChartIcon, CheckIcon, ChevronDownIcon, ClipboardIcon, DollarSignIcon, LinkIcon, QrCodeIcon, TicketIcon, UsersIcon } from '../components/Icon'
import { events } from '../data/events'
import { supabase } from '../lib/supabase'

type Props = { navigate: (page: string) => void }

const heroEvent = events[0]
const formatBif = (value: number) => `BIF ${value.toLocaleString()}`
const DEFAULT_FEE_RATES = { nonConsumable: 5, consumable: 4, table: 5, free: 0 }

const workflow = [
  { number: '01', icon: ClipboardIcon, label: 'Set it up', title: 'Put every important detail in one clear place.', copy: 'Create an event page that answers the questions guests ask before they buy: where, when, what to expect, and which ticket is right for them.', items: ['Your event page and shareable link', 'Ticket tiers, capacity, and event details'], tone: 'sky' },
  { number: '02', icon: DollarSignIcon, label: 'Keep track', title: 'See every sale without chasing spreadsheets.', copy: 'Keep ticket sales, service fees, available balance, and withdrawals understandable from the first sale to the final settlement.', items: ['Sales and balances shown in BIF', 'A simple record of every movement'], tone: 'lilac' },
  { number: '03', icon: QrCodeIcon, label: 'Welcome people', title: 'Give the door team a calmer way to work.', copy: 'Scan tickets, check names, and see attendance build as guests arrive. The guest list stays where your team needs it.', items: ['Fast scan and check-in status', 'Live capacity and guest list visibility'], tone: 'mint' },
]

const faqs = [
  ['How do I create an event?', 'Create an organizer account, add your event details and ticket types, then publish when the page is ready to share.'],
  ['How does QPassa charge organizers?', 'QPassa commission is deducted from organizer proceeds. The rate depends on the ticket type and is shown clearly below.'],
  ['What can I host?', 'Music, nightlife, sports, conferences, culture, comedy, student events, community gatherings, workshops, and other legitimate experiences that meet QPassa policies.'],
  ['Can my team help at the door?', 'Yes. Give your event team access to the tools they need to welcome guests and keep entry moving.'],
]

function StudioPreview() {
  const revenue = formatBif(heroEvent.ticketsSold * heroEvent.price)
  const capacity = Math.round((heroEvent.ticketsSold / heroEvent.capacity) * 100)

  return <div className="organizer-studio-preview" role="img" aria-label="QPassa Studio event dashboard preview">
    <div className="organizer-studio-preview-topbar"><span className="organizer-studio-preview-brand"><TicketIcon size={15} /> QPassa Studio</span><span className="organizer-studio-preview-live"><i /> Event live</span></div>
    <div className="organizer-studio-preview-body">
      <aside className="organizer-studio-preview-nav"><span className="is-current">Overview</span><span>Event details</span><span>Tickets</span><span>Guest list</span><span>Balance</span></aside>
      <div className="organizer-studio-preview-workspace">
        <div className="organizer-studio-preview-heading"><div><p>YOUR EVENT</p><strong>{heroEvent.name}</strong><span>{heroEvent.city} · {heroEvent.date}</span></div><button>Manage event <ArrowRightIcon size={13} /></button></div>
        <div className="organizer-studio-preview-stats"><div><span>Tickets sold</span><b>{heroEvent.ticketsSold.toLocaleString()}</b><small>{`of ${heroEvent.capacity.toLocaleString()} capacity`}</small></div><div><span>Sales value</span><b>{revenue}</b><small>Updated just now</small></div></div>
        <div className="organizer-studio-preview-progress"><div><span>Capacity</span><b>{capacity}%</b></div><i><em style={{ width: `${capacity}%` }} /></i><small>{heroEvent.capacity - heroEvent.ticketsSold} more guests can join</small></div>
      </div>
    </div>
    <div className="organizer-studio-preview-checkin"><QrCodeIcon size={18} /><div><b>Ready at the door</b><span>Guest check-in is switched on</span></div><strong>{heroEvent.ticketsSold.toLocaleString()}</strong></div>
  </div>
}

function FeaturePreview({ type }: { type: 'publish' | 'sales' | 'entry' }) {
  if (type === 'publish') return <div className="organizer-feature-preview organizer-feature-preview-publish"><div className="organizer-feature-preview-top"><span><TicketIcon size={14} /> New event</span><i>Draft</i></div><strong>{heroEvent.name}</strong><small>{heroEvent.venue} · {heroEvent.city}</small><div className="organizer-feature-preview-ticket"><span>Regular</span><b>{formatBif(heroEvent.price)}</b></div><button>Publish event <ArrowRightIcon size={13} /></button></div>
  if (type === 'sales') return <div className="organizer-feature-preview organizer-feature-preview-sales"><span className="organizer-feature-preview-label">AVAILABLE BALANCE</span><strong>BIF 2,480,000</strong><small>From ticket sales</small><div className="organizer-feature-preview-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="organizer-feature-preview-sales-row"><span>Sales this week</span><b>+24.8%</b></div></div>
  return <div className="organizer-feature-preview organizer-feature-preview-entry"><div className="organizer-feature-preview-entry-head"><QrCodeIcon size={23} /><div><strong>Guest list</strong><small>Check-in open</small></div><b>128 / 420</b></div>{['Aline N.', 'Kevin M.', 'Diane K.'].map((guest, index) => <div className="organizer-feature-preview-guest" key={guest}><span>{guest}</span><b>{index === 0 ? 'Checked in' : 'Ready'}</b></div>)}</div>
}

export default function OrganizersPage({ navigate }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [feeRates, setFeeRates] = useState(DEFAULT_FEE_RATES)

  useEffect(() => {
    let active = true
    const loadFeeRates = async () => {
      const { data } = await supabase.rpc('get_public_ticket_fee_settings')
      const settings = Array.isArray(data) ? data[0] : data
      if (!active || !settings) return
      setFeeRates({
        nonConsumable: Number(settings.service_fee_non_consumable_percent ?? DEFAULT_FEE_RATES.nonConsumable),
        consumable: Number(settings.service_fee_consumable_percent ?? DEFAULT_FEE_RATES.consumable),
        table: Number(settings.service_fee_table_percent ?? DEFAULT_FEE_RATES.table),
        free: Number(settings.service_fee_free_percent ?? DEFAULT_FEE_RATES.free),
      })
    }
    void loadFeeRates()
    return () => { active = false }
  }, [])

  return <main className="organizer-launch-page">
    <section className="organizer-launch-hero">
      <div className="organizer-launch-shell organizer-launch-hero-inner">
        <div className="organizer-launch-hero-copy">
          <h1>The simpler way to<br /><em>run your next event.</em></h1>
          <p className="organizer-launch-lede">Event pages, ticket sales, guests, check-in, and settlement in one place. Your team works from the same clear view, from the first announcement to the final scan.</p>
          <div className="organizer-launch-actions"><button onClick={() => navigate('auth-organizer')}>Create an event <ArrowRightIcon size={16} /></button><a href="#event-day">See how it works</a></div>
        </div>
        <StudioPreview />
      </div>
    </section>

    <section className="organizer-launch-intro">
      <div className="organizer-launch-shell organizer-launch-intro-inner"><div className="organizer-launch-intro-copy"><p className="organizer-launch-section-label">A single home for your event</p><h2>Make the admin feel <em>lighter.</em></h2></div><div className="organizer-launch-intro-side"><p>QPassa brings the moving pieces into one clear rhythm, so your energy can stay with the people and the experience you are creating.</p><div className="organizer-launch-intro-points"><span><b>One workspace</b><small>Details, tickets, guests, and sales together.</small></span><span><b>One clear view</b><small>Useful information for each moment of the event.</small></span></div></div></div>
    </section>

    <section className="organizer-launch-workflow organizer-launch-shell">
      {workflow.map((item, index) => {
        const Icon = item.icon
        const preview = index === 0 ? 'publish' : index === 1 ? 'sales' : 'entry'
        const previewOnLeft = index === 0 || index === 2
        return <article className={`organizer-launch-workflow-card is-${item.tone} ${previewOnLeft ? 'is-preview-left' : ''}`} key={item.number}>
          {previewOnLeft && <div className="organizer-launch-workflow-preview"><FeaturePreview type={preview} /></div>}
          <div className="organizer-launch-workflow-copy"><div className="organizer-launch-workflow-top"><span>{item.number}</span><Icon size={20} /></div><p>{item.label}</p><h3>{item.title}</h3><div className="organizer-launch-workflow-preview-mobile"><FeaturePreview type={preview} /></div><p className="organizer-launch-workflow-description">{item.copy}</p><ul>{item.items.map(feature => <li key={feature}><CheckIcon size={15} />{feature}</li>)}</ul></div>
          {!previewOnLeft && <div className="organizer-launch-workflow-preview"><FeaturePreview type={preview} /></div>}
        </article>
      })}
    </section>

    <section className="organizer-launch-connection">
      <div className="organizer-launch-shell"><div className="organizer-launch-connection-heading"><div><p className="organizer-launch-section-label">The work after a good night</p><h2>Make the next <em>yes</em> easier.</h2></div><p>A great event should not vanish the moment the last guest leaves. Keep your work easy to find, your details clear, and the next idea ready to share.</p></div><div className="organizer-launch-connection-grid"><article className="organizer-launch-connection-feature"><span className="organizer-launch-connection-number">01</span><LinkIcon size={22} /><h3>Give your events a familiar home.</h3><p>Use a clear event link every time you share a plan on WhatsApp, Instagram, or with partners. Guests know where to find the details they need.</p><div className="organizer-launch-link-sample"><i /> qpassa.events/your-event <ArrowRightIcon size={13} /></div></article><article className="organizer-launch-connection-feature is-featured"><span className="organizer-launch-connection-number">02</span><UsersIcon size={22} /><h3>Build trust before the first guest arrives.</h3><p>Strong event pages make it easy to understand the essential details before people commit: the experience, place, time, ticket, and host.</p><div className="organizer-launch-detail-tags"><span>Venue</span><span>Time</span><span>Tickets</span><span>Policies</span></div></article><article className="organizer-launch-connection-feature"><span className="organizer-launch-connection-number">03</span><BarChartIcon size={22} /><h3>Take useful learning into the next plan.</h3><p>Use your sales and attendance view to understand what worked, then take that clarity into the next event you bring to life.</p><div className="organizer-launch-signal"><b>Sales</b><i><em /></i><span>Clearer signals, better planning.</span></div></article></div></div>
    </section>

    <section id="event-day" className="organizer-launch-event-day">
      <div className="organizer-launch-shell"><div className="organizer-launch-event-day-heading"><p className="organizer-launch-section-label">When the date is close</p><h2>A calmer way to run <em>event day.</em></h2><p>Keep the people, details, and decisions your team needs in view — from the last check before doors open to the final guest scan.</p></div><div className="organizer-launch-event-day-grid"><article><span>Before doors open</span><h3>Make the page ready to share.</h3><p>Check the event details, ticket choices, venue, and door plan before your audience starts arriving.</p><ul><li><CheckIcon size={14} />Review event details</li><li><CheckIcon size={14} />Confirm ticket types</li></ul></article><article><span>When the room fills</span><h3>Keep entry moving.</h3><p>Give the welcome team a simple scan flow and a guest list that stays close at the door.</p><ul><li><CheckIcon size={14} />Scan tickets quickly</li><li><CheckIcon size={14} />See guest status live</li></ul></article><article><span>When it is over</span><h3>Leave with a better read.</h3><p>Sales and attendance are kept in one place, ready to inform the next call you make.</p><ul><li><CheckIcon size={14} />Review ticket sales</li><li><CheckIcon size={14} />Track event attendance</li></ul></article></div></div>
    </section>

    <section id="pricing" className="organizer-launch-pricing">
      <div className="organizer-launch-shell"><div className="organizer-launch-pricing-heading"><div><p className="organizer-launch-section-label">Simple pricing</p><h2>Clear from <em>the first sale.</em></h2></div><p>Commission is deducted from organizer proceeds, not added to a guest&apos;s ticket checkout total.</p></div><div className="organizer-launch-price-grid">{[
        { title: 'Standard tickets', description: 'Regular admission, VIP, and other non-consumable tiers', rate: feeRates.nonConsumable, icon: TicketIcon },
        { title: 'Tables & groups', description: 'Tickets that issue multiple admissions per purchase', rate: feeRates.table, icon: UsersIcon },
        { title: 'Venue credit', description: 'Tickets redeemed for food, drinks, or other credit', rate: feeRates.consumable, icon: DollarSignIcon },
        { title: 'Free entry', description: 'Free tiers have no ticket value, so commission is zero', rate: feeRates.free, icon: CheckIcon },
      ].map((item, index) => { const Icon = item.icon; return <article className={index === 0 ? 'is-featured' : ''} key={item.title}><Icon size={19} /><span>{item.title}</span><p>{item.description}</p><strong>{item.rate}% <small>commission</small></strong></article> })}</div><div className="organizer-launch-includes"><p>Every organizer account includes</p><span>Event pages</span><i /> <span>Ticket scanning</span><i /> <span>Sales tracking</span><i /> <span>Guest management</span></div></div>
    </section>

    <section className="organizer-launch-faq organizer-launch-shell"><div><p className="organizer-launch-section-label">Questions</p><h2>Everything you need <em>to know.</em></h2></div><div className="organizer-launch-faq-list">{faqs.map(([question, answer], index) => <article className={openFaq === index ? 'is-open' : ''} key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)}><span><small>0{index + 1}</small>{question}</span><ChevronDownIcon size={18} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

    <section className="organizer-launch-final"><div className="organizer-launch-shell organizer-launch-final-inner"><div className="organizer-launch-final-copy"><p className="organizer-launch-section-label">Ready when the idea is</p><h2>Turn a good plan into <em>a date people save.</em></h2><p>Create the page, shape the ticket journey, invite your crowd, and give your team a calmer way to run the room.</p><button onClick={() => navigate('auth-organizer')}>Create your event <ArrowRightIcon size={16} /></button></div><div className="organizer-launch-final-plan"><p>Your QPassa launch pad</p><div><span>01</span><b>Create your organizer space</b><small>Start with the people behind the event.</small></div><div><span>02</span><b>Shape the experience</b><small>Add the details and ticket choices guests need.</small></div><div><span>03</span><b>Share, sell, and welcome</b><small>Bring the right people all the way to the door.</small></div></div></div></section>
  </main>
}
