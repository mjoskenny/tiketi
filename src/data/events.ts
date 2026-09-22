export type TicketTier = { type: string; price: number; description: string; available: number }

export type Event = {
  id: string
  name: string
  category: string
  date: string
  time: string
  venue: string
  city: string
  price: number
  image: string
  featured: boolean
  trending: boolean
  sellingFast: boolean
  description: string
  organizer: string
  organizerAvatar: string
  lineup: string[]
  capacity: number
  ticketsSold: number
  tickets: TicketTier[]
  weekend: 'friday' | 'saturday' | 'sunday' | null
}

export const events: Event[] = [
  {
    id: '1',
    name: 'Bujumbura Summer Fest',
    category: 'Music',
    date: 'Sept 20, 2026',
    time: '18:00',
    venue: 'Stade Intwari',
    city: 'Bujumbura',
    price: 30000,
    image: 'https://images.unsplash.com/photo-1778847195158-18f3137a07a8?w=800&h=600&fit=crop&auto=format',
    featured: true,
    trending: true,
    sellingFast: true,
    description: 'The biggest music festival of the summer. Featuring the hottest artists from across East and Central Africa, Bujumbura Summer Fest brings together thousands of fans for an unforgettable night of live music, culture, and celebration. Doors open at 17:00.',
    organizer: 'BJ Events',
    organizerAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&auto=format',
    lineup: ['DJ Kevlar', 'Afrobeat Kings', 'Urban Tribe', 'Miss Sauti', 'The Collective'],
    capacity: 5000,
    ticketsSold: 3847,
    weekend: 'saturday',
    tickets: [
      { type: 'REGULAR', price: 30000, description: 'General admission — standing area', available: 800 },
      { type: 'VIP', price: 75000, description: 'VIP zone with dedicated bar and seating', available: 203 },
      { type: 'VVIP', price: 150000, description: 'Premium table, unlimited drinks, backstage access', available: 12 },
    ],
  },
  {
    id: '2',
    name: 'The Kigali-Bujumbura Experience',
    category: 'Culture',
    date: 'Sept 27, 2026',
    time: '17:00',
    venue: 'Centre Culturel Français',
    city: 'Bujumbura',
    price: 20000,
    image: 'https://images.unsplash.com/photo-1519530782816-ba0c305fbb0d?w=800&h=600&fit=crop&auto=format',
    featured: true,
    trending: false,
    sellingFast: false,
    description: 'A cultural exchange event celebrating the rich shared heritage between Kigali and Bujumbura. Expect art exhibitions, dance performances, cuisine, and live music that bridges two great East African cities.',
    organizer: 'East African Arts Collective',
    organizerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format',
    lineup: ['Traditional Drum Corps', 'Contemporary Art Exhibition', 'Afrobeats DJ Set'],
    capacity: 1000,
    ticketsSold: 612,
    weekend: 'sunday',
    tickets: [
      { type: 'REGULAR', price: 20000, description: 'General admission', available: 350 },
      { type: 'VIP', price: 50000, description: 'Premium seating with welcome drink', available: 38 },
    ],
  },
  {
    id: '3',
    name: 'Basketball Night',
    category: 'Sports',
    date: 'Oct 4, 2026',
    time: '19:00',
    venue: 'Palais des Sports',
    city: 'Bujumbura',
    price: 10000,
    image: 'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?w=800&h=600&fit=crop&auto=format',
    featured: true,
    trending: true,
    sellingFast: true,
    description: 'The biggest basketball showdown of the year. Watch Bujumbura\'s best teams battle it out under the lights in front of a packed crowd. Come show your support.',
    organizer: 'Sports Burundi',
    organizerAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=80&h=80&fit=crop&auto=format',
    lineup: [],
    capacity: 2000,
    ticketsSold: 1876,
    weekend: 'sunday',
    tickets: [
      { type: 'REGULAR', price: 10000, description: 'Standard seating', available: 124 },
      { type: 'VIP', price: 25000, description: 'Courtside with premium seating', available: 40 },
    ],
  },
  {
    id: '4',
    name: 'Comedy Night Bujumbura',
    category: 'Comedy',
    date: 'Sept 19, 2026',
    time: '20:00',
    venue: 'Hotel Club du Lac Tanganyika',
    city: 'Bujumbura',
    price: 15000,
    image: 'https://images.unsplash.com/photo-1559228461-4fa1e7eb677c?w=800&h=600&fit=crop&auto=format',
    featured: false,
    trending: true,
    sellingFast: false,
    description: 'Laugh out loud with the best stand-up comedians in East Africa. A night of pure entertainment.',
    organizer: 'Laugh Factory BJ',
    organizerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&auto=format',
    lineup: ['Eric Rurangwa', 'Grace Uwase', 'Marcel K'],
    capacity: 400,
    ticketsSold: 318,
    weekend: 'friday',
    tickets: [
      { type: 'REGULAR', price: 15000, description: 'Open seating', available: 82 },
      { type: 'VIP', price: 35000, description: 'Reserved table for 2 with dinner', available: 15 },
    ],
  },
  {
    id: '5',
    name: 'East Africa Tech Summit',
    category: 'Business',
    date: 'Oct 10, 2026',
    time: '09:00',
    venue: 'Kiriri Garden Hotel',
    city: 'Bujumbura',
    price: 50000,
    image: 'https://images.unsplash.com/photo-1665035212282-3e117d618b36?w=800&h=600&fit=crop&auto=format',
    featured: false,
    trending: false,
    sellingFast: false,
    description: 'Connect with innovators, founders, and investors from across East Africa. Two days of keynotes, workshops, and networking.',
    organizer: 'TechHub Burundi',
    organizerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format',
    lineup: ['Startup Pitches', 'VC Panel', 'AI & the Future of Africa', 'Fintech Workshop'],
    capacity: 500,
    ticketsSold: 287,
    weekend: null,
    tickets: [
      { type: 'REGULAR', price: 50000, description: 'Full conference access — both days', available: 213 },
      { type: 'VIP', price: 120000, description: 'VIP access + networking dinner + speaker meetup', available: 22 },
    ],
  },
  {
    id: '6',
    name: 'Lake Tanganyika Sunset Party',
    category: 'Parties',
    date: 'Sept 26, 2026',
    time: '16:00',
    venue: 'Plage de Saga',
    city: 'Bujumbura',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1595239094544-cd47f94236d7?w=800&h=600&fit=crop&auto=format',
    featured: false,
    trending: true,
    sellingFast: true,
    description: 'Watch the sun set over Africa\'s deepest lake to the sounds of the best DJs in Bujumbura. The ultimate lakeside party experience.',
    organizer: 'Saga Productions',
    organizerAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format',
    lineup: ['DJ Phantom', 'DJ Aline', 'Live Percussion'],
    capacity: 800,
    ticketsSold: 647,
    weekend: 'saturday',
    tickets: [
      { type: 'REGULAR', price: 25000, description: 'General admission', available: 153 },
      { type: 'VIP', price: 60000, description: 'Premium lounger with bottle service', available: 8 },
    ],
  },
  {
    id: '7',
    name: 'University Afrobeats Night',
    category: 'Parties',
    date: 'Sept 25, 2026',
    time: '21:00',
    venue: 'Université du Burundi',
    city: 'Bujumbura',
    price: 8000,
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&h=600&fit=crop&auto=format',
    featured: false,
    trending: false,
    sellingFast: false,
    description: 'The biggest student party of the semester. Open to all university students and alumni.',
    organizer: 'UB Student Union',
    organizerAvatar: 'https://images.unsplash.com/photo-1542103749-8ef59b94f47e?w=80&h=80&fit=crop&auto=format',
    lineup: ['Campus DJs', 'Afrobeats Sessions'],
    capacity: 1200,
    ticketsSold: 543,
    weekend: 'friday',
    tickets: [
      { type: 'REGULAR', price: 8000, description: 'Student admission', available: 657 },
    ],
  },
  {
    id: '8',
    name: 'Burundi Cultural Festival',
    category: 'Culture',
    date: 'Oct 18, 2026',
    time: '10:00',
    venue: 'Musée Vivant',
    city: 'Bujumbura',
    price: 5000,
    image: 'https://images.unsplash.com/photo-1778847195271-605a4d6a9bf7?w=800&h=600&fit=crop&auto=format',
    featured: false,
    trending: false,
    sellingFast: false,
    description: 'A full day celebrating Burundian culture, art, food, and traditional music. Family-friendly.',
    organizer: 'Ministère de la Culture',
    organizerAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&auto=format',
    lineup: ['Ingoma Nshya', 'Traditional Dance', 'Food Fair', 'Art Exhibition'],
    capacity: 3000,
    ticketsSold: 890,
    weekend: null,
    tickets: [
      { type: 'REGULAR', price: 5000, description: 'Day pass', available: 2110 },
      { type: 'VIP', price: 15000, description: 'VIP experience with guided tour', available: 80 },
    ],
  },
]

