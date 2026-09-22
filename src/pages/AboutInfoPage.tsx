import { ArrowRightIcon, CheckIcon, MapPinIcon, SparkleIcon, TicketIcon, UsersIcon } from '../components/Icon'

type Props = { navigate: (page: string) => void }

export default function AboutInfoPage({ navigate }: Props) {
  return (
    <main className="about-company-page">
      <section className="about-company-hero">
        <div className="about-company-hero-inner">
          <button onClick={() => navigate('home')} className="about-company-back">Back to Tiketi</button>
          <p className="about-company-eyebrow"><span /> About Tiketi</p>
          <h1>Making events feel <em>closer.</em></h1>
          <p>Tiketi is building the home for the moments that bring Bujumbura together, from the first discovery to the last song of the night.</p>
        </div>
        <div className="about-company-hero-mark" aria-hidden="true"><SparkleIcon size={40} /><span>BUILT<br /><b>FOR THE<br />MOMENT</b></span></div>
      </section>

      <section className="about-company-mission about-company-shell"><div className="about-company-section-label">01 / Our mission</div><div className="about-company-mission-grid"><div><h2>Build the bridge between <em>people and possibility.</em></h2><p>Great events already exist in every city. They should not be difficult to find, trust, or join. Tiketi connects audiences with the organizers, artists, venues, and communities making those moments happen.</p><button onClick={() => navigate('marketing')} className="about-company-link">Explore the Tiketi story <ArrowRightIcon size={15} /></button></div></div></section>

      <section className="about-company-impact"><div className="about-company-shell"><div className="about-company-section-label">02 / Our impact</div><div className="about-company-impact-heading"><h2>More reasons<br /><em>to show up.</em></h2><p>We measure success in fuller rooms, smoother arrivals, and more local ideas getting their moment.</p></div><div className="about-company-metrics"><div><strong>24/7</strong><span>Events discoverable</span></div><div><strong>1 place</strong><span>For every ticket journey</span></div><div><strong>Bujumbura</strong><span>Where we begin</span></div><div><strong>∞</strong><span>Reasons to gather</span></div></div></div></section>

      <section className="about-company-values about-company-shell"><div className="about-company-section-label">03 / What guides us</div><div className="about-company-values-heading"><h2>Technology with<br /><em>a human pulse.</em></h2><p>We want the digital part to disappear when the moment begins.</p></div><div className="about-company-value-grid"><article><TicketIcon size={22} /><span>01</span><h3>Keep it clear</h3><p>Simple discovery, honest details, and a ticket people can find when they need it.</p></article><article><UsersIcon size={22} /><span>02</span><h3>Stay local</h3><p>Build for the people and rhythms of the places where the next experience starts.</p></article><article><CheckIcon size={22} /><span>03</span><h3>Make it count</h3><p>Give organizers the confidence to host well and audiences a reason to return.</p></article></div></section>

      <section className="about-company-offer about-company-shell"><div className="about-company-section-label">04 / What Tiketi makes possible</div><div className="about-company-offer-heading"><h2>From first idea<br /><em>to full room.</em></h2><p>One connected platform keeps the important parts of an event moving together.</p></div><div className="about-company-offer-grid"><article><span>01</span><h3>Discover</h3><p>Help the right people find what is happening nearby, with event details they can trust.</p><button onClick={() => navigate('events')}>Find an event <ArrowRightIcon size={14} /></button></article><article><span>02</span><h3>Experience</h3><p>Make booking simple and keep every ticket ready for the moment guests arrive.</p><button onClick={() => navigate('my-tickets')}>View my tickets <ArrowRightIcon size={14} /></button></article><article><span>03</span><h3>Grow</h3><p>Give organizers a clearer way to publish, sell, welcome, and build what comes next.</p><button onClick={() => navigate('organizers')}>For organizers <ArrowRightIcon size={14} /></button></article></div></section>

      <section className="about-company-contact"><div className="about-company-shell"><MapPinIcon size={19} /><p className="about-company-section-label">05 / Get in touch</p><h2>Have an idea worth<br /><em>bringing to life?</em></h2><p>Tell us what you are building, what you want to experience, or where Tiketi can help.</p><div className="about-company-actions"><a href="mailto:hello@tiketi.events">hello@tiketi.events <ArrowRightIcon size={16} /></a><button onClick={() => navigate('auth-organizer')}>Start hosting <ArrowRightIcon size={16} /></button></div></div></section>
    </main>
  )
}
