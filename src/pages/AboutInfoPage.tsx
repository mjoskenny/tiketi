import { ArrowRightIcon, CheckIcon, SparkleIcon, TicketIcon, UsersIcon } from '../components/Icon'

type Props = { navigate: (page: string) => void }

const impact = [
  ['24/7', 'Events discoverable'],
  ['1 place', 'For every ticket journey'],
  ['Bujumbura', 'Where we begin'],
  ['∞', 'Reasons to gather'],
]

const principles = [
  ['01', 'Keep it clear', 'Simple discovery, honest details, and a ticket people can find when they need it.', TicketIcon],
  ['02', 'Stay local', 'Build for the people and rhythms of the places where the next experience starts.', UsersIcon],
  ['03', 'Make it count', 'Give organizers the confidence to host well and audiences a reason to return.', CheckIcon],
]

const journey = [
  ['01', 'Discover', 'Help the right people find what is happening nearby, with event details they can trust.', 'Find an event', 'events'],
  ['02', 'Experience', 'Make booking simple and keep every ticket ready for the moment guests arrive.', 'View my tickets', 'my-tickets'],
  ['03', 'Grow', 'Give organizers a clearer way to publish, sell, welcome, and build what comes next.', 'For organizers', 'organizers'],
]

export default function AboutInfoPage({ navigate }: Props) {
  return (
    <main className="about-company-page about-studio-page">
      <section className="about-studio-hero">
        <div className="about-studio-shell">
          <div className="about-studio-hero-grid">
            <div className="about-studio-hero-copy">
              <p className="about-studio-eyebrow"><span /> About QPassa</p>
              <h1>Making events feel <em>closer.</em></h1>
              <p>QPassa is building the home for the moments that bring Bujumbura together, from the first discovery to the last song of the night.</p>
              <div className="about-studio-hero-actions">
                <button type="button" onClick={() => navigate('events')}>Explore events <ArrowRightIcon size={16} /></button>
                <button type="button" onClick={() => navigate('auth-organizer')}>Start hosting</button>
              </div>
            </div>

          </div>

          <div className="about-studio-impact-strip">
            {impact.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
          </div>
          <p className="about-studio-hero-footnote">A place to discover, book, and return to what is happening next.</p>
        </div>
      </section>

      <section className="about-studio-mission">
        <div className="about-studio-shell about-studio-mission-grid">
          <div className="about-studio-section-copy">
            <p className="about-studio-section-kicker">Our mission</p>
            <h2>Build the bridge between <em>people and possibility.</em></h2>
            <p>Great events already exist in every city. They should not be difficult to find, trust, or join. QPassa connects audiences with the organizers, artists, venues, and communities making those moments happen.</p>
            <button type="button" onClick={() => navigate('marketing')} className="about-studio-inline-link">Explore the QPassa story <ArrowRightIcon size={15} /></button>
          </div>

          <aside className="about-studio-mission-card">
            <div className="about-studio-mission-card-title"><SparkleIcon size={20} /><span>A connected journey</span></div>
            <p>One connected platform keeps the important parts of an event moving together.</p>
            <div className="about-studio-mission-steps">
              {journey.map(([number, title, copy]) => <div key={title}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}
            </div>
          </aside>
        </div>
      </section>

      <section className="about-studio-principles">
        <div className="about-studio-shell">
          <div className="about-studio-principles-heading">
            <div><p className="about-studio-section-kicker">What guides us</p><h2>Technology with <em>a human pulse.</em></h2></div>
            <p>We want the digital part to disappear when the moment begins.</p>
          </div>

          <div className="about-studio-principle-grid">
            {principles.map(([number, title, copy, Icon]) => {
              const PrincipleIcon = Icon as typeof TicketIcon
              return <article key={title as string}><div className="about-studio-principle-icon"><PrincipleIcon size={21} /></div><span>{number as string}</span><h3>{title as string}</h3><p>{copy as string}</p></article>
            })}
          </div>
        </div>
      </section>

      <section className="about-studio-journey">
        <div className="about-studio-shell">
          <div className="about-studio-journey-intro">
            <p className="about-studio-section-kicker">What QPassa makes possible</p>
            <h2>From first idea <em>to full room.</em></h2>
            <p>One connected platform keeps the important parts of an event moving together.</p>
          </div>

          <div className="about-studio-journey-grid">
            {journey.map(([number, title, copy, action, page], index) => <article className={index === 1 ? 'is-featured' : ''} key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p><button type="button" onClick={() => navigate(page)}>{action} <ArrowRightIcon size={15} /></button></article>)}
          </div>
        </div>
      </section>

      <section className="about-studio-contact">
        <div className="about-studio-shell about-studio-contact-inner">
          <div><p className="about-studio-section-kicker">Get in touch</p><h2>Have an idea worth <em>bringing to life?</em></h2><p>Tell us what you are building, what you want to experience, or where QPassa can help.</p></div>
          <div className="about-studio-contact-actions"><a href="mailto:hello@qpassa.events">hello@qpassa.events <ArrowRightIcon size={16} /></a><button type="button" onClick={() => navigate('auth-organizer')}>Start hosting <ArrowRightIcon size={16} /></button></div>
        </div>
      </section>
    </main>
  )
}
