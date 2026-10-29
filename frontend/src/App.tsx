import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coins,
  ExternalLink,
  House,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  Phone,
  Plus,
  Recycle,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'

type Role = 'Nasabah' | 'Petugas' | 'Admin'
type Page = 'Dashboard' | 'Setoran' | 'Riwayat' | 'Tukar poin' | 'Analitik' | 'Pengguna' | 'Profil'
type TransactionStatus = 'Menunggu' | 'Dijadwalkan' | 'Dijemput' | 'Selesai' | 'Dibatalkan'
type WasteType = 'Plastik' | 'Kertas' | 'Logam' | 'Kaca' | 'Organik'
type WhatsappNotificationStatus = 'sent' | 'not_configured' | 'missing_phone' | 'invalid_phone' | 'failed'
type AuthUser = {
  id: number
  name: string
  email: string
  phone?: string
  address?: string
  role: 'admin' | 'petugas' | 'nasabah'
  balancePoints: number
}
type ApiPickup = {
  transaction_id: number
  customer_name: string
  customer_phone: string | null
  pickup_date: string
  pickup_address: string
  status: 'pending' | 'assigned' | 'picked_up' | 'completed' | 'cancelled'
  total_points: number | string
  weight_kg: number | string
  waste_type: WasteType | null
}

type Transaction = {
  id: string
  waste: WasteType
  weight: number
  points: number
  date: string
  status: TransactionStatus
  address: string
  customerName: string
  customerPhone: string | null
}

type AppNotification = {
  key: string
  title: string
  message: string
  date: string
  icon: 'check' | 'truck' | 'pickup'
}

type Reward = {
  id: string
  name: string
  description: string
  points: number
  icon: LucideIcon
  color: string
  amount: string
}

const pointRate: Record<WasteType, number> = {
  Plastik: 120,
  Kertas: 85,
  Logam: 240,
  Kaca: 65,
  Organik: 35,
}

const rewards: Reward[] = [
  { id: 'wallet-10', name: 'Saldo e-wallet', description: 'Transfer ke e-wallet pilihanmu', points: 2500, icon: Wallet, color: 'mint', amount: 'Rp 10.000' },
  { id: 'wallet-25', name: 'Saldo e-wallet', description: 'Transfer ke e-wallet pilihanmu', points: 6000, icon: Wallet, color: 'gold', amount: 'Rp 25.000' },
  { id: 'groceries', name: 'Voucher belanja', description: 'Berlaku di mitra pilihan', points: 4000, icon: PackageCheck, color: 'coral', amount: 'Rp 20.000' },
]

const navItems: { label: Page; icon: LucideIcon }[] = [
  { label: 'Dashboard', icon: House },
  { label: 'Setoran', icon: Truck },
  { label: 'Riwayat', icon: Clock3 },
  { label: 'Tukar poin', icon: Coins },
  { label: 'Analitik', icon: Leaf },
  { label: 'Pengguna', icon: Users },
]

const weekBars = [
  { day: 'Sen', value: 44 },
  { day: 'Sel', value: 67 },
  { day: 'Rab', value: 53 },
  { day: 'Kam', value: 82 },
  { day: 'Jum', value: 58 },
  { day: 'Sab', value: 94 },
  { day: 'Min', value: 71 },
]

