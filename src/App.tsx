import { useEffect, useMemo, useRef, useState } from 'react'
import { cropKnowledge, getCropProfile } from './lib/cropKnowledge'
import { calculateHarvestEstimate, type HarvestEstimate } from './lib/harvestEstimation'
import { recalculateCropCycleEstimates } from './lib/cropCycleEstimates'
import { buildActionRecommendations } from './lib/decisionSupport'
import { buildOperationalReport, operationalReportToCsv } from './lib/operationalReport'
import { analyzeMarketSignals, toPriceObservation } from './lib/marketIntelligence'
import './App.css'

type NavKey =
  | 'dashboard'
  | 'farmers'
  | 'farms'
  | 'crop-monitoring'
  | 'harvest-forecasts'
  | 'market-prices'
  | 'alerts'
  | 'ai-assistant'
  | 'reports'
  | 'settings'

type NavigationItem = {
  id: NavKey
  label: string
  icon: string
}

type SummaryCard = {
  title: string
  value: string
  detail: string
  tone: 'green' | 'orange' | 'blue' | 'purple'
}

type Farmer = {
  id: string
  name: string
  phone: string
  locality: string
  village: string
  experience: string
  notes: string
  status: 'Actif' | 'En attente'
}

type FarmerFormState = {
  id: string
  name: string
  phone: string
  locality: string
  village: string
  experience: string
  notes: string
  status: 'Actif' | 'En attente'
}

type Farm = {
  name: string
  owner: string
  location: string
  area: string
  crop: string
}

type CropCycle = {
  crop: string
  farmer: string
  area: string
  growth: string
  harvest: string
  forecast: string
}

type MarketPrice = {
  product: string
  market: string
  city: string
  date: string
  price: string
  change: string
}

type ActivityItem = {
  title: string
  detail: string
  time: string
}

type CropMonitoringCycle = {
  id: string
  farmerName: string
  cropName: string
  variety: string
  plantingDate: string
  cultivatedArea: string
  estimatedProduction: string
  observedStage: string | null
  notes: string
  estimate: HarvestEstimate
}

const CROP_CYCLES_STORAGE_KEY = 'akzem-intelligence-crop-cycles'

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
}

const createDemoCropCycles = (): CropMonitoringCycle[] => {
  const today = new Date()

  const tomatoPlanting = addDays(today, -26)
  const pepperPlanting = addDays(today, -18)
  const carrotPlanting = addDays(today, -12)

  return [
    {
      id: 'demo-cycle-tomato',
      farmerName: 'Jean Nsom',
      cropName: 'Tomates',
      variety: 'Hybrid',
      plantingDate: formatDateInput(tomatoPlanting),
      cultivatedArea: '1.8 ha',
      estimatedProduction: '1 200 kg',
      observedStage: null,
      notes: 'Semis réussi, sol bien préparé et irrigation régulière.',
      estimate: calculateHarvestEstimate({
        cropName: 'Tomates',
        variety: 'Hybrid',
        plantingDate: formatDateInput(tomatoPlanting),
        referenceDate: today,
      }),
    },
    {
      id: 'demo-cycle-pepper',
      farmerName: 'Paul Kengne',
      cropName: 'Poivrons',
      variety: 'Standard',
      plantingDate: formatDateInput(pepperPlanting),
      cultivatedArea: '1.2 ha',
      estimatedProduction: '860 kg',
      observedStage: 'Floraison',
      notes: 'Floraison active et forte demande hydrique sur la zone nord.',
      estimate: calculateHarvestEstimate({
        cropName: 'Poivrons',
        variety: 'Standard',
        plantingDate: formatDateInput(pepperPlanting),
        referenceDate: today,
      }),
    },
    {
      id: 'demo-cycle-carrot',
      farmerName: 'Amina Tchou',
      cropName: 'Carottes',
      variety: 'Locale',
      plantingDate: formatDateInput(carrotPlanting),
      cultivatedArea: '0.9 ha',
      estimatedProduction: '640 kg',
      observedStage: 'Mise en place',
      notes: 'Le rapport de terrain confirme une croissance régulière.',
      estimate: calculateHarvestEstimate({
        cropName: 'Carottes',
        variety: 'Locale',
        plantingDate: formatDateInput(carrotPlanting),
        referenceDate: today,
      }),
    },
  ]
}

const navigation: NavigationItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '▦' },
  { id: 'farmers', label: 'Agriculteurs', icon: '👨‍🌾' },
  { id: 'farms', label: 'Exploitations agricoles', icon: '🏡' },
  { id: 'crop-monitoring', label: 'Suivi des cultures', icon: '🌾' },
  { id: 'harvest-forecasts', label: 'Prévisions des récoltes', icon: '📦' },
  { id: 'market-prices', label: 'Prix des marchés', icon: '📊' },
  { id: 'alerts', label: 'Analyses et alertes', icon: '⚠️' },
  { id: 'ai-assistant', label: 'Assistant IA', icon: '✨' },
  { id: 'reports', label: 'Rapports', icon: '🧾' },
  { id: 'settings', label: 'Paramètres', icon: '⚙️' },
]

const STORAGE_KEY = 'akzem-intelligence-farmers'

const createDemoFarmers = (): Farmer[] => [
  {
    id: 'demo-1',
    name: 'Jean Nsom',
    phone: '+237 655 12 34 56',
    locality: 'Douala',
    village: 'Bonabéri',
    experience: '12 ans',
    notes: 'Cultive des tomates et des poivrons pour des marchés de proximité.',
    status: 'Actif',
  },
  {
    id: 'demo-2',
    name: 'Amina Tchou',
    phone: '+237 699 88 12 34',
    locality: 'Bafoussam',
    village: 'Mifi',
    experience: '8 ans',
    notes: 'Spécialiste des cultures maraîchères en petite surface.',
    status: 'Actif',
  },
  {
    id: 'demo-3',
    name: 'Paul Kengne',
    phone: '+237 675 22 90 11',
    locality: 'Yaoundé',
    village: 'Mfoundi',
    experience: '15 ans',
    notes: 'Travaille sur plusieurs parcelles et suit les cycles de rendement.',
    status: 'En attente',
  },
]

const emptyFarmerForm = (): FarmerFormState => ({
  id: '',
  name: '',
  phone: '',
  locality: '',
  village: '',
  experience: '',
  notes: '',
  status: 'Actif',
})

const demoData = {
  farms: [
    { name: 'Ferme Mvila 1', owner: 'Jean Nsom', location: 'Douala', area: '4.2 ha', crop: 'Tomates' },
    { name: 'Ferme Kengne', owner: 'Paul Kengne', location: 'Yaoundé', area: '3.1 ha', crop: 'Poivrons' },
    { name: 'Ferme Amina', owner: 'Amina Tchou', location: 'Bafoussam', area: '2.7 ha', crop: 'Carottes' },
  ] as Farm[],
  cropCycles: [
    { crop: 'Tomates', farmer: 'Jean Nsom', area: '1.8 ha', growth: 'Floraison', harvest: '15 sept. 2026', forecast: 'Bonne tendance' },
    { crop: 'Poivrons', farmer: 'Paul Kengne', area: '1.2 ha', growth: 'Grossissement', harvest: '22 sept. 2026', forecast: 'Quantité modérée' },
    { crop: 'Carottes', farmer: 'Amina Tchou', area: '0.9 ha', growth: 'Mise en place', harvest: '28 sept. 2026', forecast: 'À surveiller' },
  ] as CropCycle[],
  prices: [
    { product: 'Tomates', market: 'Marché de Bonabéri', city: 'Douala', date: '12 août 2026', price: '650 FCFA/kg', change: '+4.8%' },
    { product: 'Poivrons', market: 'Marché de Melen', city: 'Yaoundé', date: '10 août 2026', price: '920 FCFA/kg', change: '+2.1%' },
    { product: 'Carottes', market: 'Marché de Bafoussam', city: 'Bafoussam', date: '08 août 2026', price: '480 FCFA/kg', change: '-1.3%' },
  ] as MarketPrice[],
  harvests: [
    { product: 'Tomates', farm: 'Ferme Mvila 1', window: '5-10 jours', quantity: '1 200 kg estimés' },
    { product: 'Poivrons', farm: 'Ferme Kengne', window: '12-18 jours', quantity: '860 kg estimés' },
    { product: 'Carottes', farm: 'Ferme Amina', window: '20-25 jours', quantity: '640 kg estimés' },
  ],
  activities: [
    { title: 'Prix tomates mis à jour', detail: 'Marché de Bonabéri', time: 'Il y a 2 heures' },
    { title: 'Nouvelle culture enregistrée', detail: 'Carottes, Amina Tchou', time: 'Hier' },
    { title: 'Alerte récolte', detail: 'Tomates à maturité dans 5 jours', time: 'Aujourd’hui' },
  ] as ActivityItem[],
}

const getHashPage = (): NavKey => {
  if (typeof window === 'undefined') {
    return 'dashboard'
  }

  const hash = window.location.hash.replace('#', '')
  const match = navigation.find((item) => item.id === hash)
  return match ? match.id : 'dashboard'
}