export const categories = [
  { label: 'Music', icon: '🎵', color: '#F0A500', image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=300&fit=crop&auto=format' },
  { label: 'Parties', icon: '🎉', color: '#C8FF57', image: 'https://images.unsplash.com/photo-1595239094544-cd47f94236d7?w=400&h=300&fit=crop&auto=format' },
  { label: 'Sports', icon: '🏀', color: '#FF6B35', image: 'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?w=400&h=300&fit=crop&auto=format' },
  { label: 'Comedy', icon: '🎤', color: '#F97316', image: 'https://images.unsplash.com/photo-1559228461-4fa1e7eb677c?w=400&h=300&fit=crop&auto=format' },
  { label: 'Conferences', icon: '🎓', color: '#38BDF8', image: 'https://images.unsplash.com/photo-1665035212282-3e117d618b36?w=400&h=300&fit=crop&auto=format' },
  { label: 'Culture', icon: '🎨', color: '#FB7185', image: 'https://images.unsplash.com/photo-1519530782816-ba0c305fbb0d?w=400&h=300&fit=crop&auto=format' },
  { label: 'Business', icon: '💼', color: '#34D399', image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=300&fit=crop&auto=format' },
  { label: 'Festivals', icon: '🔥', color: '#F0A500', image: 'https://images.unsplash.com/photo-1778847195158-18f3137a07a8?w=400&h=300&fit=crop&auto=format' },
]

export const formatPrice = (n: number) => `${n.toLocaleString()} BIF`