function roleLabel(role: AuthUser['role']): Role {
  return role === 'admin' ? 'Admin' : role === 'petugas' ? 'Petugas' : 'Nasabah'
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

function mapPickup(pickup: ApiPickup): Transaction {
  const status: Record<ApiPickup['status'], TransactionStatus> = {
    pending: 'Menunggu',
    assigned: 'Dijadwalkan',
    picked_up: 'Dijemput',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
  }
  return {
    id: `WT-${pickup.transaction_id}`,
    customerName: pickup.customer_name,
    customerPhone: pickup.customer_phone,
    waste: pickup.waste_type ?? 'Plastik',
    weight: Number(pickup.weight_kg),
    points: Number(pickup.total_points),
    date: pickup.pickup_date.slice(0, 10),
    status: status[pickup.status],
    address: pickup.pickup_address,
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

function whatsappNotificationNotice(status: WhatsappNotificationStatus | undefined) {
  if (status === 'sent') return 'WhatsApp terkirim.'
  if (status === 'not_configured') return 'Fonnte belum dikonfigurasi.'
  if (status === 'missing_phone') return 'Nomor telepon belum diisi di profil.'
  if (status === 'invalid_phone') return 'Nomor telepon di profil tidak valid.'
  return 'WhatsApp gagal dikirim.'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function googleMapsDirectionsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
}

function StatusPill({ status }: { status: TransactionStatus }) {
  const statusClass = status.toLowerCase().replace(' ', '-')
  return <span className={`status-pill status-${statusClass}`}><i />{status}</span>
}

function App() {
  const [page, setPage] = useState<Page>('Dashboard')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(() => Boolean(sessionStorage.getItem('wastetrack-session')))
  const [authError, setAuthError] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState(0)
  const [modal, setModal] = useState<'pickup' | 'redeem' | null>(null)
  const [redemptionSubmitting, setRedemptionSubmitting] = useState(false)
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', address: '' })
  const [selectedReward, setSelectedReward] = useState<Reward>(rewards[0])
  const [waste, setWaste] = useState<WasteType>('Plastik')
  const [weight, setWeight] = useState('3')
  const [pickupDate, setPickupDate] = useState('2026-10-05')
  const [pickupAddress, setPickupAddress] = useState('Jl. Melati No. 24, Sukamaju')
  const [toast, setToast] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [readNotifications, setReadNotifications] = useState<{ userId: number; keys: string[] } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [search, setSearch] = useState('')

  function restoreUser(nextUser: AuthUser) {
    setBalance(nextUser.balancePoints)
    setTransactions([])
    setUser(nextUser)
    setProfileForm({
      name: nextUser.name,
      email: nextUser.email,
      phone: nextUser.phone ?? '',
      address: nextUser.address ?? '',
    })
  }

  async function refreshAccountData() {
    const token = sessionStorage.getItem('wastetrack-session')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const [pickupsResponse, summaryResponse] = await Promise.all([
      fetch('/api/pickups', { headers }),
      fetch('/api/dashboard/summary', { headers }),
    ])
    const [pickupsBody, summaryBody] = await Promise.all([pickupsResponse.json(), summaryResponse.json()])
    if (!pickupsResponse.ok) throw new Error(pickupsBody.error || 'Daftar setoran tidak dapat dimuat.')
    if (!summaryResponse.ok) throw new Error(summaryBody.error || 'Ringkasan akun tidak dapat dimuat.')
    setTransactions((pickupsBody.data as ApiPickup[]).map(mapPickup))
    setBalance(Number(summaryBody.data.balance_points))
  }

  useEffect(() => {
    if (!user) return
    let active = true
    refreshAccountData().catch((error: unknown) => {
      if (active) setToast(error instanceof Error ? error.message : 'Data akun tidak dapat dimuat.')
    })
    const interval = window.setInterval(() => {
      refreshAccountData().catch((error: unknown) => {
        if (active) setToast(error instanceof Error ? error.message : 'Notifikasi tidak dapat diperbarui.')
      })
    }, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [user])

  useEffect(() => {
    const token = sessionStorage.getItem('wastetrack-session')
    if (!token) return
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Sesi tidak dapat diverifikasi.')
        restoreUser(body.data.user as AuthUser)
      })
      .catch((error: unknown) => {
        sessionStorage.removeItem('wastetrack-session')
        setAuthError(error instanceof Error ? error.message : 'Sesi tidak dapat diverifikasi.')
      })
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const completed = transactions.filter((item) => item.status === 'Selesai')
  const totalWeight = completed.reduce((total, item) => total + item.weight, 0)
  const filteredTransactions = transactions.filter((item) => {
    const query = search.trim().toLowerCase()
    return !query || `${item.id} ${item.waste} ${item.status} ${item.customerName} ${item.customerPhone ?? ''}`.toLowerCase().includes(query)
  })
  const estimatedPoints = Math.round((Number(weight) || 0) * pointRate[waste])

  function openReward(reward: Reward) {
    setSelectedReward(reward)
    setModal('redeem')
  }

  async function submitPickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const token = sessionStorage.getItem('wastetrack-session')
      const categoriesResponse = await fetch('/api/categories')
      const categoriesBody = await categoriesResponse.json()
      if (!categoriesResponse.ok) throw new Error(categoriesBody.error || 'Kategori sampah tidak dapat dimuat.')
      const category = categoriesBody.data.find((item: { category_name: string }) => item.category_name === waste)
      if (!category) throw new Error('Kategori sampah tidak ditemukan.')
      const response = await fetch('/api/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pickupDate,
          pickupAddress,
          details: [{ categoryId: category.category_id, weightKg: Number(weight) }],
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Permintaan penjemputan tidak dapat dibuat.')
      await refreshAccountData()
      setModal(null)
      setPage('Setoran')
      setToast(`Permintaan jemput berhasil dibuat. ${whatsappNotificationNotice(body.data.notification)}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Permintaan penjemputan tidak dapat dibuat.')
    }
  }

  async function submitRedemption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (redemptionSubmitting) return
    setRedemptionSubmitting(true)
    try {
      const response = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('wastetrack-session')}`,
        },
        body: JSON.stringify({ rewardId: selectedReward.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Penukaran poin tidak dapat diproses.')
      await refreshAccountData()
      setModal(null)
      setToast(`${selectedReward.name} berhasil ditukar`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Penukaran poin tidak dapat diproses.')
    } finally {
      setRedemptionSubmitting(false)
    }
  }

  async function handleTransactionAction(transaction: Transaction) {
    if (role === 'Petugas') {
      const nextStatus: Partial<Record<TransactionStatus, TransactionStatus>> = {
        Menunggu: 'Dijadwalkan',
        Dijadwalkan: 'Dijemput',
      }
      const status = nextStatus[transaction.status]
      if (status) {
        try {
          const token = sessionStorage.getItem('wastetrack-session')
          const response = await fetch(`/api/pickups/${transaction.id.slice(3)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: status === 'Dijadwalkan' ? 'assigned' : 'picked_up' }),
          })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error || 'Status setoran tidak dapat diperbarui.')
          await refreshAccountData()
          setToast(`${transaction.id} diperbarui menjadi ${status.toLowerCase()}. ${whatsappNotificationNotice(body.data.notification)}`)
        } catch (error) {
          setToast(error instanceof Error ? error.message : 'Status setoran tidak dapat diperbarui.')
        }
      } else {
        setToast(`${transaction.id} menunggu validasi admin`)
      }
      return
    }
    if (role === 'Admin' && transaction.status === 'Dijemput') {
      try {
        const token = sessionStorage.getItem('wastetrack-session')
        const response = await fetch(`/api/pickups/${transaction.id.slice(3)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'completed' }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Setoran tidak dapat divalidasi.')
        await refreshAccountData()
        setToast(`${transaction.id} divalidasi, ${formatNumber(transaction.points)} poin ditambahkan. ${whatsappNotificationNotice(body.data.notification)}`)
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Setoran tidak dapat divalidasi.')
      }
      return
    }
    setToast(`${transaction.id} · ${transaction.address}`)
  }

  function handleAuthenticated(nextUser: AuthUser, token: string) {
    sessionStorage.setItem('wastetrack-session', token)
    restoreUser(nextUser)
    setAuthError('')
  }

  function openProfile() {
    if (!user) return
    setProfileForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      address: user.address ?? '',
    })
    setPage('Profil')
    setMobileNavOpen(false)
  }

  async function signOut() {
    const token = sessionStorage.getItem('wastetrack-session')
    try {
      if (token) {
        const response = await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error('Sesi tidak dapat ditutup. Periksa koneksi lalu coba kembali.')
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Sesi tidak dapat ditutup.')
      return
    }
    sessionStorage.removeItem('wastetrack-session')
    setUser(null)
    setPage('Dashboard')
    setModal(null)
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || profileSubmitting) return
    setProfileSubmitting(true)
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('wastetrack-session') ?? ''}`,
        },
        body: JSON.stringify({
          name: profileForm.name,
          email: profileForm.email,
          phone: profileForm.phone,
          address: profileForm.address,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Profil tidak dapat disimpan.')
      restoreUser(body.data.user as AuthUser)
      setToast('Profil berhasil diperbarui')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Profil tidak dapat disimpan.')
    } finally {
      setProfileSubmitting(false)
    }
  }

  const role = user ? roleLabel(user.role) : 'Nasabah'
  const notifications: AppNotification[] = transactions.flatMap((transaction) => {
    const status = transaction.status
    if (role === 'Petugas' && status !== 'Menunggu' && status !== 'Dijadwalkan' && status !== 'Dijemput') return []
    if (role === 'Admin' && status !== 'Dijemput') return []
    const title = role === 'Nasabah'
      ? ({
          Menunggu: 'Permintaan penjemputan diterima',
          Dijadwalkan: 'Petugas ditugaskan',
          Dijemput: 'Sampah telah dijemput',
          Selesai: 'Setoran selesai',
          Dibatalkan: 'Penjemputan dibatalkan',
        } satisfies Record<TransactionStatus, string>)[status]
      : role === 'Admin'
        ? 'Setoran menunggu validasi'
        : ({
            Menunggu: 'Penjemputan baru tersedia',
            Dijadwalkan: 'Penjemputan ditugaskan',
            Dijemput: 'Setoran siap ditindaklanjuti',
          } as Partial<Record<TransactionStatus, string>>)[status]
    if (!title) return []
    const message = role === 'Nasabah'
      ? status === 'Selesai'
        ? `${transaction.id} · ${formatNumber(transaction.points)} poin ditambahkan`
        : `${transaction.id} · ${transaction.address}`
      : `${transaction.id} · ${transaction.address}`
    const notification: AppNotification = {
      key: `${transaction.id}-${status}`,
      title,
      message,
      date: formatDate(transaction.date),
      icon: status === 'Selesai' ? 'check' : status === 'Dijemput' ? 'truck' : 'pickup',
    }
    return [notification]
  }).slice(0, 12)
  const currentReadKeys = user
    ? readNotifications?.userId === user.id
      ? readNotifications.keys
      : (localStorage.getItem(`wastetrack-notifications-read-${user.id}`) ?? '').split(',').filter(Boolean)
    : []
  const unreadNotificationCount = notifications.filter((notification) => !currentReadKeys.includes(notification.key)).length
  function toggleNotifications() {
    if (!notificationsOpen && user) {
      const keys = [...new Set([...currentReadKeys, ...notifications.map((notification) => notification.key)])]
      localStorage.setItem(`wastetrack-notifications-read-${user.id}`, keys.join(','))
      setReadNotifications({ userId: user.id, keys })
    }
    setNotificationsOpen((open) => !open)
  }
  const pageTitle = page
  if (authLoading) return <div className="auth-loading" role="status">Memeriksa sesi WasteTrack…</div>
  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} initialError={authError} />
  const visibleNavItems = navItems.filter(({ label }) => {
    if (role === 'Nasabah') return label !== 'Pengguna'
    if (role === 'Petugas') return label !== 'Tukar poin' && label !== 'Pengguna' && label !== 'Riwayat'
    return label !== 'Tukar poin' && label !== 'Riwayat'
  })

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setPage('Dashboard') }}>
          <span className="brand-mark"><Recycle size={21} strokeWidth={2.2} /></span>
          <span>waste<span className="brand-light">track</span></span>
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">RUANG KERJAMU</div>
        <nav className="primary-nav" aria-label="Navigasi utama">
          {visibleNavItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-link ${page === label ? 'nav-link-active' : ''}`} onClick={() => { setPage(label); setMobileNavOpen(false) }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Setoran' && transactions.some((item) => item.status === 'Menunggu') && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="impact-card">
            <span className="impact-icon"><Sparkles size={16} /></span>
            <p>{role === 'Nasabah' ? 'Jejak baikmu' : role === 'Petugas' ? 'Tugas aktif' : 'Pengelolaan'}</p>
            <strong>{role === 'Nasabah' ? totalWeight.toFixed(1) : transactions.filter((item) => item.status !== 'Selesai').length} <small>{role === 'Nasabah' ? 'kg' : 'tugas'}</small></strong>
            <span>{role === 'Nasabah' ? 'sampah sudah terselamatkan' : role === 'Petugas' ? 'menunggu tindak lanjut' : 'ringkasan operasional'}</span>
            <div className="impact-track"><i style={{ width: `${Math.min(100, totalWeight * 4)}%` }} /></div>
          </div>
          <button className="sidebar-help" onClick={() => setToast('Tim bantuan siap membantu melalui akun terdaftarmu')}><CircleHelp size={17} />Pusat bantuan<ArrowRight size={15} /></button>
          <div className="profile-mini">
            <button className="profile-mini-button" type="button" onClick={openProfile} aria-label="Buka profil" title="Buka profil">
              <div className="avatar avatar-small">{initials(user.name)}</div>
              <div className="profile-copy"><strong>{user.name}</strong><span>{role}</span></div>
            </button>
            <button className="icon-button profile-more" aria-label="Keluar" title="Keluar" onClick={() => void signOut()}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Buka menu" onClick={() => setMobileNavOpen((open) => !open)}><Menu size={20} /></button>
            <div className="breadcrumbs"><span>WasteTrack</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="role-badge"><ShieldCheck size={14} />{role}</span>
            <div className="notification-wrap">
              <button className="icon-button notification-button" aria-label={`Notifikasi${unreadNotificationCount ? `, ${unreadNotificationCount} belum dibaca` : ''}`} aria-expanded={notificationsOpen} title="Notifikasi" onClick={toggleNotifications}><Bell size={18} />{unreadNotificationCount > 0 && <span className="notification-count">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span>}</button>
              {notificationsOpen && <div className="notification-popover"><div className="popover-heading"><strong>Notifikasi</strong><span>{unreadNotificationCount ? `${unreadNotificationCount} belum dibaca` : 'Semua sudah dibaca'}</span></div><div className="notification-list">{notifications.length ? notifications.map((notification) => <article className={`notification-item ${currentReadKeys.includes(notification.key) ? '' : 'notification-unread'}`} key={notification.key}><span className={`notification-icon ${notification.icon === 'truck' ? 'notification-warm' : ''}`}>{notification.icon === 'check' ? <Check size={15} /> : notification.icon === 'truck' ? <Truck size={15} /> : <CalendarDays size={15} />}</span><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{notification.date}</small></div></article>) : <p className="notification-empty">Belum ada notifikasi setoran.</p>}</div></div>}
            </div>
            <button className="avatar avatar-top profile-top-button" type="button" onClick={openProfile} aria-label="Buka profil">{initials(user.name)}</button>
          </div>
        </header>

        <div className="content-wrap">
          {page === 'Dashboard' && <>
            <section className="page-heading">
              <div><span className="eyebrow"><span className="eyebrow-dot" /> {role === 'Nasabah' ? 'RUANG NASABAH' : role === 'Petugas' ? 'RUANG PETUGAS' : 'RUANG ADMIN'}</span><h1>{role === 'Nasabah' ? `Halo, ${user.name.split(' ')[0]}` : `Selamat datang, ${user.name.split(' ')[0]}`} <span className="wave">✳</span></h1><p>{role === 'Nasabah' ? 'Hari yang baik untuk membuat perubahan kecil.' : role === 'Petugas' ? 'Kelola penjemputan dan perbarui progres tugas.' : 'Pantau operasional dan kelola akun WasteTrack.'}</p></div>
              {role === 'Nasabah' && <button className="button button-primary" onClick={() => setModal('pickup')}><Plus size={17} />Jadwalkan jemput</button>}
            </section>

            {role === 'Nasabah' ? <>
            <section className="welcome-banner">
              <div className="welcome-copy"><span className="welcome-label"><Leaf size={14} /> LANGKAH KECIL, DAMPAK BESAR</span><h2>Sudah jadi bagian dari<br />perubahan yang berarti.</h2><p>Setiap kilogram sampah yang kamu pilah, punya cerita baru.</p><button className="text-button" onClick={() => setPage('Analitik')}>Lihat dampakmu <ArrowRight size={16} /></button></div>
              <div className="banner-stat"><span>JEJAK BAIK TOTAL</span><strong>{totalWeight.toFixed(1)}<small>kg</small></strong><div className="banner-progress"><i style={{ width: `${Math.min(100, totalWeight * 4)}%` }} /></div><small className="banner-caption">Target bulan ini <b>30 kg</b></small></div>
              <div className="banner-illustration" aria-hidden="true"><span className="sun-disc" /><span className="banner-ring ring-one" /><span className="banner-ring ring-two" /><Leaf className="banner-leaf leaf-one" size={56} /><Leaf className="banner-leaf leaf-two" size={38} /><span className="banner-spark spark-one">+</span><span className="banner-spark spark-two">+</span></div>
            </section>

            <section className="stats-grid" aria-label="Ringkasan akun">
              <article className="stat-card points-stat"><div className="stat-top"><span>Poin tersedia</span><span className="stat-icon icon-mint"><Coins size={17} /></span></div><strong>{formatNumber(balance)}</strong><div className="stat-foot"><span className="trend trend-up"><ArrowUpRight size={14} /> +12%</span><span>dari bulan lalu</span></div><span className="stat-watermark">✳</span></article>
              <article className="stat-card"><div className="stat-top"><span>Total setoran</span><span className="stat-icon icon-lime"><Recycle size={17} /></span></div><strong>{transactions.length}<small> kali</small></strong><div className="stat-foot"><span className="trend trend-up"><ArrowUpRight size={14} /> +3</span><span>setoran bulan ini</span></div></article>
              <article className="stat-card"><div className="stat-top"><span>Sampah terpilah</span><span className="stat-icon icon-peach"><PackageCheck size={17} /></span></div><strong>{totalWeight.toFixed(1)}<small> kg</small></strong><div className="stat-foot"><span className="trend trend-up"><ArrowUpRight size={14} /> +18%</span><span>dibanding bulan lalu</span></div></article>
              <article className="stat-card"><div className="stat-top"><span>Dalam perjalanan</span><span className="stat-icon icon-gold"><Truck size={17} /></span></div><strong>{transactions.filter((item) => item.status !== 'Selesai').length}<small> aktif</small></strong><div className="stat-foot"><span className="neutral-note"><Clock3 size={13} /> Pembaruan langsung</span></div></article>
            </section>

            <section className="insights-grid">
              <article className="panel chart-panel">
                <div className="panel-heading"><div><span className="section-kicker">PERJALANANMU</span><h2>Setoran minggu ini</h2></div><button className="period-select" onClick={() => setToast('Periode yang ditampilkan: 7 hari terakhir')}>7 hari terakhir <ChevronDown size={14} /></button></div>
                <div className="chart-summary"><strong>12,4 <small>kg</small></strong><span className="chart-change"><ArrowUpRight size={14} /> 8,2% <span>vs minggu lalu</span></span></div>
                <div className="bar-chart" role="img" aria-label="Grafik setoran 7 hari terakhir"><div className="chart-guides"><i /><i /><i /><i /></div>{weekBars.map((bar) => <div className="chart-column" key={bar.day}><div className="bar-outer"><div className={`chart-bar ${bar.day === 'Sab' ? 'bar-highlight' : ''}`} style={{ height: `${bar.value}%` }} /></div><span>{bar.day}</span></div>)}</div>
                <div className="chart-legend"><span><i /> Berat sampah</span><span className="chart-note">Paling aktif: Sabtu <b>3,2 kg</b></span></div>
              </article>
              <article className="panel goal-panel"><div className="panel-heading"><div><span className="section-kicker">KONSISTENSI</span><h2>Target bulanan</h2></div><button className="icon-button subtle-icon" title="Informasi target" aria-label="Informasi target" onClick={() => setToast('Target bulanan membantumu memilah lebih konsisten')}><CircleHelp size={16} /></button></div><div className="goal-visual"><div className="goal-ring" style={{ background: `conic-gradient(#83a953 0deg, #83a953 ${Math.min(100, totalWeight / 30 * 100) * 3.6}deg, #eef2eb ${Math.min(100, totalWeight / 30 * 100) * 3.6}deg, #eef2eb 360deg)` }}><div><strong>{Math.min(100, Math.round(totalWeight / 30 * 100))}%</strong><span>tercapai</span></div></div><div className="goal-copy"><strong>{totalWeight.toFixed(1)}<small> / 30 kg</small></strong><span>menuju target</span></div></div><div className="goal-footer"><span><i /> Bulan ini</span><strong>{completed.length} setoran selesai</strong></div><div className="goal-message"><span>✦</span><p>Butuh <b>{Math.max(0, 30 - totalWeight).toFixed(1)} kg</b> lagi untuk mencapai target bulan ini.</p></div></article>
            </section>

            <section className="bottom-grid">
              <article className="panel transactions-panel"><div className="panel-heading transactions-heading"><div><span className="section-kicker">AKTIVITAS TERBARU</span><h2>Setoran terakhir</h2></div><button className="text-link" onClick={() => setPage('Riwayat')}>Lihat semua <ArrowRight size={15} /></button></div><TransactionTable items={transactions.slice(0, 4)} role={role} onAction={handleTransactionAction} /></article>
              <article className="panel category-panel"><div className="panel-heading"><div><span className="section-kicker">PILAH LEBIH BAIK</span><h2>Kategori favorit</h2></div><button className="icon-button subtle-icon" title="Lihat kategori" aria-label="Lihat kategori" onClick={() => setPage('Analitik')}><ArrowRight size={16} /></button></div><div className="category-list"><CategoryRow name="Plastik" amount="4,8 kg" width="78%" color="category-mint" /><CategoryRow name="Kertas" amount="3,2 kg" width="58%" color="category-gold" /><CategoryRow name="Logam" amount="1,5 kg" width="34%" color="category-coral" /></div><button className="category-link" onClick={() => setModal('pickup')}><Plus size={15} /> Setor sampah lain</button></article>
            </section>
            </> : <>
              <section className="welcome-banner role-banner">
                <div className="welcome-copy"><span className="welcome-label"><ShieldCheck size={14} /> {role === 'Petugas' ? 'OPERASIONAL PENJEMPUTAN' : 'PANEL PENGELOLA'}</span><h2>{role === 'Petugas' ? <>Setiap penjemputan<br />dimulai dari sini.</> : <>Kelola layanan<br />WasteTrack.</>}</h2><p>{role === 'Petugas' ? 'Periksa antrean dan catat progres pengambilan sampah.' : 'Pantau verifikasi transaksi dan kelola akses tim.'}</p><button className="text-button" onClick={() => setPage(role === 'Admin' ? 'Analitik' : 'Setoran')}>{role === 'Petugas' ? 'Buka daftar tugas' : 'Lihat ringkasan'} <ArrowRight size={16} /></button></div>
                <div className="banner-stat"><span>{role === 'Petugas' ? 'TUGAS AKTIF' : 'PERLU VALIDASI'}</span><strong>{transactions.filter((item) => role === 'Petugas' ? item.status === 'Menunggu' || item.status === 'Dijadwalkan' : item.status === 'Dijemput').length}</strong><small className="banner-caption">{role === 'Petugas' ? 'setoran menunggu tindak lanjut' : 'setoran menunggu pemeriksaan'}</small></div>
                <div className="banner-illustration" aria-hidden="true"><span className="sun-disc" /><span className="banner-ring ring-one" /><span className="banner-ring ring-two" /><ShieldCheck className="banner-leaf leaf-one" size={56} /><Leaf className="banner-leaf leaf-two" size={38} /></div>
              </section>
              <section className="stats-grid" aria-label="Ringkasan operasional">
                <article className="stat-card"><div className="stat-top"><span>{role === 'Petugas' ? 'Tugas menunggu' : 'Menunggu validasi'}</span><span className="stat-icon icon-gold"><Clock3 size={17} /></span></div><strong>{transactions.filter((item) => role === 'Petugas' ? item.status === 'Menunggu' || item.status === 'Dijadwalkan' : item.status === 'Dijemput').length}</strong><div className="stat-foot"><span className="neutral-note">Perlu ditindaklanjuti</span></div></article>
                <article className="stat-card"><div className="stat-top"><span>Setoran selesai</span><span className="stat-icon icon-mint"><Check size={17} /></span></div><strong>{completed.length}</strong><div className="stat-foot"><span className="neutral-note">Tercatat di sistem</span></div></article>
                <article className="stat-card"><div className="stat-top"><span>Total setoran</span><span className="stat-icon icon-lime"><Recycle size={17} /></span></div><strong>{transactions.length}</strong><div className="stat-foot"><span className="neutral-note">Semua status</span></div></article>
                <article className="stat-card"><div className="stat-top"><span>Berat terpilah</span><span className="stat-icon icon-peach"><PackageCheck size={17} /></span></div><strong>{totalWeight.toFixed(1)}<small> kg</small></strong><div className="stat-foot"><span className="neutral-note">Total tercatat</span></div></article>
              </section>
              <section className="panel transactions-panel role-transactions"><div className="panel-heading transactions-heading"><div><span className="section-kicker">{role === 'Petugas' ? 'ANTREAN KERJA' : 'TINJAUAN ADMIN'}</span><h2>{role === 'Petugas' ? 'Setoran perlu ditangani' : 'Setoran untuk diverifikasi'}</h2></div><button className="text-link" onClick={() => setPage('Setoran')}>Lihat semua <ArrowRight size={15} /></button></div><TransactionTable items={transactions.filter((item) => role === 'Petugas' ? item.status !== 'Selesai' : item.status === 'Dijemput').slice(0, 4)} role={role} onAction={handleTransactionAction} /></section>
            </>}
          </>}

          {page === 'Setoran' && <PageHeading title={role === 'Nasabah' ? 'Setoran' : role === 'Petugas' ? 'Daftar penjemputan' : 'Semua setoran'} description={role === 'Nasabah' ? 'Atur penjemputan dan pantau status sampahmu.' : role === 'Petugas' ? 'Tindak lanjuti antrean dan perbarui progres penjemputan.' : 'Pantau setoran dan verifikasi hasil penimbangan.'} action={role === 'Nasabah' ? () => setModal('pickup') : null} actionLabel="Jadwalkan jemput" icon={Plus}>
            <section className="panel list-panel"><div className="list-toolbar"><div className="table-count">{transactions.length} permintaan setoran</div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari setoran..." /></label></div><TransactionTable items={filteredTransactions} role={role} onAction={handleTransactionAction} /></section>
            {role === 'Nasabah' && <section className="pickup-note"><span><MapPin size={17} /></span><div><strong>Pastikan alamat penjemputan sudah benar</strong><p>Kurir akan menghubungimu sebelum berangkat ke lokasi.</p></div><button className="text-link" onClick={() => setModal('pickup')}>Atur jadwal <ArrowRight size={15} /></button></section>}
          </PageHeading>}

          {page === 'Riwayat' && <PageHeading title="Riwayat aktivitas" description="Semua perjalanan baikmu, tercatat rapi." action={() => setPage('Tukar poin')} actionLabel="Tukar poin" icon={ArrowDownLeft}>
            <section className="history-summary"><div><span>Total poin terkumpul</span><strong>{formatNumber(balance + completed.reduce((sum, item) => sum + item.points, 0))}</strong><small>sepanjang perjalananmu</small></div><div><span>Berat terselamatkan</span><strong>{totalWeight.toFixed(1)} kg</strong><small>dari {transactions.length} aktivitas</small></div><div><span>Penjemputan selesai</span><strong>{completed.length}</strong><small>terima kasih sudah memilah</small></div></section>
            <section className="panel list-panel"><div className="list-toolbar"><div><span className="section-kicker">SEMUA AKTIVITAS</span><h2>Riwayat setoran</h2></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari aktivitas..." /></label></div><TransactionTable items={filteredTransactions} role={role} onAction={handleTransactionAction} /></section>
          </PageHeading>}

          {page === 'Tukar poin' && <PageHeading title="Tukar poinmu" description="Pilih hadiah kecil dari kebiasaan baikmu." action={null}>
            <section className="rewards-balance"><span className="balance-icon"><Coins size={19} /></span><div><span>Poin yang bisa ditukar</span><strong>{formatNumber(balance)} <small>poin</small></strong></div><span className="balance-note"><Sparkles size={14} /> Terus pilah, kumpulkan lebih banyak</span></section>
            <div className="rewards-heading"><div><span className="section-kicker">HADIAH UNTUKMU</span><h2>Katalog penukaran</h2></div><span className="rewards-caption">Semua hadiah, untuk langkah baikmu.</span></div>
            <section className="rewards-grid">{rewards.map((reward) => { const Icon = reward.icon; return <article className="reward-card" key={reward.id}><div className={`reward-art reward-${reward.color}`}><span className="reward-art-orbit" /><Icon size={31} strokeWidth={1.5} /><span className="reward-amount">{reward.amount}</span></div><div className="reward-content"><span className="reward-type">{reward.id.startsWith('wallet') ? 'E-WALLET' : 'VOUCHER'}</span><h3>{reward.name}</h3><p>{reward.description}</p><div className="reward-footer"><span><Coins size={15} /> {formatNumber(reward.points)} poin</span><button className="button button-dark button-small" disabled={balance < reward.points} onClick={() => openReward(reward)}>Tukar <ArrowRight size={14} /></button></div></div></article>})}</section>
            <section className="redeem-hint"><span><Sparkles size={17} /></span><p>Poin masuk setelah setoranmu selesai diverifikasi petugas.</p><button onClick={() => setPage('Riwayat')}>Lihat riwayat poin <ArrowRight size={15} /></button></section>
          </PageHeading>}

          {page === 'Analitik' && <PageHeading title={role === 'Admin' ? 'Ringkasan pengelola' : role === 'Petugas' ? 'Ringkasan pekerjaan' : 'Dampak baikmu'} description={role === 'Admin' ? 'Pantau aktivitas setoran, hasil penimbangan, dan verifikasi.' : role === 'Petugas' ? 'Pantau progres penjemputan yang sedang ditangani.' : 'Lihat perkembangan kontribusimu dari waktu ke waktu.'} action={role === 'Nasabah' ? () => setModal('pickup') : null} actionLabel="Tambah setoran" icon={Plus}>
            <section className="analytics-summary"><article><span>Total sampah terpilah</span><strong>{totalWeight.toFixed(1)} <small>kg</small></strong><div><ArrowUpRight size={14} /> 18% dari bulan lalu</div></article><article><span>Setoran selesai</span><strong>{completed.length} <small>kali</small></strong><div><ArrowUpRight size={14} /> Konsisten setiap minggu</div></article><article><span>Estimasi poin terkumpul</span><strong>{formatNumber(completed.reduce((sum, item) => sum + item.points, 0))}</strong><div><Coins size={14} /> Dari setoran terverifikasi</div></article></section>
            <section className="insights-grid analytics-charts"><article className="panel chart-panel"><div className="panel-heading"><div><span className="section-kicker">PERJALANANMU</span><h2>Berat sampah terpilah</h2></div><button className="period-select" onClick={() => setToast('Periode yang ditampilkan: bulan ini')}>Bulan ini <ChevronDown size={14} /></button></div><div className="chart-summary"><strong>12,4 <small>kg</small></strong><span className="chart-change"><ArrowUpRight size={14} /> 8,2% <span>vs bulan lalu</span></span></div><div className="bar-chart analytics-bars" role="img" aria-label="Grafik berat setoran mingguan">{['Mgg 1', 'Mgg 2', 'Mgg 3', 'Mgg 4'].map((day, index) => <div className="chart-column" key={day}><div className="bar-outer"><div className={`chart-bar ${index === 3 ? 'bar-highlight' : ''}`} style={{ height: `${[57, 74, 48, 91][index]}%` }} /></div><span>{day}</span></div>)}</div><div className="chart-legend"><span><i /> Berat sampah</span><span className="chart-note">Target bulanan <b>30 kg</b></span></div></article><article className="panel category-panel analytics-category"><div className="panel-heading"><div><span className="section-kicker">KOMPOSISI</span><h2>Jenis sampah</h2></div><span className="period-label">Bulan ini</span></div><div className="category-list"><CategoryRow name="Plastik" amount="4,8 kg" width="78%" color="category-mint" /><CategoryRow name="Kertas" amount="3,2 kg" width="58%" color="category-gold" /><CategoryRow name="Logam" amount="1,5 kg" width="34%" color="category-coral" /><CategoryRow name="Kaca" amount="1,2 kg" width="24%" color="category-lilac" /></div><div className="impact-footnote"><Leaf size={16} /><span>Terus pilah, setiap jenis punya nilai.</span></div></article></section>
            {role === 'Admin' && <section className="panel list-panel admin-review"><div className="list-toolbar"><div><span className="section-kicker">TINDAKAN PENGELOLA</span><h2>Validasi setoran dijemput</h2></div><span className="table-count">{transactions.filter((item) => item.status === 'Dijemput').length} menunggu</span></div><TransactionTable items={transactions.filter((item) => item.status === 'Dijemput')} role={role} onAction={handleTransactionAction} /></section>}
          </PageHeading>}

          {page === 'Profil' && <PageHeading title="Profil saya" description="Kelola informasi akun dan alamat yang digunakan untuk penjemputan." action={null}>
            <section className="profile-overview">
              <div className="profile-overview-identity">
                <div className="avatar profile-page-avatar">{initials(user.name)}</div>
                <div><span className="section-kicker">AKUN WASTETRACK</span><h2>{user.name}</h2><p>{user.email}</p></div>
              </div>
              <span className="profile-role"><ShieldCheck size={15} />{role}</span>
            </section>
            <div className="profile-page-grid">
              <form onSubmit={submitProfile} className="panel profile-form">
                <div className="profile-section-heading"><div><span className="section-kicker">INFORMASI PRIBADI</span><h2>Detail akun</h2></div><span><ShieldCheck size={14} /> Data akun terverifikasi</span></div>
                <div className="profile-fields">
                  <label>Nama lengkap<input autoComplete="name" required maxLength={100} value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Email<input type="email" autoComplete="email" required maxLength={100} value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Nomor telepon <span className="profile-field-optional">Opsional</span><input type="tel" autoComplete="tel" maxLength={20} value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} placeholder="08xx xxxx xxxx" /></label>
                  <label className="profile-address-field">Alamat penjemputan <span className="profile-field-optional">Opsional</span><textarea autoComplete="street-address" rows={3} value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} placeholder="Jl. ... , kecamatan, kota" /><small>Alamat ini membantu petugas menemukan lokasi penjemputanmu.</small></label>
                </div>
                <div className="profile-form-actions"><button className="button button-primary" type="submit" disabled={profileSubmitting}>{profileSubmitting ? 'Menyimpan…' : 'Simpan perubahan'} <ArrowRight size={15} /></button></div>
              </form>
              <aside className="panel profile-side-card">
                <span className="profile-side-icon"><ShieldCheck size={18} /></span>
                <span className="section-kicker">AKUN AMAN</span>
                <h2>Informasimu terlindungi</h2>
                <p>Data profil hanya digunakan untuk kebutuhan akun dan koordinasi penjemputan WasteTrack.</p>
                <div className="profile-side-divider" />
                <div className="profile-account-detail"><span>Status akun</span><strong><i /> Aktif</strong></div>
                {role === 'Nasabah' && <div className="profile-account-detail"><span>Poin tersedia</span><strong>{formatNumber(balance)} poin</strong></div>}
              </aside>
            </div>
          </PageHeading>}

          {page === 'Pengguna' && role === 'Admin' && <AdminUsers />}
          <footer className="app-footer"><span>WasteTrack <span>·</span> Pengelolaan sampah bersama</span><span><i /> Setoran akun terhubung ke server</span></footer>
        </div>
      </main>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="Tutup menu" onClick={() => setMobileNavOpen(false)} />}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-header"><div><span className="section-kicker">{modal === 'pickup' ? 'MULAI LANGKAH BAIK' : 'HADIAH UNTUKMU'}</span><h2 id="dialog-title">{modal === 'pickup' ? 'Jadwalkan penjemputan' : 'Konfirmasi penukaran'}</h2></div><button className="icon-button" aria-label="Tutup" onClick={() => setModal(null)}><X size={19} /></button></div>
        {modal === 'pickup' ? <form onSubmit={submitPickup} className="dialog-form"><label>Jenis sampah<select value={waste} onChange={(event) => setWaste(event.target.value as WasteType)}>{Object.keys(pointRate).map((item) => <option key={item}>{item}</option>)}</select></label><label>Perkiraan berat (kg)<input type="number" min="0.5" step="0.1" required value={weight} onChange={(event) => setWeight(event.target.value)} /></label><label>Tanggal penjemputan<input type="date" required value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} /></label><label>Alamat penjemputan<textarea required rows={2} value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} /><span className="pickup-address-hint">Masukkan alamat lengkap untuk melihat peta dan membuat rute penjemputan.</span></label>{pickupAddress.trim() && <><iframe className="pickup-map" title="Peta alamat penjemputan" src={`https://maps.google.com/maps?q=${encodeURIComponent(pickupAddress.trim())}&output=embed`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><a className="pickup-map-link" href={googleMapsDirectionsUrl(pickupAddress.trim())} target="_blank" rel="noreferrer"><MapPin size={15} />Buka rute ke alamat ini di Google Maps<ExternalLink size={13} /></a></>}<div className="estimate-box"><span><Sparkles size={16} /> Estimasi poin</span><strong>{formatNumber(estimatedPoints)} <small>poin</small></strong><small>Poin final dihitung setelah penimbangan petugas.</small></div><div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setModal(null)}>Batal</button><button type="submit" className="button button-primary"><CalendarDays size={16} />Konfirmasi jadwal</button></div></form> : <form onSubmit={submitRedemption} className="dialog-form"><div className="redeem-confirm"><span className={`reward-confirm-icon reward-${selectedReward.color}`}><selectedReward.icon size={24} /></span><div><strong>{selectedReward.name}</strong><span>{selectedReward.amount} · {formatNumber(selectedReward.points)} poin</span></div></div><p className="confirm-copy">Poin akan langsung dikurangi dari saldo. Detail penukaran akan dikirim ke akun terdaftar.</p><div className="balance-after"><span>Sisa poin setelah ditukar</span><strong>{formatNumber(Math.max(0, balance - selectedReward.points))}</strong></div><div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setModal(null)}>Kembali</button><button type="submit" className="button button-primary" disabled={redemptionSubmitting || balance < selectedReward.points}>{redemptionSubmitting ? 'Memproses…' : 'Tukar sekarang'} <ArrowRight size={16} /></button></div></form>}
      </section></div>}

      {toast && <div className="toast" role="status"><span><Check size={16} /></span>{toast}<button aria-label="Tutup notifikasi" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  )
}