const summaryCards: SummaryCard[] = [
  { title: 'Agriculteurs enregistrés', value: '03', detail: 'Profils dans le registre', tone: 'green' },
  { title: 'Agriculteurs actifs', value: '03', detail: 'Statut actif', tone: 'orange' },
  { title: 'Cultures suivies', value: '03', detail: 'Cycles en cours', tone: 'blue' },
  { title: 'Récoltes prévues', value: '03', detail: 'Dans les 30 prochains jours', tone: 'purple' },
]

type SignedInUser = { id: number; email: string; role: 'admin' | 'agent' }

function AdminApp() {
  const [authUser, setAuthUser] = useState<SignedInUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activePage, setActivePage] = useState<NavKey>(getHashPage)
  const [farmers, setFarmers] = useState<Farmer[]>(() => {
    if (typeof window === 'undefined') {
      return createDemoFarmers()
    }

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as Farmer[]
      }
    } catch {
      // ignore invalid local storage and keep demo data
    }

    const demoFarmers = createDemoFarmers()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoFarmers))
    return demoFarmers
  })

  useEffect(() => {
    let mounted = true
    fetch('/api/auth/me')
      .then(async (response) => response.ok ? response.json() as Promise<{ user: SignedInUser }> : null)
      .then((payload) => { if (mounted) setAuthUser(payload?.user ?? null) })
      .catch(() => { if (mounted) setAuthUser(null) })
      .finally(() => { if (mounted) setAuthLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(farmers))
    }
  }, [farmers])

  const [cropCycles, setCropCycles] = useState<CropMonitoringCycle[]>(() => {
    if (typeof window === 'undefined') {
      return createDemoCropCycles()
    }

    try {
      const saved = window.localStorage.getItem(CROP_CYCLES_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as CropMonitoringCycle[]
      }
    } catch {
      // ignore invalid local storage and keep demo data
    }

    const demoCycles = createDemoCropCycles()
    window.localStorage.setItem(CROP_CYCLES_STORAGE_KEY, JSON.stringify(demoCycles))
    return demoCycles
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CROP_CYCLES_STORAGE_KEY, JSON.stringify(cropCycles))
    }
  }, [cropCycles])

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(getHashPage())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = (page: NavKey) => {
    setActivePage(page)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `#${page}`)
    }
  }

  const currentSection = useMemo(
    () => navigation.find((item) => item.id === activePage) ?? navigation[0],
    [activePage],
  )

  const renderPage = () => {
    switch (activePage) {
      case 'farmers':
        return <FarmersPage farmers={farmers} setFarmers={setFarmers} />
      case 'farms':
        return <FarmsPage />
      case 'crop-monitoring':
        return <CropMonitoringPage farmers={farmers} cropCycles={cropCycles} setCropCycles={setCropCycles} />
      case 'harvest-forecasts':
        return <HarvestForecastsPage cropCycles={cropCycles} />
      case 'market-prices':
        return <MarketPricesPage />
      case 'alerts':
        return <AlertsPage cropCycles={cropCycles} />
      case 'ai-assistant':
        return <AiAssistantPage />
      case 'reports':
        return <ReportsPage farmers={farmers} cropCycles={cropCycles} />
      case 'settings':
        return <SettingsPage />
      default:
        return <DashboardPage farmers={farmers} cropCycles={cropCycles} />
    }
  }

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAuthUser(null)
  }

  if (authLoading) return <div className="auth-loading-screen">Akzem Intelligence</div>
  if (!authUser || authUser.role !== 'admin') {
    return <AdminLogin user={authUser} onSignIn={setAuthUser} onSignOut={signOut} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">Akzem</div>
            <div className="brand-subtitle">INTELLIGENCE</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menu principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={activePage === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Données de démonstration</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Akzem Intelligence / {currentSection.label}</p>
            <h1>{currentSection.label}</h1>
          </div>

          <div className="user-chip">
            <div className="avatar">AI</div>
            <div>
              <strong>Administrateur</strong>
              <span>{authUser.email}</span>
            </div>
            <button type="button" className="logout-button" onClick={() => void signOut()}>Quitter</button>
          </div>
        </header>

        {renderPage()}
      </main>
    </div>
  )
}

function DecorativeVideo({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPlayback = () => {
      if (motionPreference.matches) {
        video.pause()
      } else {
        void video.play().catch(() => undefined)
      }
    }

    syncPlayback()
    motionPreference.addEventListener('change', syncPlayback)
    return () => motionPreference.removeEventListener('change', syncPlayback)
  }, [])

  return (
    <video ref={videoRef} className={className} muted loop playsInline preload="metadata" aria-hidden="true">
      <source src={src} type="video/mp4" />
    </video>
  )
}

