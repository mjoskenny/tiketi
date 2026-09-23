import { useEffect, useState } from 'react'
import { ArrowRightIcon, BellIcon, CalendarIcon, CheckIcon, ChevronDownIcon, HeartIcon, MapPinIcon, SearchIcon, SparkleIcon, TicketIcon, UsersIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import { supabase } from '../lib/supabase'
import type { Event } from '../lib/types'

type Props = { navigate: (page: string, extra?: unknown) => void }

type Faq = { question: string; answer: string }

const faqs: Faq[] = [
  { question: 'What is Tiketi?', answer: 'Tiketi is a simple home for discovering events, buying tickets, and helping organizers bring their next experience to life.' },
  { question: 'Who can create an event?', answer: 'Anyone with an idea, gathering, concert, conference, or community experience can create an organizer account and start publishing.' },
  { question: 'How do I get my ticket?', answer: 'Choose an event, select your ticket, and complete checkout. Your ticket stays available in My Tickets after purchase.' },
  { question: 'Where is Tiketi available?', answer: 'Tiketi is built for Burundi first, with a growing community of organizers and attendees across the region.' },
  { question: 'Can I get help with an event?', answer: 'Yes. Reach out through the support details below and our team will help you find the right next step.' },
]

const principles = [
  { number: '01', title: 'Make it feel close', copy: 'The best events are the ones that feel like they belong to the people around them. Tiketi helps local experiences get discovered.' },
  { number: '02', title: 'Keep it simple', copy: 'From the first tap to the ticket at the door, every part of the journey should feel clear, quick, and human.' },
  { number: '03', title: 'Grow together', copy: 'Organizers, artists, venues, and audiences are stronger when the same platform helps everyone move forward.' },
]

const productSteps = [
  { number: '01', label: 'DISCOVER', title: 'Find what is happening near you', copy: 'Browse concerts, parties, culture, sports, and the small moments worth leaving home for.', tone: 'orange', action: 'Discover events', page: 'events' },
  { number: '02', label: 'FOLLOW', title: 'Never miss the ones you care about', copy: 'Follow organizers and experiences that feel like you. Tiketi keeps the signal close.', tone: 'lime', action: 'See your favorites', page: 'favorites' },
  { number: '03', label: 'BOOK', title: 'Book in seconds', copy: 'Choose your ticket, check out simply, and keep the confirmation right where you need it.', tone: 'blue', action: 'Browse tickets', page: 'events' },
  { number: '04', label: 'WALK IN', title: 'Straight through the door', copy: 'Your tickets stay together in one place, ready when the night begins.', tone: 'violet', action: 'View my tickets', page: 'my-tickets' },
]

function PhoneMockup({ variant }: { variant: number }) {
  return <div className={`about-phone about-phone-${variant}`}><div className="about-phone-speaker" /><div className="about-phone-screen">{variant === 0 && <><div className="about-phone-top"><b>Explore</b><SearchIcon size={13} /></div><div className="about-phone-search">Search events near you</div><div className="about-phone-filter"><span>Tonight</span><span>Music</span><span>Free</span></div><div className="about-phone-event"><span className="about-phone-event-image" /><b>Summer live sessions</b><small>Sat, 18 Jul · Bujumbura</small></div><div className="about-phone-event short"><span className="about-phone-event-image" /><b>Open air culture</b><small>Sun, 19 Jul · Bujumbura</small></div></>}{variant === 1 && <><div className="about-phone-top"><b>Following</b><BellIcon size={13} /></div><div className="about-phone-alert"><HeartIcon size={14} /><span><b>New from Kora Live</b><small>Tickets just went on sale</small></span></div><div className="about-phone-alert muted"><CalendarIcon size={14} /><span><b>Tonight in Bujumbura</b><small>3 events match your taste</small></span></div></>}{variant === 2 && <><div className="about-phone-top"><b>Get tickets</b><TicketIcon size={13} /></div><div className="about-phone-ticket"><b>Summer live sessions</b><small>General admission</small><strong>25,000 BIF</strong><button>Continue</button></div></>}{variant === 3 && <><div className="about-phone-top"><b>My tickets</b><TicketIcon size={13} /></div><div className="about-phone-pass"><TicketIcon size={22} /><b>SUMMER LIVE</b><small>Today · Gate A</small><span>READY TO SCAN</span></div></>}</div></div>
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="about-metric"><strong>{value}</strong><span>{label}</span></div>
}

export default function AboutPage({ navigate }: Props) {
  const [openFaq, setOpenFaq] = useState(0)
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([])
  const [featuredLoading, setFeaturedLoading] = useState(true)

  const hasEnded = (event: Event) => {
    const timestamp = new Date(`${event.date}T${event.time || '00:00'}`).getTime()
    return Number.isFinite(timestamp) && timestamp < Date.now()
  }

  useEffect(() => {
    const loadFeaturedEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))')
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(6)
      setFeaturedEvents(((data as Event[]) ?? []).filter(event => !hasEnded(event)))
      setFeaturedLoading(false)
    }

    void loadFeaturedEvents()
  }, [])

  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-hero-glow" aria-hidden="true" />
        <div className="about-hero-inner">
          <p className="about-eyebrow"><span /> The trusted ticketing platform for Burundi&apos;s live culture</p>
          <h1>Moments worth<br /><em>showing up for.</em></h1>
          <p className="about-hero-copy">Tiketi helps people discover local experiences and gives organizers a simple, trusted way to sell tickets and bring communities together.</p>
          <div className="about-hero-actions">
            <button onClick={() => navigate('home')} className="about-primary-button">Discover events <ArrowRightIcon size={16} /></button>
            <button onClick={() => navigate('auth-organizer')} className="about-text-button">Host an event <ArrowRightIcon size={15} /></button>
          </div>
          <div className="about-hero-note"><span className="about-avatar-stack"><i /><i /><i /></span><span>Built for the people, artists, and communities shaping the city.</span></div>
        </div>
        <div className="about-hero-art" aria-hidden="true"><div className="about-art-ring about-art-ring-one" /><div className="about-art-ring about-art-ring-two" /><div className="about-art-ticket"><TicketIcon size={38} /><b>LIVE</b><small>MAKE A MEMORY</small></div><span className="about-art-dot about-art-dot-one" /><span className="about-art-dot about-art-dot-two" /></div>
      </section>

      <section className="about-featured about-section-shell">
        <div className="about-featured-heading"><div><div className="about-section-label">Featured events</div><h2>What is happening<br /><span>right now.</span></h2></div></div>
        {featuredLoading ? <div className="about-featured-row">{[1, 2, 3].map(item => <div className="about-featured-skeleton" key={item} />)}</div> : featuredEvents.length > 0 ? <div className="about-featured-row">{featuredEvents.map(event => <EventCard key={event.id} event={event} poster fullWidthMobile onClick={() => navigate('event-detail', event)} />)}</div> : <div className="about-featured-empty"><TicketIcon size={20} /><span>New experiences are coming soon.</span></div>}
        <div className="about-featured-action"><button onClick={() => navigate('home')} className="about-glass-button">Browse all events <ArrowRightIcon size={15} /></button></div>
      </section>

      <section className="about-story about-section-shell">
        <div className="about-section-label">01 / Why Tiketi</div>
        <div className="about-story-intro"><div><h2>Less searching.<br /><span>More showing up.</span></h2><p>There is always something happening. Tiketi makes the good stuff easier to find, trust, and be part of.</p></div><div className="about-story-stamp"><span>BUILT<br />FOR<br /><b>THE MOMENT</b></span><ArrowRightIcon size={17} /></div></div>
        <div className="about-story-grid"><div className="about-story-visual"><div className="about-story-card about-story-card-main"><span>TONIGHT</span><strong>Find your<br />next thing.</strong><small>Music · Culture · Community</small></div><div className="about-story-card about-story-card-small"><MapPinIcon size={15} /><span>Bujumbura<br /><b>is alive</b></span></div><div className="about-story-line" /></div><div className="about-story-copy"><p>From a room full of ideas to a night of music, events are how a city keeps its pulse. But discovery should not feel like work.</p><p>Tiketi brings discovery, booking, and the ticket at the door into one clear journey, while giving the people behind each experience the confidence to host brilliantly.</p></div></div>
        <div className="about-story-action"><button onClick={() => navigate('home')} className="about-glass-button">See what is happening <ArrowRightIcon size={15} /></button></div>
      </section>

      <section className="about-impact about-section-shell">
        <div className="about-impact-heading"><div><div className="about-section-label">02 / Our impact</div><h2>More people in<br /><span>the room.</span></h2></div><div className="about-impact-copy"><p>Every organizer who launches and every attendee who shows up helps build a more connected creative community.</p><span className="about-impact-rule" /></div></div>
        <div className="about-metrics"><Metric value="24/7" label="Discoverable events" /><Metric value="1 place" label="For every ticket journey" /><Metric value="100%" label="Built around people" /><Metric value="∞" label="Reasons to show up" /></div>
        <div className="about-impact-foot"><span>Discover</span><i /><span>Book</span><i /><span>Experience</span><i /><span>Repeat</span></div>
      </section>

      <section className="about-product about-section-shell">
        <div className="about-section-label">02 / From discovery to the door</div>
        <div className="about-product-heading"><h2>Everything you need,<br /><span>in your pocket.</span></h2><p>Tiketi keeps the whole event journey feeling light. Explore what is on, follow what matters, book when you are ready, and arrive with confidence.</p></div>
        <div className="about-product-steps">{productSteps.map((step, index) => <article className={`about-product-step about-product-step-${step.tone}`} key={step.number}><div className="about-product-copy"><span className="about-step-number">{step.number} · {step.label}</span><h3>{step.title}</h3><p>{step.copy}</p><button onClick={() => navigate(step.page)} className="about-product-action">{step.action} <ArrowRightIcon size={15} /></button></div><PhoneMockup variant={index} /></article>)}</div>
      </section>

      <section className="about-principles about-section-shell"><div className="about-section-label">03 / What we believe</div><div className="about-principles-heading"><h2>Technology with<br /><span>a human pulse.</span></h2><p>We are not trying to make events feel more digital. We are making the digital part disappear, so the moment can take over.</p></div><div className="about-principles-grid">{principles.map(principle => <article key={principle.number}><span>{principle.number}</span><h3>{principle.title}</h3><p>{principle.copy}</p></article>)}</div></section>

      <section className="about-organizers about-section-shell"><div className="about-organizer-card"><div><p className="about-eyebrow"><SparkleIcon size={14} /> For organizers</p><h2>Your event deserves<br /><span>a full house.</span></h2><p>Publish in minutes, sell tickets with confidence, and keep your attention where it belongs: on creating a great experience.</p><button onClick={() => navigate('auth-organizer')} className="about-primary-button">Start hosting <ArrowRightIcon size={16} /></button></div><div className="about-organizer-orbit"><div><CalendarIcon size={23} /><span>Plan</span></div><div><TicketIcon size={23} /><span>Sell</span></div><div><UsersIcon size={23} /><span>Grow</span></div></div></div></section>

      <section className="about-pricing about-section-shell"><div className="about-section-label">04 / Simple pricing</div><div className="about-pricing-heading"><h2>Clear from the<br /><span>first ticket.</span></h2><p>No hidden surprises. We keep the tools accessible so more of your energy can go into the event.</p></div><div className="about-price-grid"><article><span>Discover</span><strong>Free</strong><p>Find events and keep your tickets in one place.</p><button onClick={() => navigate('events')}>Browse events <ArrowRightIcon size={15} /></button></article><article className="about-price-featured"><span>Host</span><strong>Built to grow</strong><p>Tools for organizers to publish, sell, scan, and understand their audience.</p><button onClick={() => navigate('auth-organizer')}>Become an organizer <ArrowRightIcon size={15} /></button></article></div></section>

      <section className="about-faq about-section-shell"><div className="about-section-label">05 / Questions</div><div className="about-faq-grid"><div><h2>Good to<br /><span>know.</span></h2><p>Still curious? We are happy to help you find your way around Tiketi.</p></div><div className="about-faq-list">{faqs.map((faq, index) => <div className={`about-faq-item ${openFaq === index ? 'is-open' : ''}`} key={faq.question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>{faq.question}</span><ChevronDownIcon size={18} /></button>{openFaq === index && <p>{faq.answer}</p>}</div>)}</div></div></section>

      <section className="about-contact about-section-shell"><div className="about-contact-inner"><div className="about-section-label">06 / Get in touch</div><h2>Have something<br /><span>in mind?</span></h2><p>Whether you are planning your first event or looking for the next one to attend, we would love to hear from you.</p><a href="mailto:hello@tiketi.events" className="about-email">hello@tiketi.events <ArrowRightIcon size={17} /></a></div></section>
    </main>
  )
}