function PageHeading({ title, description, action, actionLabel, icon: ActionIcon, children }: { title: string; description: string; action: (() => void) | null; actionLabel?: string; icon?: LucideIcon; children: ReactNode }) {
  return <><section className="page-heading inner-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> RUANG HIJAU · 2026</span><h1>{title}</h1><p>{description}</p></div>{action && ActionIcon && <button className="button button-primary" onClick={action}><ActionIcon size={17} />{actionLabel}</button>}</section>{children}</>
}

function TransactionTable({ items, role, onAction }: { items: Transaction[]; role: Role; onAction: (transaction: Transaction) => void }) {
  const showCustomerContact = role === 'Petugas'
  return <div className="table-scroll"><table className={`transaction-table ${showCustomerContact ? 'transaction-table-petugas' : ''}`}><thead><tr><th>JENIS SAMPAH</th>{showCustomerContact && <th>NASABAH</th>}<th>BERAT</th><th>TANGGAL</th><th>POIN</th><th>STATUS</th><th aria-label="Aksi" /></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}><td><span className={`waste-symbol waste-${item.waste.toLowerCase()}`}><Recycle size={16} /></span><span className="waste-name"><strong>{item.waste}</strong><small>{item.id}</small></span></td>{showCustomerContact && <td><span className="customer-contact"><strong>{item.customerName}</strong>{item.customerPhone ? <a href={`tel:${item.customerPhone}`}><Phone size={12} />{item.customerPhone}</a> : <small>Nomor telepon belum diisi</small>}</span></td>}<td>{item.weight.toFixed(1)} kg</td><td>{formatDate(item.date)}</td><td><strong className={`points-value ${item.status === 'Selesai' ? '' : 'estimate-value'}`}>{item.status === 'Selesai' ? '+' : '~'}{formatNumber(item.points)}</strong></td><td><StatusPill status={item.status} /></td><td><span className="row-actions"><a className="row-action" href={googleMapsDirectionsUrl(item.address)} target="_blank" rel="noreferrer" title={`Buka rute penjemputan ${item.id}`} aria-label={`Buka rute penjemputan ${item.id}`}><MapPin size={15} /></a><button className="row-action" title={role === 'Petugas' ? `Perbarui status ${item.id}` : role === 'Admin' && item.status === 'Dijemput' ? `Validasi ${item.id}` : `Detail ${item.id}`} aria-label={role === 'Admin' && item.status === 'Dijemput' ? `Validasi ${item.id}` : role === 'Petugas' ? `Perbarui status ${item.id}` : `Detail ${item.id}`} onClick={() => onAction(item)}>{role === 'Admin' && item.status === 'Dijemput' ? <Check size={16} /> : role === 'Petugas' && item.status !== 'Selesai' ? <Truck size={15} /> : <ArrowRight size={16} />}</button></span></td></tr>) : <tr><td className="empty-state" colSpan={showCustomerContact ? 7 : 6}>Belum ada setoran yang cocok dengan pencarianmu.</td></tr>}</tbody></table></div>
}