function DashboardPage({ farmers, cropCycles }: { farmers: Farmer[]; cropCycles: CropMonitoringCycle[] }) {
  const currentCycles = useMemo(() => recalculateCropCycleEstimates(cropCycles), [cropCycles])
  const metrics = useMemo(() => buildOperationalReport(farmers, currentCycles), [farmers, currentCycles])
  const nextHarvests = [...currentCycles]
    .filter((cycle) => cycle.estimate.daysRemainingToLatest >= 0)
    .sort((left, right) => left.estimate.daysRemainingToEarliest - right.estimate.daysRemainingToEarliest)
    .slice(0, 3)
  const cards = [
    { ...summaryCards[0], value: String(metrics.farmerCount).padStart(2, '0') },
    { ...summaryCards[1], value: String(metrics.activeFarmerCount).padStart(2, '0') },
    { ...summaryCards[2], value: String(currentCycles.length).padStart(2, '0') },
    { ...summaryCards[3], value: String(metrics.harvestsWithin30Days).padStart(2, '0') },
  ]

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">INTELLIGENCE AGRICOLE</p>
          <h2>Comprendre les marchés, anticiper les récoltes.</h2>
          <p>Suivez l’activité agricole, observez les prix et préparez les achats futurs avec une meilleure visibilité sur la production locale.</p>
          <a className="hero-link" href="#ai-assistant">Explorer l’assistant IA <span aria-hidden="true">↗</span></a>
        </div>
        <div className="hero-visual" aria-label="Aperçu animé d’Akzem sur smartphone">
          <DecorativeVideo className="hero-video" src="/akzem-farm-animation.mp4" />
          <div className="hero-video-shade" aria-hidden="true" />
          <div className="hero-visual-caption"><span className="hero-caption-icon">✦</span><span>La technologie au service du terrain</span></div>
        </div>
      </section>

      <section className="story-section" aria-labelledby="story-heading">
        <div className="story-heading">
          <div>
            <p className="eyebrow">AKZEM, DU TERRAIN AU MARCHÉ</p>
            <h2 id="story-heading">Une agriculture plus visible.</h2>
          </div>
          <p>La technologie accompagne chaque étape, de la récolte à la décision.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <div className="story-media">
              <DecorativeVideo className="story-video" src="/akzem-field-harvest.mp4" />
              <span className="story-kicker">SUR LE TERRAIN</span>
            </div>
            <div className="story-copy">
              <h3>La récolte commence au champ</h3>
              <p>Valoriser le travail des agriculteurs et mieux préparer les prochaines récoltes.</p>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <DecorativeVideo className="story-video" src="/akzem-brand-animation.mp4" />
              <span className="story-kicker">AKZEM INTELLIGENCE</span>
            </div>
            <div className="story-copy">
              <h3>Les décisions, toujours à portée de main</h3>
              <p>Un aperçu de la vision Akzem : relier les outils numériques aux réalités agricoles.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="stats-grid" aria-label="Vue d’ensemble">
        {cards.map((card) => (
          <article key={card.title} className={`stat-card tone-${card.tone}`}>
            <div className="stat-header"><span>{card.title}</span><span className="stat-icon">•</span></div>
            <h3>{card.value}</h3>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header"><div><h3>Intelligence des marchés</h3><p>Prix observés et tendance de marché.</p></div><span className="panel-tag">Demo</span></div>
          <div className="market-chart" aria-label="Tendance de prix de démonstration">
            {[38, 52, 48, 58, 60, 72, 78].map((height, index) => <div key={index} className="bar-column" style={{ height: `${height}%` }} />)}
          </div>
          <div className="list-stack">
            {demoData.prices.map((price) => (
              <div className="list-row" key={`${price.product}-${price.market}`}>
                <div><strong>{price.product}</strong><span>{price.market}</span></div>
                <div className="price-meta"><span>{price.price}</span><em className={price.change.startsWith('-') ? 'down' : 'up'}>{price.change}</em></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><div><h3>Récoltes à venir</h3><p>Fenêtre calculée à partir de la date de plantation.</p></div><span className="panel-tag">Rule-based</span></div>
          <div className="list-stack">
            {nextHarvests.length > 0 ? nextHarvests.map((cycle) => (
              <div className="list-row pulse" key={cycle.id}>
                <div><strong>{cycle.cropName}</strong><span>{cycle.farmerName}</span></div>
                <div className="price-meta align-right"><span>{cycle.estimate.daysRemainingToEarliest <= 0 ? 'Récolte possible' : `Dans ${cycle.estimate.daysRemainingToEarliest} jours`}</span><em>{cycle.estimate.harvestWindow}</em></div>
              </div>
            )) : <div className="empty-state-box compact-box"><p>Aucune récolte planifiée dans cette fenêtre.</p></div>}
          </div>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header"><div><h3>Indicateurs de maturité</h3><p>Indicateurs explicables, basés sur la durée du cycle.</p></div><span className="panel-tag">Provisoire</span></div>
          <div className="indicator-grid">
            <div className="indicator-box"><span>Récoltes sous 7 jours</span><strong>{metrics.harvestsWithin7Days}</strong></div>
            <div className="indicator-box"><span>Récoltes sous 30 jours</span><strong>{metrics.harvestsWithin30Days}</strong></div>
            <div className="indicator-box"><span>Surface cultivée</span><strong>{metrics.totalAreaHectares.toFixed(1)} ha</strong></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><div><h3>Production attendue</h3><p>Volumes déclarés par cycle, pas un rendement calculé.</p></div><span className="panel-tag">Déclaratif</span></div>
          <div className="list-stack">
            {currentCycles.length > 0 ? currentCycles.slice(0, 3).map((cycle) => (
              <div className="list-row" key={cycle.id}>
                <div><strong>{cycle.cropName}</strong><span>{cycle.variety} · {cycle.estimate.currentDevelopmentStage}</span></div>
                <div className="price-meta align-right"><span>{cycle.estimatedProduction || 'Non renseignée'}</span><em>{cycle.estimate.confidenceLabel}</em></div>
              </div>
            )) : <div className="empty-state-box compact-box"><p>Pas encore assez de données pour afficher une production.</p></div>}
          </div>
        </article>
      </section>

      <section className="panel full-width">
        <div className="panel-header"><div><h3>Activité récente</h3><p>Suivi des opérations enregistrées dans cette démonstration.</p></div><span className="panel-tag">Demo</span></div>
        <div className="activity-list">
          {demoData.activities.map((activity) => (
            <div key={`${activity.title}-${activity.time}`} className="activity-item">
              <div className="activity-bullet" aria-hidden="true" />
              <div><strong>{activity.title}</strong><p>{activity.detail}</p></div>
              <span>{activity.time}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function PageLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="page-layout">
      <div className="section-intro">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="panel-tag">Données de démonstration</span>
      </div>
      {children}
    </section>
  )
}

function FarmersPage({
  farmers,
  setFarmers,
}: {
  farmers: Farmer[]
  setFarmers: React.Dispatch<React.SetStateAction<Farmer[]>>
}) {
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [selectedFarmerId, setSelectedFarmerId] = useState(farmers[0]?.id ?? '')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FarmerFormState>(emptyFarmerForm())
  const [errors, setErrors] = useState<Partial<Record<keyof FarmerFormState, string>>>({})

  const availableLocations = useMemo(
    () => [...new Set(farmers.map((farmer) => farmer.locality))].sort(),
    [farmers],
  )

  const filteredFarmers = useMemo(() => {
    return farmers.filter((farmer) => {
      const matchesSearch = farmer.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchesLocation = locationFilter ? farmer.locality === locationFilter : true
      return matchesSearch && matchesLocation
    })
  }, [farmers, locationFilter, search])

  const selectedFarmer =
    farmers.find((farmer) => farmer.id === selectedFarmerId) ?? filteredFarmers[0] ?? null

  const clearForm = () => {
    setFormData(emptyFarmerForm())
    setErrors({})
    setEditingId(null)
    setIsFormOpen(false)
  }

  const openCreateForm = () => {
    setFormData(emptyFarmerForm())
    setErrors({})
    setEditingId(null)
    setIsFormOpen(true)
  }

  const openEditForm = (farmer: Farmer) => {
    setFormData({
      id: farmer.id,
      name: farmer.name,
      phone: farmer.phone,
      locality: farmer.locality,
      village: farmer.village,
      experience: farmer.experience,
      notes: farmer.notes,
      status: farmer.status,
    })
    setErrors({})
    setEditingId(farmer.id)
    setIsFormOpen(true)
  }

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof FarmerFormState, string>> = {}
    const trimmedName = formData.name.trim()
    const trimmedPhone = formData.phone.trim()
    const trimmedLocality = formData.locality.trim()
    const trimmedVillage = formData.village.trim()
    const trimmedExperience = formData.experience.trim()
    const trimmedNotes = formData.notes.trim()

    if (!trimmedName) {
      nextErrors.name = 'Le nom est obligatoire.'
    } else if (trimmedName.length < 2) {
      nextErrors.name = 'Le nom doit contenir au moins 2 caractères.'
    }

    if (!trimmedPhone) {
      nextErrors.phone = 'Le numéro de téléphone est obligatoire.'
    } else {
      const normalizedPhone = trimmedPhone.replace(/\s+/g, '')
      if (!/^(\+?237|0)[0-9]+$/.test(normalizedPhone) || normalizedPhone.length < 9) {
        nextErrors.phone = 'Le numéro doit être un numéro valide au Cameroun.'
      }
    }

    if (!trimmedLocality) {
      nextErrors.locality = 'La localité est obligatoire.'
    }

    if (!trimmedVillage) {
      nextErrors.village = 'Le village ou quartier est obligatoire.'
    }

    if (!trimmedExperience) {
      nextErrors.experience = 'L’expérience est obligatoire.'
    }

    if (trimmedNotes.length > 500) {
      nextErrors.notes = 'Les notes ne doivent pas dépasser 500 caractères.'
    }

    return nextErrors
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateForm()
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const payload: Farmer = {
      id: editingId ?? `${Date.now()}`,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      locality: formData.locality.trim(),
      village: formData.village.trim(),
      experience: formData.experience.trim(),
      notes: formData.notes.trim(),
      status: formData.status,
    }

    setFarmers((current) => {
      if (editingId) {
        return current.map((farmer) => (farmer.id === editingId ? payload : farmer))
      }

      return [payload, ...current]
    })

    setSelectedFarmerId(payload.id)
    clearForm()
  }

  return (
    <PageLayout title="Agriculteurs" description="Gérez les agriculteurs, leurs localités et leurs informations de contact.">
      <div className="farmer-toolbar">
        <label className="search-field">
          <span>Recherche par nom</span>
          <input
            type="search"
            placeholder="Rechercher un agriculteur"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label className="search-field compact-field">
          <span>Filtrer par localité</span>
          <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
            <option value="">Toutes les localités</option>
            {availableLocations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="primary-button" onClick={openCreateForm}>
          + Ajouter un agriculteur
        </button>
      </div>

      <div className="farmer-layout">
        <div className="farmer-list-panel">
          {filteredFarmers.length > 0 ? (
            filteredFarmers.map((farmer) => (
              <button
                key={farmer.id}
                type="button"
                className={`farmer-item ${selectedFarmer?.id === farmer.id ? 'selected' : ''}`}
                onClick={() => setSelectedFarmerId(farmer.id)}
              >
                <div className="farmer-item-header">
                  <span className="badge soft">{farmer.status}</span>
                  <span className="mini-icon">👨‍🌾</span>
                </div>
                <strong>{farmer.name}</strong>
                <span>{farmer.locality}</span>
                <small>{farmer.village}</small>
              </button>
            ))
          ) : (
            <div className="empty-state-box">
              <p>Aucun agriculteur ne correspond à ces filtres.</p>
            </div>
          )}
        </div>

        <div className="farmer-detail-panel">
          {selectedFarmer ? (
            <>
              <div className="detail-header">
                <div>
                  <p className="detail-label">Profil agriculteur</p>
                  <h3>{selectedFarmer.name}</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => openEditForm(selectedFarmer)}>
                  Modifier
                </button>
              </div>

              <div className="profile-grid">
                <div>
                  <span>Localité</span>
                  <strong>{selectedFarmer.locality}</strong>
                </div>
                <div>
                  <span>Village</span>
                  <strong>{selectedFarmer.village}</strong>
                </div>
                <div>
                  <span>Téléphone</span>
                  <strong>{selectedFarmer.phone}</strong>
                </div>
                <div>
                  <span>Expérience</span>
                  <strong>{selectedFarmer.experience}</strong>
                </div>
              </div>

              <div className="notes-block">
                <h4>Notes agricoles</h4>
                <p>{selectedFarmer.notes || 'Aucune note agricole enregistrée pour le moment.'}</p>
              </div>
            </>
          ) : (
            <div className="empty-state-box">
              <p>Selectionnez un agriculteur pour afficher son profil.</p>
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <div className="modal-backdrop" onClick={clearForm} aria-modal="true" role="dialog">
          <div className="farmer-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="form-header">
              <div>
                <p className="detail-label">{editingId ? 'Modifier l’agriculteur' : 'Nouvel agriculteur'}</p>
                <h3>{editingId ? 'Mettre à jour le profil' : 'Enregistrer un agriculteur'}</h3>
              </div>
              <button type="button" className="close-button" onClick={clearForm} aria-label="Fermer le formulaire">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="farmer-form">
              <div className="form-grid">
                <label className="field">
                  <span>Nom complet</span>
                  <input
                    value={formData.name}
                    onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex. Jean Nsom"
                  />
                  {errors.name && <small>{errors.name}</small>}
                </label>

                <label className="field">
                  <span>Téléphone</span>
                  <input
                    value={formData.phone}
                    onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Ex. +237 655 12 34 56"
                  />
                  {errors.phone && <small>{errors.phone}</small>}
                </label>

                <label className="field">
                  <span>Localité</span>
                  <input
                    value={formData.locality}
                    onChange={(event) => setFormData((current) => ({ ...current, locality: event.target.value }))}
                    placeholder="Ex. Douala"
                  />
                  {errors.locality && <small>{errors.locality}</small>}
                </label>

                <label className="field">
                  <span>Village / quartier</span>
                  <input
                    value={formData.village}
                    onChange={(event) => setFormData((current) => ({ ...current, village: event.target.value }))}
                    placeholder="Ex. Bonabéri"
                  />
                  {errors.village && <small>{errors.village}</small>}
                </label>

                <label className="field">
                  <span>Expérience</span>
                  <input
                    value={formData.experience}
                    onChange={(event) => setFormData((current) => ({ ...current, experience: event.target.value }))}
                    placeholder="Ex. 12 ans"
                  />
                  {errors.experience && <small>{errors.experience}</small>}
                </label>

                <label className="field">
                  <span>Statut</span>
                  <select
                    value={formData.status}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        status: event.target.value as FarmerFormState['status'],
                      }))
                    }
                  >
                    <option value="Actif">Actif</option>
                    <option value="En attente">En attente</option>
                  </select>
                </label>
              </div>

              <label className="field full-width">
                <span>Notes agricoles</span>
                <textarea
                  value={formData.notes}
                  onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
                  rows={5}
                  placeholder="Ajoutez des observations utiles sur les pratiques agricoles, les cultures ou les besoins de suivi."
                />
                {errors.notes && <small>{errors.notes}</small>}
              </label>

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={clearForm}>
                  Annuler
                </button>
                <button type="submit" className="primary-button">
                  {editingId ? 'Enregistrer les modifications' : 'Créer l’agriculteur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

function FarmsPage() {
  return (
    <PageLayout title="Exploitations agricoles" description="Inventaire temporaire des exploitations suivies dans la démonstration.">
      <div className="section-grid three-columns">
        {demoData.farms.map((farm) => (
          <article className="info-card" key={farm.name}>
            <div className="card-label-row">
              <span className="badge soft">Ferme</span>
              <span className="mini-icon">🏡</span>
            </div>
            <h3>{farm.name}</h3>
            <ul>
              <li>Propriétaire : {farm.owner}</li>
              <li>Localisation : {farm.location}</li>
              <li>Superficie : {farm.area}</li>
              <li>Culture principale : {farm.crop}</li>
            </ul>
          </article>
        ))}
      </div>
    </PageLayout>
  )
}

function CropMonitoringPage({
  farmers,
  cropCycles,
  setCropCycles,
}: {
  farmers: Farmer[]
  cropCycles: CropMonitoringCycle[]
  setCropCycles: React.Dispatch<React.SetStateAction<CropMonitoringCycle[]>>
}) {
  const [cropName, setCropName] = useState(cropKnowledge[0].name)
  const [variety, setVariety] = useState(cropKnowledge[0].varieties[0].name)
  const [farmerId, setFarmerId] = useState(farmers[0]?.id ?? '')
  const [plantingDate, setPlantingDate] = useState(formatDateInput(addDays(new Date(), -30)))
  const [cultivatedArea, setCultivatedArea] = useState('')
  const [estimatedProduction, setEstimatedProduction] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const currentCycles = useMemo(() => recalculateCropCycleEstimates(cropCycles), [cropCycles])

  const selectedProfile = getCropProfile(cropName, variety)

  const handleCropChange = (nextCropName: string) => {
    const nextProfile = cropKnowledge.find((profile) => profile.name === nextCropName)
    if (nextProfile) {
      setCropName(nextCropName)
      setVariety(nextProfile.varieties[0].name)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')

    try {
      const farmer = farmers.find((item) => item.id === farmerId)
      const areaValue = cultivatedArea.trim().replace(',', '.')
      if (areaValue && (!/^\d+(?:\.\d+)?$/.test(areaValue) || Number(areaValue) <= 0)) {
        setFormError('La surface doit être un nombre positif en hectares.')
        return
      }
      const estimate = calculateHarvestEstimate({ cropName, variety, plantingDate })
      const cycle: CropMonitoringCycle = {
        id: `cycle-${Date.now()}`,
        farmerName: farmer?.name ?? 'Agriculteur non attribué',
        cropName,
        variety,
        plantingDate,
        cultivatedArea: areaValue ? `${areaValue} ha` : '',
        estimatedProduction: estimatedProduction.trim(),
        observedStage: null,
        notes: notes.trim(),
        estimate,
      }

      setCropCycles((current) => [cycle, ...current])
      setCultivatedArea('')
      setEstimatedProduction('')
      setNotes('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Impossible de calculer cette prévision.')
    }
  }

  const updateObservedStage = (cycleId: string, observedStage: string) => {
    setCropCycles((current) => current.map((cycle) =>
      cycle.id === cycleId ? { ...cycle, observedStage: observedStage || null } : cycle,
    ))
  }

  return (
    <PageLayout title="Suivi des cultures" description="Suivez les cycles, comparez le stade observé à la maturité calculée et préparez les récoltes.">
      <section className="panel crop-entry-panel">
        <div className="panel-header">
          <div><h3>Enregistrer un cycle cultural</h3><p>La récolte est calculée selon la culture, la variété et la date de plantation.</p></div>
          <span className="panel-tag">Règles provisoires</span>
        </div>
        <form className="crop-entry-form" onSubmit={handleSubmit}>
          <label className="field"><span>Culture</span>
            <select value={cropName} onChange={(event) => handleCropChange(event.target.value)}>
              {cropKnowledge.map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Variété</span>
            <select value={variety} onChange={(event) => setVariety(event.target.value)}>
              {selectedProfile.varieties.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Agriculteur</span>
            <select value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
              <option value="">Non attribué</option>
              {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Date de plantation</span>
            <input required type="date" value={plantingDate} max={formatDateInput(new Date())} onChange={(event) => setPlantingDate(event.target.value)} />
          </label>
          <label className="field"><span>Surface (ha)</span>
            <input inputMode="decimal" value={cultivatedArea} onChange={(event) => setCultivatedArea(event.target.value)} placeholder="Ex. 1.5" />
          </label>
          <label className="field"><span>Production déclarée</span>
            <input value={estimatedProduction} onChange={(event) => setEstimatedProduction(event.target.value)} placeholder="Ex. 800 kg" />
          </label>
          <label className="field crop-notes-field"><span>Notes agronomiques</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observations terrain, irrigation, état sanitaire..." />
          </label>
          <button type="submit" className="primary-button">Ajouter le cycle</button>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </form>
      </section>

      <div className="table-card">
        <table>
          <thead><tr><th>Culture / variété</th><th>Agriculteur</th><th>Plantation</th><th>Stade calculé</th><th>Stade observé</th><th>Fenêtre estimée</th><th>Jours</th></tr></thead>
          <tbody>
            {currentCycles.map((cycle) => (
              <tr key={cycle.id}>
                <td>{cycle.cropName}<small className="table-subtext">{cycle.variety} · {cycle.cultivatedArea || 'Surface non précisée'}</small></td>
                <td>{cycle.farmerName}</td>
                <td>{cycle.plantingDate}</td>
                <td>{cycle.estimate.currentDevelopmentStage}</td>
                <td><select aria-label={`Stade observé pour ${cycle.cropName}`} value={cycle.observedStage ?? ''} onChange={(event) => updateObservedStage(cycle.id, event.target.value)}>
                  <option value="">Non renseigné</option>
                  {getCropProfile(cycle.cropName, cycle.variety).stages.map((stage) => <option key={stage.label} value={stage.label}>{stage.label}</option>)}
                </select></td>
                <td>{cycle.estimate.harvestWindow}</td>
                <td>{cycle.estimate.daysRemainingToLatest < 0 ? 'Fenêtre passée' : cycle.estimate.daysRemainingToEarliest <= 0 ? 'Dans la fenêtre' : `${cycle.estimate.daysRemainingToEarliest} j`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="estimate-disclaimer">Estimation basée sur des plages de maturité indicatives depuis la plantation. Les stades observés restent des observations terrain distinctes. Les conditions locales peuvent modifier le calendrier.</p>
    </PageLayout>
  )
}

function HarvestForecastsPage({ cropCycles }: { cropCycles: CropMonitoringCycle[] }) {
  const currentCycles = useMemo(() => recalculateCropCycleEstimates(cropCycles)
    .filter((cycle) => cycle.estimate.daysRemainingToLatest >= 0)
    .sort((left, right) => left.estimate.daysRemainingToEarliest - right.estimate.daysRemainingToEarliest), [cropCycles])

  return (
    <PageLayout title="Prévisions des récoltes" description="Fenêtres de récolte calculées à partir des cycles enregistrés et des règles agronomiques provisoires.">
      <div className="section-grid three-columns">
        {currentCycles.map((cycle) => (
          <article className="info-card" key={cycle.id}>
            <div className="card-label-row"><span className="badge soft">{cycle.estimate.confidenceLabel}</span><span className="mini-icon">📦</span></div>
            <h3>{cycle.cropName}</h3>
            <ul>
              <li>Agriculteur : {cycle.farmerName}</li>
              <li>Variété : {cycle.variety}</li>
              <li>Fenêtre : {cycle.estimate.harvestWindow}</li>
              <li>Stade calculé : {cycle.estimate.currentDevelopmentStage}</li>
              <li>Stade observé : {cycle.observedStage ?? 'Non renseigné'}</li>
              <li>Production déclarée : {cycle.estimatedProduction || 'Non renseignée'}</li>
            </ul>
            <details className="estimate-details">
              <summary>Voir les règles et hypothèses</summary>
              <p>{cycle.estimate.source}</p>
              <ul>{cycle.estimate.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              <p>Calculé le {cycle.estimate.referenceDate}. {cycle.estimate.isValidated ? 'Référentiel validé.' : 'Référentiel provisoire, non validé localement.'}</p>
            </details>
          </article>
        ))}
        {currentCycles.length === 0 && <div className="empty-state-box"><p>Aucun cycle cultural enregistré.</p></div>}
      </div>
    </PageLayout>
  )
}

type MarketCommodity = { id: number; name: string; isActive: boolean }
type MarketCollector = { id: number; email: string; isActive: boolean; createdAt: number; lastLoginAt: number | null }
type MarketInvitation = { email: string; createdAt: number; expiresAt: number }
type MarketObservation = {
  id: number
  commodity: string
  marketName: string
  city: string
  availability: 'available' | 'unavailable'
  priceMin: number | null
  priceMax: number | null
  priceUnit: string | null
  comment: string
  observedAt: number
  agentEmail: string
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message ?? 'La demande a échoué. Réessayez.')
  return payload as T
}

const formatMarketDate = (timestamp: number | null) => timestamp
  ? new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Jamais connecté'

const formatMarketPrice = (min: number | null, max: number | null, unit: string | null) => {
  if (min === null || max === null) return '—'
  const amount = min === max
    ? min.toLocaleString('fr-FR')
    : `${min.toLocaleString('fr-FR')} – ${max.toLocaleString('fr-FR')}`
  return `${amount} FCFA / ${unit ?? ''}`
}

function MarketPricesPage() {
  const [observations, setObservations] = useState<MarketObservation[]>([])
  const [commodities, setCommodities] = useState<MarketCommodity[]>([])
  const [collectors, setCollectors] = useState<MarketCollector[]>([])
  const [invitations, setInvitations] = useState<MarketInvitation[]>([])
  const [email, setEmail] = useState('')
  const [newCommodity, setNewCommodity] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)

  const refresh = async () => {
    setError('')
    const [observationData, commodityData, collectorData] = await Promise.all([
      requestJson<{ observations: MarketObservation[] }>('/api/admin/market-observations'),
      requestJson<{ commodities: MarketCommodity[] }>('/api/admin/commodities'),
      requestJson<{ collectors: MarketCollector[]; invitations: MarketInvitation[] }>('/api/admin/collectors'),
    ])
    setObservations(observationData.observations)
    setCommodities(commodityData.commodities)
    setCollectors(collectorData.collectors)
    setInvitations(collectorData.invitations)
  }

  useEffect(() => {
    let mounted = true
    Promise.all([
      requestJson<{ observations: MarketObservation[] }>('/api/admin/market-observations'),
      requestJson<{ commodities: MarketCommodity[] }>('/api/admin/commodities'),
      requestJson<{ collectors: MarketCollector[]; invitations: MarketInvitation[] }>('/api/admin/collectors'),
    ]).then(([observationData, commodityData, collectorData]) => {
      if (!mounted) return
      setObservations(observationData.observations)
      setCommodities(commodityData.commodities)
      setCollectors(collectorData.collectors)
      setInvitations(collectorData.invitations)
    }).catch((loadError: unknown) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les données.')
    }).finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [])

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsWorking(true)
    try {
      const payload = await requestJson<{ invitation: { inviteUrl: string } }>('/api/admin/invitations', {
        method: 'POST', body: JSON.stringify({ email }),
      })
      setInviteUrl(payload.invitation.inviteUrl)
      setNotice('Lien créé. Copiez-le et envoyez-le à cet agent par le canal de votre choix.')
      setEmail('')
      await refresh()
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Impossible de créer le lien.')
    } finally {
      setIsWorking(false)
    }
  }

  const addCommodity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await requestJson('/api/admin/commodities', { method: 'POST', body: JSON.stringify({ name: newCommodity }) })
      setNewCommodity('')
      setNotice('Produit ajouté à la liste des agents.')
      await refresh()
    } catch (commodityError) {
      setError(commodityError instanceof Error ? commodityError.message : 'Impossible d’ajouter ce produit.')
    }
  }

  const updateCollector = async (collector: MarketCollector) => {
    setError('')
    try {
      await requestJson(`/api/admin/collectors/${collector.id}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !collector.isActive }),
      })
      await refresh()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Impossible de modifier le compte.')
    }
  }

  const updateCommodity = async (commodity: MarketCommodity) => {
    setError('')
    try {
      await requestJson(`/api/admin/commodities/${commodity.id}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !commodity.isActive }),
      })
      await refresh()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Impossible de modifier le produit.')
    }
  }

  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNotice('Lien copié. Vous pouvez le coller dans votre email.')
    } catch {
      setNotice('Sélectionnez le lien et copiez-le pour le partager.')
    }
  }

  return (
    <PageLayout title="Prix des marchés" description="Invitez des agents de terrain, gérez les produits suivis et consultez les relevés privés d’Akzem.">
      {error && <div className="form-error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner" role="status">{notice}</div>}

      <section className="stats-grid market-admin-stats" aria-label="Résumé de la collecte">
        <article className="stat-card"><div className="stat-header"><span>Relevés enregistrés</span></div><h3>{observations.length}</h3><p>Données envoyées par les agents</p></article>
        <article className="stat-card"><div className="stat-header"><span>Agents actifs</span></div><h3>{collectors.filter((collector) => collector.isActive).length}</h3><p>Accès autorisés</p></article>
        <article className="stat-card"><div className="stat-header"><span>Liens en attente</span></div><h3>{invitations.length}</h3><p>Expirent après 7 jours</p></article>
        <article className="stat-card"><div className="stat-header"><span>Produits actifs</span></div><h3>{commodities.filter((commodity) => commodity.isActive).length}</h3><p>Choix visibles dans le formulaire</p></article>
      </section>

      <div className="section-grid two-columns market-admin-tools">
        <article className="info-card market-admin-card">
          <div className="panel-header"><div><h3>Inviter un agent</h3><p>Le lien est à usage unique et expire sous 7 jours.</p></div><span className="mini-icon">✉️</span></div>
          <form className="inline-admin-form" onSubmit={(event) => void createInvitation(event)}>
            <label className="field"><span>Email de l’agent</span><input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="agent@exemple.cm" /></label>
            <button className="primary-button" type="submit" disabled={isWorking}>{isWorking ? 'Création…' : 'Créer le lien privé'}</button>
          </form>
          {inviteUrl && <div className="invite-result"><label className="field"><span>Lien à partager par email</span><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></label><button className="secondary-button" type="button" onClick={() => void copyInvitation()}>Copier le lien</button></div>}
          <p className="privacy-note">Chaque agent crée son mot de passe après avoir ouvert son invitation. Aucun accès public ni inscription libre.</p>
        </article>

        <article className="info-card market-admin-card">
          <div className="panel-header"><div><h3>Produits suivis</h3><p>Ajoutez un produit ou désactivez-le pour le retirer du formulaire.</p></div><span className="mini-icon">🥬</span></div>
          <form className="inline-admin-form commodity-create-form" onSubmit={(event) => void addCommodity(event)}>
            <label className="field"><span>Nouveau produit</span><input value={newCommodity} onChange={(event) => setNewCommodity(event.target.value)} maxLength={80} placeholder="Ex. Arachides" /></label>
            <button className="secondary-button" type="submit" disabled={!newCommodity.trim()}>Ajouter</button>
          </form>
          <div className="commodity-admin-list">
            {commodities.map((commodity) => <div className="admin-list-row" key={commodity.id}><span>{commodity.name}</span><button type="button" className={commodity.isActive ? 'mini-toggle on' : 'mini-toggle'} onClick={() => void updateCommodity(commodity)}>{commodity.isActive ? 'Actif' : 'Désactivé'}</button></div>)}
          </div>
        </article>
      </div>

      <article className="info-card collector-admin-card">
        <div className="panel-header"><div><h3>Accès des agents</h3><p>Suspendez immédiatement un accès si nécessaire.</p></div></div>
        {collectors.length > 0 ? <div className="collector-list">{collectors.map((collector) => <div className="collector-row" key={collector.id}><div><strong>{collector.email}</strong><span>{collector.lastLoginAt ? `Dernière connexion : ${formatMarketDate(collector.lastLoginAt)}` : `Invité le ${formatMarketDate(collector.createdAt)}`}</span></div><button type="button" className={collector.isActive ? 'mini-toggle on' : 'mini-toggle'} onClick={() => void updateCollector(collector)}>{collector.isActive ? 'Accès actif' : 'Réactiver'}</button></div>)}</div> : <div className="empty-state-box compact-box"><p>Aucun agent n’a encore activé son invitation.</p></div>}
        {invitations.length > 0 && <div className="pending-invitations"><strong>Invitations en attente</strong>{invitations.map((invitation) => <div className="admin-list-row" key={invitation.email}><span>{invitation.email}</span><small>Expire le {formatMarketDate(invitation.expiresAt)}</small></div>)}</div>}
      </article>

      <article className="info-card observation-admin-card">
        <div className="panel-header"><div><h3>Relevés du terrain</h3><p>Les agents ne voient ni ce tableau ni les relevés des autres agents.</p></div><span className="panel-tag">{observations.length} affiché{observations.length === 1 ? '' : 's'}</span></div>
        {isLoading ? <div className="empty-state-box compact-box"><p>Chargement des relevés…</p></div> : observations.length > 0 ? (
          <div className="table-card report-table-wrap market-observation-wrap"><table className="report-table"><thead><tr><th>Date</th><th>Produit</th><th>Marché / ville</th><th>Disponibilité</th><th>Prix observé</th><th>Agent</th><th>Commentaire</th></tr></thead><tbody>
            {observations.map((observation) => <tr key={observation.id}><td>{formatMarketDate(observation.observedAt)}</td><td>{observation.commodity}</td><td>{observation.marketName}<br /><small>{observation.city}</small></td><td><span className={`badge ${observation.availability === 'available' ? 'success' : 'warning'}`}>{observation.availability === 'available' ? 'Disponible' : 'Indisponible'}</span></td><td>{formatMarketPrice(observation.priceMin, observation.priceMax, observation.priceUnit)}</td><td>{observation.agentEmail}</td><td>{observation.comment || '—'}</td></tr>)}
          </tbody></table></div>
        ) : <div className="empty-state-box compact-box"><p>Aucun relevé reçu. Créez une invitation pour commencer la collecte.</p></div>}
      </article>
    </PageLayout>
  )
}

function AlertsPage({ cropCycles }: { cropCycles: CropMonitoringCycle[] }) {
  const currentCycles = useMemo(() => recalculateCropCycleEstimates(cropCycles), [cropCycles])
  const nearHarvestCycles = currentCycles.filter((cycle) =>
    cycle.estimate.daysRemainingToEarliest <= 7 && cycle.estimate.daysRemainingToLatest >= 0,
  )
  const cyclesWithoutObservedStage = currentCycles.filter((cycle) => !cycle.observedStage)
  const overdueHarvestCycles = currentCycles.filter((cycle) => cycle.estimate.daysRemainingToLatest < 0)
  const marketSignals = useMemo(
    () => analyzeMarketSignals(demoData.prices.map(toPriceObservation)),
    [],
  )

  const recommendations = buildActionRecommendations(
    currentCycles.map((cycle) => ({
      farmerName: cycle.farmerName,
      cropName: cycle.cropName,
      cultivatedArea: cycle.cultivatedArea,
      estimate: {
        daysRemainingToEarliest: cycle.estimate.daysRemainingToEarliest,
        daysRemainingToLatest: cycle.estimate.daysRemainingToLatest,
        currentDevelopmentStage: cycle.estimate.currentDevelopmentStage,
        harvestWindow: cycle.estimate.harvestWindow,
      },
    })),
    marketSignals,
  )

  return (
    <PageLayout title="Analyses et alertes" description="Alertes logiques et suivies de santé opérationnelle de la chaîne agricole de démonstration.">
      <div className="section-grid two-columns">
        <article className="info-card warning-card">
          <h3>Récoltes proches</h3>
          <ul>
            {nearHarvestCycles.length > 0 ? nearHarvestCycles.map((cycle) => (
              <li key={cycle.id}>
                {cycle.cropName} · {cycle.farmerName} : {cycle.estimate.daysRemainingToEarliest <= 0 ? 'récolte possible' : `dans ${cycle.estimate.daysRemainingToEarliest} jours`} ({cycle.estimate.harvestWindow})
              </li>
            )) : <li>Aucune récolte dans les 7 prochains jours.</li>}
          </ul>
        </article>

        <article className="info-card warning-card">
          <h3>Points d’attention</h3>
          <ul>
            <li>{cyclesWithoutObservedStage.length} cycle{cyclesWithoutObservedStage.length === 1 ? '' : 's'} sans stade observé.</li>
            <li>{overdueHarvestCycles.length} fenêtre{overdueHarvestCycles.length === 1 ? '' : 's'} de récolte dépassée{overdueHarvestCycles.length === 1 ? '' : 's'} à vérifier.</li>
          </ul>
        </article>
      </div>

      <div className="section-grid two-columns">
        {recommendations.map((recommendation) => (
          <article className="info-card" key={`${recommendation.cropName}-${recommendation.farmer}`}>
            <div className="card-label-row">
              <span className={`badge ${recommendation.priority === 'high' ? 'success' : recommendation.priority === 'medium' ? 'warning' : 'soft'}`}>
                {recommendation.priority === 'high' ? 'Priorité élevée' : recommendation.priority === 'medium' ? 'Mise en garde' : 'Suivi'}
              </span>
              <span className="mini-icon">⚠️</span>
            </div>
            <h3>{recommendation.title}</h3>
            <p>{recommendation.action}</p>
            <ul>
              <li>Agriculteur : {recommendation.farmer}</li>
              <li>Culture : {recommendation.cropName}</li>
              <li>Motif : {recommendation.reason}</li>
            </ul>
          </article>
        ))}
        {recommendations.length === 0 && <div className="empty-state-box"><p>Aucun cycle cultural à évaluer.</p></div>}
      </div>

      <div className="section-grid two-columns">
        {marketSignals.map((signal) => (
          <article className="info-card" key={`${signal.product}-alert`}>
            <div className="card-label-row">
              <span className={`badge ${signal.trend === 'up' ? 'success' : signal.trend === 'down' ? 'warning' : 'soft'}`}>
                {signal.signalLabel}
              </span>
              <span className="mini-icon">⚠️</span>
            </div>
            <h3>{signal.product}</h3>
            <p>{signal.recommendation}</p>
            <ul>
              <li>Marché : {signal.market}</li>
              <li>Variation : {signal.changePercent > 0 ? '+' : ''}{signal.changePercent}%</li>
              <li>Volatilité : {signal.volatility}</li>
            </ul>
          </article>
        ))}
      </div>
    </PageLayout>
  )
}

function ReportsPage({
  farmers,
  cropCycles,
}: {
  farmers: Farmer[]
  cropCycles: CropMonitoringCycle[]
}) {
  const report = useMemo(() => buildOperationalReport(
    farmers,
    recalculateCropCycleEstimates(cropCycles),
  ), [farmers, cropCycles])

  const downloadCsv = () => {
    const blob = new Blob([`\uFEFF${operationalReportToCsv(report)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `akzem-rapport-operationnel-${formatDateInput(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout title="Rapports" description="Indicateurs opérationnels calculés à partir des agriculteurs et cycles culturaux enregistrés.">
      <div className="report-toolbar">
        <p>{report.cycleCount} cycle{report.cycleCount === 1 ? '' : 's'} analysé{report.cycleCount === 1 ? '' : 's'} · {report.localities.length} localité{report.localities.length === 1 ? '' : 's'}</p>
        <button type="button" className="primary-button" onClick={downloadCsv}>Télécharger CSV</button>
      </div>

      <section className="stats-grid report-stats" aria-label="Indicateurs opérationnels">
        <article className="stat-card tone-green"><div className="stat-header"><span>Agriculteurs actifs</span></div><h3>{report.activeFarmerCount}<small> / {report.farmerCount}</small></h3><p>inscrits au total</p></article>
        <article className="stat-card tone-orange"><div className="stat-header"><span>Surface suivie</span></div><h3>{report.totalAreaHectares.toLocaleString('fr-FR')}<small> ha</small></h3><p>{report.cycleCount} cycles culturaux</p></article>
        <article className="stat-card tone-blue"><div className="stat-header"><span>Production déclarée</span></div><h3>{report.declaredProductionKg.toLocaleString('fr-FR')}<small> kg</small></h3><p>volumes saisis par cycle</p></article>
        <article className="stat-card tone-purple"><div className="stat-header"><span>Récoltes proches</span></div><h3>{report.harvestsWithin30Days}<small> / {report.cycleCount}</small></h3><p>{report.overdueHarvests} fenêtre{report.overdueHarvests === 1 ? '' : 's'} passée{report.overdueHarvests === 1 ? '' : 's'}</p></article>
      </section>

      <div className="section-grid two-columns report-breakdown">
        <article className="info-card">
          <div className="panel-header"><div><h3>Cycles par culture</h3><p>Surfaces et volumes déclarés</p></div></div>
          {report.crops.length > 0 ? (
            <div className="table-card report-table-wrap">
              <table className="report-table"><thead><tr><th>Culture</th><th>Cycles</th><th>Surface</th><th>Production</th></tr></thead>
                <tbody>{report.crops.map((crop) => <tr key={crop.cropName}>
                  <td>{crop.cropName}</td><td>{crop.cycleCount}</td>
                  <td>{crop.areaHectares.toLocaleString('fr-FR')} ha</td>
                  <td>{crop.productionKg.toLocaleString('fr-FR')} kg</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : <div className="empty-state-box compact-box"><p>Aucun cycle cultural enregistré.</p></div>}
        </article>

        <article className="info-card">
          <div className="panel-header"><div><h3>Agriculteurs par localité</h3><p>Répartition des inscriptions enregistrées</p></div></div>
          {report.localities.length > 0 ? (
            <div className="report-localities">{report.localities.map((locality) => (
              <div className="report-locality-row" key={locality.name}>
                <span>{locality.name}</span><strong>{locality.farmerCount}</strong>
              </div>
            ))}</div>
          ) : <div className="empty-state-box compact-box"><p>Aucun agriculteur enregistré.</p></div>}
          <p className="report-coverage">Stade observé renseigné <strong>{report.observedStageCoveragePercent}%</strong> des cycles</p>
        </article>
      </div>

      <article className="info-card report-cycle-section">
        <div className="panel-header"><div><h3>Détail des cycles</h3><p>Fenêtres de récolte recalculées à la date du jour</p></div></div>
        {report.rows.length > 0 ? (
          <div className="table-card report-table-wrap">
            <table className="report-table"><thead><tr><th>Culture</th><th>Agriculteur</th><th>Localité</th><th>Stade observé</th><th>Récolte estimée</th><th>Jours</th></tr></thead>
              <tbody>{report.rows.map((row, index) => <tr key={`${row.cropName}-${row.farmerName}-${index}`}>
                <td>{row.cropName}</td><td>{row.farmerName}</td><td>{row.locality}</td>
                <td>{row.observedStage}</td><td>{row.harvestWindow}</td>
                <td>{row.daysToHarvest < 0 ? 'Dans la fenêtre' : `${row.daysToHarvest} j`}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="empty-state-box compact-box"><p>Aucun détail à afficher.</p></div>}
      </article>
    </PageLayout>
  )
}

function SettingsPage() {
  return (
    <PageLayout title="Paramètres" description="Configuration de base et paramètres d’usage de la plateforme en phase initiale.">
      <div className="section-grid two-columns">
        <article className="info-card">
          <h3>Affichage</h3>
          <ul>
            <li>Langue : Français</li>
            <li>Thème : Vert agricole</li>
            <li>Mode : Bureau et mobile</li>
          </ul>
        </article>

        <article className="info-card">
          <h3>Intégration future</h3>
          <ul>
            <li>Les comptes agents et relevés de prix sont stockés côté serveur.</li>
            <li>Les agents disposent d’une page de collecte séparée.</li>
            <li>Les profils agriculteurs et cycles culturaux restent enregistrés dans ce navigateur.</li>
          </ul>
        </article>
      </div>
    </PageLayout>
  )
}

type AssistantMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
  mode?: 'live' | 'mock'
}

function AiAssistantPage() {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text: 'Bonjour ! Je peux vous aider à réfléchir à vos cultures, aux récoltes et aux pratiques agricoles. Décrivez votre situation ou choisissez une question proposée.',
    },
  ])
  const [query, setQuery] = useState('')
  const [isSending, setIsSending] = useState(false)

  const askAssistant = async (question: string) => {
    const cleanQuestion = question.trim()
    if (!cleanQuestion || isSending) return

    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: cleanQuestion }])
    setQuery('')
    setIsSending(true)
    try {
      const response = await fetch('/api/akzem-intelligence/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuestion }),
      })
      const payload = await response.json() as {
        result?: { answer?: string }
        error?: { message?: string }
        metadata?: { mode?: 'live' | 'mock' }
      }
      if (!response.ok) throw new Error(payload.error?.message ?? 'La demande n’a pas pu être traitée.')
      setMessages((current) => [...current, {
        id: Date.now() + 1,
        role: 'assistant',
        text: payload.result?.answer ?? 'Le service n’a pas renvoyé de réponse.',
        mode: payload.metadata?.mode,
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: Date.now() + 1,
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Impossible de joindre le service. Vérifiez que le serveur est démarré.',
      }])
    } finally {
      setIsSending(false)
    }
  }

  const suggestions = [
    'Comment mieux préparer le sol avant de planter des tomates ?',
    'Quels signes peuvent indiquer un manque d’eau sur mes cultures ?',
    'Comment organiser une récolte prévue dans les prochaines semaines ?',
  ]

  return (
    <PageLayout title="Assistant IA" description="Posez une question agricole et obtenez une première piste de réflexion.">
      <section className="assistant-panel" aria-label="Conversation avec l’assistant Akzem">
        <div className="assistant-status"><span className="status-dot" aria-hidden="true" /> Service Akzem Intelligence</div>
        <div className="assistant-messages" aria-live="polite" aria-relevant="additions text">
          {messages.map((message) => (
            <article className={`assistant-message ${message.role}`} key={message.id}>
              <div className="assistant-message-label">{message.role === 'user' ? 'Vous' : 'Akzem Intelligence'}</div>
              <p>{message.text}</p>
              {message.mode === 'mock' && <small>Réponse de démonstration — modèle IA non configuré</small>}
              {message.mode === 'live' && <small>Réponse du modèle IA</small>}
            </article>
          ))}
          {isSending && <p className="assistant-loading" role="status">Akzem prépare une réponse…</p>}
        </div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void askAssistant(query) }}>
          <label className="sr-only" htmlFor="assistant-query">Votre question</label>
          <textarea
            id="assistant-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. Comment prévenir les maladies des tomates ?"
            maxLength={4000}
            rows={3}
            disabled={isSending}
          />
          <div className="assistant-composer-footer">
            <span>Les réponses sont indicatives. Vérifiez les conseils importants auprès d’un spécialiste local.</span>
            <button className="primary-button" type="submit" disabled={isSending || !query.trim()}>
              {isSending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
        <div className="assistant-suggestions" aria-label="Questions suggérées">
          {suggestions.map((suggestion) => (
            <button type="button" className="secondary-button" key={suggestion} disabled={isSending} onClick={() => void askAssistant(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </section>
    </PageLayout>
  )
}

function AdminLogin({
  user,
  onSignIn,
  onSignOut,
}: {
  user: SignedInUser | null
  onSignIn: (user: SignedInUser) => void
  onSignOut: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminConfigured, setAdminConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    requestJson<{ adminConfigured: boolean }>('/api/auth/status')
      .then((payload) => setAdminConfigured(payload.adminConfigured))
      .catch(() => setAdminConfigured(false))
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const payload = await requestJson<{ user: SignedInUser }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password, area: 'admin' }),
      })
      onSignIn(payload.user)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Connexion impossible.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">A</div><div><strong>Akzem</strong><span>INTELLIGENCE</span></div></div>
        <p className="eyebrow">ESPACE ADMINISTRATEUR</p>
        <h1>Connectez-vous à Akzem.</h1>
        <p className="auth-description">Les prix du terrain, les agents et les rapports sont réservés à l’équipe Akzem.</p>
        {user?.role === 'agent' ? (
          <div className="setup-message"><p>Cette session est un compte agent. Les agents n’ont pas accès à l’espace administrateur.</p><button type="button" className="secondary-button" onClick={() => void onSignOut()}>Changer de compte</button></div>
        ) : adminConfigured === false ? (
          <div className="setup-message"><h2>Configurez le premier administrateur</h2><p>Dans le fichier <code>.env</code> du projet, définissez <code>AKZEM_ADMIN_EMAIL</code> et un mot de passe de 16 caractères ou plus, puis redémarrez le serveur.</p></div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label className="field"><span>Email administrateur</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label className="field"><span>Mot de passe</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Connexion…' : 'Ouvrir le tableau de bord'}</button>
          </form>
        )}
        <a className="auth-agent-link" href="/collect">Vous êtes agent de terrain ? Accéder à votre page privée <span aria-hidden="true">↗</span></a>
      </section>
    </main>
  )
}

function CollectorPortal() {
  const [user, setUser] = useState<SignedInUser | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [commodities, setCommodities] = useState<Array<{ id: number; name: string }>>([])
  const [commodityId, setCommodityId] = useState('')
  const [marketName, setMarketName] = useState('')
  const [city, setCity] = useState('')
  const [availability, setAvailability] = useState<'available' | 'unavailable'>('available')
  const [priceMode, setPriceMode] = useState<'single' | 'range'>('single')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [priceUnit, setPriceUnit] = useState('kg')
  const [comment, setComment] = useState('')

  useEffect(() => {
    let mounted = true
    const checkSession = async () => {
      try {
        const payload = await requestJson<{ user: SignedInUser }>('/api/auth/me')
        if (mounted) setUser(payload.user)
      } catch {
        if (mounted) setUser(null)
      }
      if (inviteToken) {
        try {
          const payload = await requestJson<{ invitation: { email: string } }>(`/api/collector/invitations/${encodeURIComponent(inviteToken)}`)
          if (mounted) { setInviteEmail(payload.invitation.email); setInviteError('') }
        } catch (inviteLookupError) {
          if (mounted) setInviteError(inviteLookupError instanceof Error ? inviteLookupError.message : 'Cette invitation est invalide ou expirée.')
        }
      }
      if (mounted) setIsChecking(false)
    }
    void checkSession()
    return () => { mounted = false }
  }, [inviteToken])

  useEffect(() => {
    if (user?.role !== 'agent') return
    let mounted = true
    requestJson<{ commodities: Array<{ id: number; name: string }> }>('/api/collector/commodities')
      .then((payload) => { if (mounted) { setCommodities(payload.commodities); setCommodityId(String(payload.commodities[0]?.id ?? '')) } })
      .catch((loadError: unknown) => { if (mounted) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les produits.') })
    return () => { mounted = false }
  }, [user])

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
    setNotice('Vous êtes déconnecté.')
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const payload = await requestJson<{ user: SignedInUser }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password, area: 'agent' }),
      })
      setUser(payload.user)
      setPassword('')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Connexion impossible.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const acceptInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password !== passwordConfirm) return setError('Les deux mots de passe ne correspondent pas.')
    setIsSubmitting(true)
    try {
      const payload = await requestJson<{ user: SignedInUser }>('/api/collector/accept-invitation', {
        method: 'POST', body: JSON.stringify({ token: inviteToken, password }),
      })
      setUser(payload.user)
      setInviteToken('')
      setPassword('')
      setPasswordConfirm('')
      window.history.replaceState(null, '', '/collect')
      setNotice('Votre accès est activé. Vous pouvez maintenant envoyer un relevé.')
    } catch (inviteAcceptError) {
      setError(inviteAcceptError instanceof Error ? inviteAcceptError.message : 'Impossible d’activer le compte.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitObservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      await requestJson('/api/collector/observations', {
        method: 'POST',
        body: JSON.stringify({
          commodityId: Number(commodityId), marketName, city, availability,
          priceMin: availability === 'available' ? priceMin : null,
          priceMax: availability === 'available' && priceMode === 'range' ? priceMax : priceMin,
          priceUnit: availability === 'available' ? priceUnit : null,
          comment,
        }),
      })
      setNotice('Relevé enregistré. Merci pour la mise à jour du terrain !')
      setPriceMin('')
      setPriceMax('')
      setComment('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Le relevé n’a pas pu être enregistré.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isChecking) return <div className="auth-loading-screen">Akzem Intelligence</div>
  if (user?.role === 'admin') {
    return <main className="auth-page"><section className="auth-card"><p className="eyebrow">ACCÈS AGENT</p><h1>Cette page est réservée aux agents de terrain.</h1><p className="auth-description">La session actuelle est un compte administrateur. L’espace d’administration est séparé de la page de collecte.</p><a className="primary-button auth-action-link" href="/">Retour à l’administration</a></section></main>
  }

  return (
    <main className="collector-page">
      <header className="collector-topbar"><a href="/" className="collector-brand"><span className="brand-mark">A</span><span><strong>Akzem</strong><small>COLLECTE TERRAIN</small></span></a>{user && <button type="button" className="secondary-button" onClick={() => void handleSignOut()}>Déconnexion</button>}</header>
      {!user ? (
        <section className="collector-auth-card">
          <p className="eyebrow">ESPACE PRIVÉ</p>
          <h1>Relevés de marché</h1>
          <p className="auth-description">Une page simple pour transmettre les prix observés. Les données et les autres sections d’Akzem ne sont pas accessibles depuis cet espace.</p>
          {inviteToken ? (
            <>
              <div className="invited-email"><span>Invitation envoyée à</span><strong>{inviteEmail || 'Vérification…'}</strong></div>
              {inviteError && <p className="auth-error" role="alert">{inviteError}</p>}
              {!inviteError && inviteEmail && <form className="auth-form" onSubmit={(event) => void acceptInvitation(event)}>
                <label className="field"><span>Créer votre mot de passe</span><input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <label className="field"><span>Confirmer le mot de passe</span><input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></label>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Activation…' : 'Activer mon accès'}</button>
              </form>}
              <p className="privacy-note">Choisissez au moins 12 caractères. Le lien ne peut être utilisé qu’une fois.</p>
            </>
          ) : (
            <form className="auth-form" onSubmit={(event) => void handleLogin(event)}>
              <label className="field"><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="field"><span>Mot de passe</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Connexion…' : 'Ouvrir le formulaire de collecte'}</button>
            </form>
          )}
          <a className="auth-agent-link" href="/">Espace administrateur Akzem <span aria-hidden="true">↗</span></a>
        </section>
      ) : (
        <section className="collector-form-card">
          <div className="collector-welcome"><p className="eyebrow">RELEVÉ DE MARCHÉ</p><h1>Bonjour, {user.email}</h1><p>Renseignez ce que vous observez aujourd’hui. Le relevé sera transmis à l’équipe Akzem.</p></div>
          {error && <div className="form-error-banner" role="alert">{error}</div>}
          {notice && <div className="success-banner" role="status">{notice}</div>}
          <form className="collector-observation-form" onSubmit={(event) => void submitObservation(event)}>
            <div className="form-grid">
              <label className="field"><span>Produit observé</span><select required value={commodityId} onChange={(event) => setCommodityId(event.target.value)}>{commodities.map((commodity) => <option key={commodity.id} value={commodity.id}>{commodity.name}</option>)}</select></label>
              <label className="field"><span>Ville</span><input required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex. Douala" /></label>
              <label className="field full-width"><span>Nom du marché</span><input required minLength={2} maxLength={120} value={marketName} onChange={(event) => setMarketName(event.target.value)} placeholder="Ex. Marché Central" /></label>
            </div>
            <fieldset className="availability-fieldset"><legend>Le produit est-il disponible sur ce marché ?</legend><label><input type="radio" name="availability" checked={availability === 'available'} onChange={() => setAvailability('available')} /> Disponible</label><label><input type="radio" name="availability" checked={availability === 'unavailable'} onChange={() => setAvailability('unavailable')} /> Indisponible</label></fieldset>
            {availability === 'available' && <>
              <fieldset className="availability-fieldset"><legend>Comment souhaitez-vous saisir le prix ?</legend><label><input type="radio" name="price-mode" checked={priceMode === 'single'} onChange={() => setPriceMode('single')} /> Prix observé</label><label><input type="radio" name="price-mode" checked={priceMode === 'range'} onChange={() => setPriceMode('range')} /> Fourchette de prix</label></fieldset>
              <div className="form-grid price-entry-grid">
                <label className="field"><span>{priceMode === 'range' ? 'Prix minimum (FCFA)' : 'Prix observé (FCFA)'}</span><input type="number" inputMode="numeric" min="1" max="10000000" step="1" required value={priceMin} onChange={(event) => setPriceMin(event.target.value)} /></label>
                {priceMode === 'range' && <label className="field"><span>Prix maximum (FCFA)</span><input type="number" inputMode="numeric" min="1" max="10000000" step="1" required value={priceMax} onChange={(event) => setPriceMax(event.target.value)} /></label>}
                <label className="field"><span>Unité de vente</span><select value={priceUnit} onChange={(event) => setPriceUnit(event.target.value)}><option value="kg">Par kilogramme</option><option value="tas">Par tas</option><option value="sac">Par sac</option><option value="panier">Par panier</option><option value="botte">Par botte</option><option value="tas de 5">Par tas de 5</option><option value="autre">Autre unité</option></select></label>
              </div>
            </>}
            <label className="field"><span>Commentaire de terrain <small>(facultatif)</small></span><textarea rows={4} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Qualité, variation inhabituelle, disponibilité…" /></label>
            <button type="submit" className="primary-button submit-observation-button" disabled={isSubmitting || !commodityId}>{isSubmitting ? 'Enregistrement…' : 'Envoyer le relevé'}</button>
          </form>
          <p className="privacy-note collector-privacy-note">Vos relevés sont visibles uniquement par les administrateurs Akzem. Les autres agents ne voient pas vos informations.</p>
        </section>
      )}
    </main>
  )
}

function App() {
  const collectorRoute = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/collect'
  return collectorRoute ? <CollectorPortal /> : <AdminApp />
}

export default App