function CategoryRow({ name, amount, width, color }: { name: string; amount: string; width: string; color: string }) {
  return <div className="category-row"><div className="category-label"><span><i className={color} />{name}</span><strong>{amount}</strong></div><div className="category-track"><i className={color} style={{ width }} /></div></div>
}

export default App

function AuthScreen({ onAuthenticated, initialError }: { onAuthenticated: (user: AuthUser, token: string) => void; initialError: string }) {
  const [registering, setRegistering] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(initialError)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? { name, email, password, phone } : { email, password }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Permintaan tidak dapat diproses.')
      onAuthenticated(body.data.user as AuthUser, body.data.token as string)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Tidak dapat terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-page">
    <section className="auth-card">
      <a className="brand auth-brand" href="/" aria-label="WasteTrack">
        <span className="brand-mark"><Recycle size={21} strokeWidth={2.2} /></span>
        <span>waste<span className="brand-light">track</span></span><span className="brand-dot">.</span>
      </a>
      <span className="section-kicker">PENGELOLAAN SAMPAH BERSAMA</span>
      <h1>{registering ? 'Mulai langkah baikmu.' : 'Senang melihatmu kembali.'}</h1>
      <p className="auth-intro">{registering ? 'Buat akun nasabah untuk menjadwalkan penjemputan dan mengumpulkan poin.' : 'Masuk dengan akun WasteTrack. Halaman dan fitur disesuaikan dengan peran akunmu.'}</p>
      <div className="auth-role-note"><ShieldCheck size={17} /><span>Nasabah, petugas, dan admin ditentukan oleh akun terverifikasi.</span></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {registering && <label>Nama lengkap<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama sesuai identitas" /></label>}
        <label>Email<input type="email" autoComplete="email" required maxLength={100} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" /></label>
        {registering && <label>Nomor telepon <span className="auth-optional">(opsional)</span><input type="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08xx xxxx xxxx" /></label>}
        <label>Kata sandi<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 8 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? 'Minimal 8 karakter' : 'Masukkan kata sandi'} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>{submitting ? 'Memproses…' : registering ? 'Buat akun nasabah' : 'Masuk'} <ArrowRight size={16} /></button>
      </form>
      <p className="auth-switch">{registering ? 'Sudah memiliki akun?' : 'Belum menjadi nasabah?'} <button onClick={() => { setRegistering((value) => !value); setError('') }}>{registering ? 'Masuk' : 'Daftar sebagai nasabah'}</button></p>
      <p className="auth-footnote">Akun petugas dan admin dibuat oleh admin sistem.</p>
    </section>
  </main>
}

function AdminUsers() {
  const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string }[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'petugas' | 'admin'>('petugas')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('wastetrack-session')
    fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Daftar akun tidak dapat dimuat.')
        setUsers(body.data)
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Daftar akun tidak dapat dimuat.'))
      .finally(() => setLoading(false))
  }, [])

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('wastetrack-session')}`,
        },
        body: JSON.stringify({ name, email, password, role }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Akun tidak dapat dibuat.')
      setUsers((current) => [body.data.user, ...current])
      setName('')
      setEmail('')
      setPassword('')
      setMessage(`Akun ${role} berhasil dibuat.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Akun tidak dapat dibuat.')
    }
  }

  return <PageHeading title="Kelola pengguna" description="Buat akun petugas atau admin. Pendaftaran nasabah tersedia di halaman masuk." action={null}>
    <div className="admin-users-grid">
      <section className="panel admin-user-form">
        <div className="panel-heading"><div><span className="section-kicker">AKSES TIM</span><h2>Buat akun internal</h2></div><span className="stat-icon icon-mint"><Users size={17} /></span></div>
        <form className="auth-form" onSubmit={(event) => void createUser(event)}>
          <label>Nama lengkap<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email<input required type="email" maxLength={100} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Kata sandi sementara<input required type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Peran<select value={role} onChange={(event) => setRole(event.target.value as 'petugas' | 'admin')}><option value="petugas">Petugas</option><option value="admin">Admin</option></select></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}
          <button className="button button-primary" type="submit"><Plus size={16} />Buat akun</button>
        </form>
      </section>
      <section className="panel admin-user-list">
        <div className="panel-heading"><div><span className="section-kicker">AKUN TERDAFTAR</span><h2>Tim dan nasabah</h2></div></div>
        {loading ? <p className="user-list-empty">Memuat akun…</p> : users.length ? <div className="managed-users">{users.map((item) => <div className="managed-user" key={item.id}><span className="avatar avatar-small">{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.email}</small></span><span className={`managed-role role-${item.role}`}>{roleLabel(item.role as AuthUser['role'])}</span></div>)}</div> : !error && <p className="user-list-empty">Belum ada akun selain admin yang masuk.</p>}
      </section>
    </div>
  </PageHeading>
}
