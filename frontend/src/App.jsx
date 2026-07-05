import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Cpu, Camera, Thermometer, DoorClosed, AlertTriangle, Flame,
  Bell, CheckCircle2, XCircle, Clock, Activity, MapPin, Zap, ChevronRight,
  Smartphone, Lock, Radio, Eye, Send, Loader2, Menu, X, Wifi, TrendingUp,
  Building2, User, Search, Filter, MoreVertical, Power, Settings, Plus
} from 'lucide-react'

const API = '/api/v1'

// ─── API helper ───────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null, token = null) {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}token=${token}`
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// ─── Severity helpers ────────────────────────────────────────────────
const SEV = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-500', glow: 'glow-red' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-500' },
}
const STATUS_CLS = {
  open: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  investigating: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  escalated: 'bg-red-500/10 text-red-400 border border-red-500/20',
  resolved: 'bg-green-500/10 text-green-400 border border-green-500/20',
  false_alarm: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}
const DEV_ICONS = { camera: Camera, sensor: Thermometer, door: DoorClosed }

// ─── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('tl_token') || '')
  const [tokenInput, setTokenInput] = useState('')
  const [view, setView] = useState('dashboard')
  const [wsConnected, setWsConnected] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [events, setEvents] = useState([])
  const [devices, setDevices] = useState([])
  const [tickets, setTickets] = useState([])
  const [notifications, setNotifications] = useState([])
  const [stats, setStats] = useState({ total: 0, critical: 0, active: 0, devices: 0 })
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showLogin, setShowLogin] = useState(!token)

  // ─── WebSocket ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${proto}://${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => { setWsConnected(false); setTimeout(() => window.location.reload(), 5000) }
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'event') setEvents(p => [msg.payload, ...p].slice(0, 50))
      else if (msg.type === 'ticket') { setTickets(p => [msg.payload, ...p].slice(0, 50)); setNotifications(p => [msg.payload, ...p]) }
      else if (msg.type === 'notification') setNotifications(p => [msg.payload, ...p].slice(0, 20))
      else if (msg.type === 'ticket_update') setTickets(p => p.map(t => t.id === msg.payload.id ? { ...t, ...msg.payload } : t))
    }
    return () => ws.close()
  }, [token])

  // ─── Fetch data ───────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [evs, devs, tix] = await Promise.all([
        api('/events?limit=50', 'GET', null, token),
        api('/devices', 'GET', null, token),
        api('/tickets', 'GET', null, token),
      ])
      setEvents(evs); setDevices(devs); setTickets(tix)
      setStats({
        total: evs.length,
        critical: evs.filter(e => e.severity === 'critical').length,
        active: tix.filter(t => ['open', 'investigating', 'escalated'].includes(t.status)).length,
        devices: devs.length,
      })
    } catch {}
  }, [token])

  useEffect(() => { if (token) refresh() }, [token, refresh])
  useEffect(() => {
    if (!token) return
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [token, refresh])

  const handleLogin = (e) => {
    e?.preventDefault()
    if (tokenInput.trim()) {
      localStorage.setItem('tl_token', tokenInput.trim())
      setToken(tokenInput.trim())
      setShowLogin(false)
    }
  }
  const handleLogout = () => {
    localStorage.removeItem('tl_token')
    setToken(''); setShowLogin(true)
  }

  const changeView = (v) => { setView(v); setMobileNavOpen(false) }

  if (showLogin || !token) {
    return <LoginScreen tokenInput={tokenInput} setTokenInput={setTokenInput} onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row grid-bg">
      {/* Desktop Sidebar */}
      <DesktopSidebar view={view} setView={changeView} stats={stats} wsConnected={wsConnected} onLogout={handleLogout} />

      {/* Mobile Bottom Nav */}
      <MobileBottomNav view={view} setView={changeView} stats={stats} />

      {/* Mobile Top Bar */}
      <MobileTopBar wsConnected={wsConnected} onMenu={() => setMobileNavOpen(true)} />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-x-hidden max-w-full">
        {view === 'dashboard' && <Dashboard events={events} tickets={tickets} stats={stats} wsConnected={wsConnected} />}
        {view === 'devices' && <DevicesView devices={devices} token={token} onRefresh={refresh} />}
        {view === 'tickets' && <TicketsView tickets={tickets} onSelect={setSelectedTicket} />}
        {view === 'officer' && <OfficerView tickets={tickets} token={token} onSelect={setSelectedTicket} />}
        {view === 'notifications' && <NotificationsView notifications={notifications} />}
      </main>

      {selectedTicket && <TicketModal ticket={selectedTicket} token={token} onClose={() => setSelectedTicket(null)} onRefresh={refresh} />}
    </div>
  )
}

// ─── Login Screen ─────────────────────────────────────────────────────
function LoginScreen({ tokenInput, setTokenInput, onLogin }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-bg">
      <div className="glass rounded-3xl p-6 md:p-10 max-w-md w-full slide-in glow-blue">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl mb-4 border border-blue-500/20">
            <Shield className="w-8 h-8 md:w-10 md:h-10 text-blue-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold gradient-text mb-1">THYNKLAYER</h1>
          <p className="text-gray-500 text-xs md:text-sm">Sovereign AI Platform for Physical Security</p>
        </div>
        <form onSubmit={onLogin} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5 font-medium">API Token</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter your tenant API token"
                className="w-full bg-gray-900/80 border border-gray-800 rounded-xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-medium py-3 rounded-xl transition-all glow-blue active:scale-[0.98]">
            Access Dashboard →
          </button>
        </form>
        <div className="mt-6 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-center">
          <p className="text-xs text-gray-500 mb-1">Demo Token</p>
          <code className="text-xs text-blue-400/80 break-all">1950d00f-eb7d-47df-b34c-02321b294eb9</code>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop Sidebar (hidden on mobile) ───────────────────────────────
function DesktopSidebar({ view, setView, stats, wsConnected, onLogout }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'devices', label: 'Devices', icon: Cpu, badge: stats.devices },
    { id: 'tickets', label: 'Tickets', icon: AlertTriangle, badge: stats.active },
    { id: 'officer', label: 'Field Officer', icon: Smartphone },
    { id: 'notifications', label: 'Alerts', icon: Bell },
  ]
  return (
    <aside className="hidden md:flex w-60 lg:w-64 flex-col border-r border-gray-800/50 glass shrink-0" style={{ minHeight: '100vh' }}>
      <div className="p-5 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide">THYNKLAYER</div>
            <div className="text-[10px] text-gray-600">AI Security OS</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                active ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800/30 border border-transparent'
              }`}>
              <Icon className="w-4.5 h-4.5 shrink-0" />
              <span>{item.label}</span>
              {item.badge ? <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md ${active ? 'bg-blue-500/20' : 'bg-gray-800'}`}>{item.badge}</span> : null}
            </button>
          )
        })}
      </nav>
      <div className="p-3 border-t border-gray-800/50 space-y-2">
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gray-900/50">
          <Wifi className={`w-3.5 h-3.5 ${wsConnected ? 'text-green-400' : 'text-red-400'}`} />
          <span className="text-gray-500">{wsConnected ? 'Connected · Live' : 'Reconnecting...'}</span>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
          <Power className="w-4 h-4" /><span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile Top Bar ───────────────────────────────────────────────────
function MobileTopBar({ wsConnected, onMenu }) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass border-b border-gray-800/50 safe-top">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center border border-blue-500/20">
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-bold text-sm tracking-wide">THYNKLAYER</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`relative w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          <span className={`text-[10px] ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>{wsConnected ? 'Live' : 'Off'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────
function MobileBottomNav({ view, setView, stats }) {
  const items = [
    { id: 'dashboard', label: 'Home', icon: Activity },
    { id: 'devices', label: 'Devices', icon: Cpu, badge: stats.devices },
    { id: 'tickets', label: 'Tickets', icon: AlertTriangle, badge: stats.active },
    { id: 'officer', label: 'Officer', icon: Smartphone },
  ]
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass border-t border-gray-800/50 safe-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map(item => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${active ? 'text-blue-400' : 'text-gray-600'}`}>
              <div className="relative">
                <Icon className={`w-5 h-5 ${active ? 'scale-110' : ''} transition-transform`} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{item.badge}</span>
                )}
              </div>
              <span className="text-[9px] font-medium">{item.label}</span>
              {active && <div className="absolute -bottom-0.5 w-1 h-1 bg-blue-400 rounded-full" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────
function Dashboard({ events, tickets, stats, wsConnected }) {
  const activeTickets = tickets.filter(t => ['open', 'investigating', 'escalated'].includes(t.status))
  return (
    <div className="space-y-5 md:space-y-6 fade-in pt-16 md:pt-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Security Dashboard</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-0.5">AI-correlated real-time intelligence</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium ${
          wsConnected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          <div className={`relative w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          {wsConnected ? 'Live Monitoring' : 'Reconnecting'}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={Cpu} label="Devices" value={stats.devices} color="blue" sublabel="Connected" />
        <StatCard icon={AlertTriangle} label="Active" value={stats.active} color="amber" sublabel="Open tickets" />
        <StatCard icon={Flame} label="Critical" value={stats.critical} color="red" sublabel="High severity" />
        <StatCard icon={Activity} label="Total" value={stats.total} color="purple" sublabel="Events logged" />
      </div>

      {/* Event Feed + Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm md:text-base flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400" /> Live Events
            </h2>
            <span className="text-[10px] text-gray-600">{events.length} logged</span>
          </div>
          <div className="space-y-2 max-h-[400px] md:max-h-[500px] overflow-y-auto no-scrollbar">
            {events.length === 0 && <EmptyState text="No events yet" />}
            {events.map((ev, i) => <EventCard key={ev.id + i} event={ev} />)}
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm md:text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Active Tickets
            </h2>
            <span className="text-[10px] text-gray-600">{activeTickets.length} open</span>
          </div>
          <div className="space-y-2 max-h-[400px] md:max-h-[500px] overflow-y-auto no-scrollbar">
            {activeTickets.length === 0 && <EmptyState text="No active tickets — all clear ✅" />}
            {activeTickets.map((t, i) => <TicketCard key={t.id + i} ticket={t} compact />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sublabel }) {
  const colors = {
    blue: { bg: 'from-blue-500/10 to-blue-500/5', icon: 'bg-blue-500/15 text-blue-400' },
    amber: { bg: 'from-amber-500/10 to-amber-500/5', icon: 'bg-amber-500/15 text-amber-400' },
    red: { bg: 'from-red-500/10 to-red-500/5', icon: 'bg-red-500/15 text-red-400' },
    purple: { bg: 'from-purple-500/10 to-purple-500/5', icon: 'bg-purple-500/15 text-purple-400' },
  }
  const c = colors[color]
  return (
    <div className={`glass rounded-2xl p-3 md:p-4 bg-gradient-to-br ${c.bg} border-gray-800/50`}>
      <div className="flex items-center gap-2.5 md:gap-3">
        <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>
          <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xl md:text-2xl font-bold leading-tight">{value}</div>
          <div className="text-[10px] md:text-xs text-gray-500 truncate">{label} · {sublabel}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────
function EventCard({ event }) {
  const sev = SEV[event.severity] || SEV.info
  const icons = { fire_detected: Flame, smoke_detected: AlertTriangle, temperature_reading: Thermometer, human_detected: User, unauthorized_access: Lock, motion_detected: Eye }
  const Icon = icons[event.event_type] || Activity
  return (
    <div className={`rounded-xl p-2.5 md:p-3 border ${sev.border} ${sev.bg} slide-in`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 ${sev.bg}`}>
          <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${sev.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] uppercase font-bold ${sev.text}`}>{event.severity}</span>
            <span className="text-[9px] text-gray-600 truncate">{event.device}</span>
            <span className="text-[9px] text-gray-700 ml-auto shrink-0">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p className="text-xs text-gray-300 line-clamp-2">{event.message}</p>
          {event.ai_analysis && (
            <p className="text-[10px] text-blue-400/50 mt-1 line-clamp-1 italic">{event.ai_analysis.substring(0, 80)}...</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Card ──────────────────────────────────────────────────────
function TicketCard({ ticket, compact }) {
  const sev = SEV[ticket.severity] || SEV.info
  const statusCls = STATUS_CLS[ticket.status] || STATUS_CLS.open
  const evtIcon = ticket.event_type?.includes('fire') ? Flame : ticket.event_type?.includes('access') || ticket.event_type?.includes('human') ? Lock : AlertTriangle
  const Icon = evtIcon
  return (
    <div className="rounded-xl p-2.5 md:p-3 border border-gray-800/50 bg-gray-900/30 hover:bg-gray-900/50 hover:border-gray-700/50 transition-all slide-in">
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 ${sev.bg}`}>
          <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${sev.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${statusCls}`}>{ticket.status}</span>
            <span className={`text-[9px] uppercase font-bold ${sev.text}`}>{ticket.severity}</span>
            {ticket.escalation_triggered && <span className="text-[9px] text-red-400 flex items-center gap-0.5 font-bold"><Zap className="w-2.5 h-2.5" />ESCALATED</span>}
          </div>
          <p className="text-xs font-medium text-gray-200 line-clamp-2">{ticket.title}</p>
          {!compact && <p className="text-[10px] text-gray-600 mt-1">{new Date(ticket.created_at).toLocaleString()}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Devices View ─────────────────────────────────────────────────────
function DevicesView({ devices, token, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newDevice, setNewDevice] = useState({ name: '', device_type: 'camera', location_desc: '', endpoint: '' })

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await api('/devices', 'POST', {
        ...newDevice,
        capabilities: newDevice.device_type === 'camera' ? ['fire_detection', 'human_detection'] : newDevice.device_type === 'sensor' ? ['temperature'] : ['access_control'],
      }, token)
      setNewDevice({ name: '', device_type: 'camera', location_desc: '', endpoint: '' })
      setShowAdd(false); onRefresh()
    } catch { alert('Error adding device') }
  }

  return (
    <div className="space-y-4 md:space-y-6 fade-in pt-16 md:pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Devices</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-0.5">{devices.length} connected</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Device</span>
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="glass rounded-2xl p-4 md:p-5 space-y-3 slide-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="bg-gray-900/80 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50" placeholder="Device Name" value={newDevice.name} onChange={e => setNewDevice({ ...newDevice, name: e.target.value })} required />
            <select className="bg-gray-900/80 border border-gray-800 rounded-xl px-3 py-2.5 text-sm" value={newDevice.device_type} onChange={e => setNewDevice({ ...newDevice, device_type: e.target.value })}>
              <option value="camera">Camera</option>
              <option value="sensor">Sensor</option>
              <option value="door">Door / Access Control</option>
            </select>
            <input className="bg-gray-900/80 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50" placeholder="Location" value={newDevice.location_desc} onChange={e => setNewDevice({ ...newDevice, location_desc: e.target.value })} />
            <input className="bg-gray-900/80 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50" placeholder="Endpoint URL" value={newDevice.endpoint} onChange={e => setNewDevice({ ...newDevice, endpoint: e.target.value })} />
          </div>
          <button type="submit" className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium active:scale-95">Connect Device</button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {devices.map(d => {
          const Icon = DEV_ICONS[d.type] || Cpu
          return (
            <div key={d.id} className="glass rounded-2xl p-3 md:p-4 hover:border-gray-700 transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0 border border-blue-500/10">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{d.name}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5 truncate">{d.location || 'No location'}</div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${d.status === 'online' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>● {d.status}</span>
                    <span className="text-[9px] text-gray-600 uppercase">{d.type} · {d.protocol}</span>
                  </div>
                  {d.capabilities?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {d.capabilities.map(c => <span key={c} className="text-[8px] bg-gray-800/60 text-gray-500 px-1.5 py-0.5 rounded">{c}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tickets View ─────────────────────────────────────────────────────
function TicketsView({ tickets, onSelect }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const filters = ['all', 'open', 'investigating', 'escalated', 'resolved']

  return (
    <div className="space-y-4 md:space-y-6 fade-in pt-16 md:pt-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Tickets</h1>
        <p className="text-gray-500 text-xs md:text-sm mt-0.5">AI-generated incident tickets</p>
      </div>

      {/* Filter chips — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize whitespace-nowrap transition-all active:scale-95 ${
            filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800/50 text-gray-400'
          }`}>
            {f}
            {f !== 'all' && ` (${tickets.filter(t => t.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 md:space-y-3">
        {filtered.length === 0 && <EmptyState text="No tickets found" />}
        {filtered.map(t => (
          <div key={t.id} onClick={() => onSelect(t)} className="glass rounded-2xl p-3 md:p-4 cursor-pointer hover:border-blue-500/30 transition-all active:scale-[0.98]">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                t.severity === 'critical' ? SEV.critical.bg + ' ' + SEV.critical.text : t.severity === 'warning' ? SEV.warning.bg + ' ' + SEV.warning.text : SEV.info.bg + ' ' + SEV.info.text
              }`}>
                {t.event_type?.includes('fire') ? <Flame className="w-4 h-4 md:w-5 md:h-5" /> : t.event_type?.includes('access') || t.event_type?.includes('human') ? <Lock className="w-4 h-4 md:w-5 md:h-5" /> : <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${STATUS_CLS[t.status]}`}>{t.status}</span>
                  <span className={`text-[9px] uppercase font-bold ${(SEV[t.severity] || SEV.info).text}`}>{t.severity}</span>
                  {t.escalation_triggered && <span className="text-[9px] text-red-400 flex items-center gap-0.5 font-bold"><Zap className="w-2.5 h-2.5" /> ESC</span>}
                </div>
                <div className="font-medium text-sm line-clamp-2">{t.title}</div>
                <div className="text-[10px] text-gray-600 mt-1">{new Date(t.created_at).toLocaleString()}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-700 shrink-0 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Officer View ─────────────────────────────────────────────────────
function OfficerView({ tickets, token, onSelect }) {
  const myTickets = tickets.filter(t => ['open', 'investigating', 'escalated'].includes(t.status))
  return (
    <div className="space-y-4 md:space-y-6 fade-in pt-16 md:pt-0 max-w-md mx-auto md:mx-0">
      <div className="text-center md:text-left">
        <div className="inline-flex md:hidden items-center justify-center w-14 h-14 bg-blue-500/10 rounded-2xl mb-3 border border-blue-500/20">
          <Smartphone className="w-7 h-7 text-blue-400" />
        </div>
        <h1 className="text-xl md:text-2xl font-bold">Field Officer</h1>
        <p className="text-gray-500 text-xs md:text-sm mt-0.5">{myTickets.length} active assignments</p>
      </div>
      {myTickets.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">All clear — no pending tickets.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myTickets.map(t => (
            <div key={t.id} onClick={() => onSelect(t)} className="glass rounded-2xl p-4 cursor-pointer active:scale-[0.97] transition-transform">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${STATUS_CLS[t.status]}`}>{t.status}</span>
                <span className={`text-[9px] uppercase font-bold ${(SEV[t.severity] || SEV.info).text}`}>{t.severity}</span>
              </div>
              <div className="font-medium text-sm mb-2">{t.title}</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                <Clock className="w-3 h-3" /> {new Date(t.created_at).toLocaleTimeString()}
                <span className="ml-auto flex items-center gap-1 text-blue-400 font-medium">Open <ChevronRight className="w-3 h-3" /></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Notifications View ───────────────────────────────────────────────
function NotificationsView({ notifications }) {
  return (
    <div className="space-y-4 md:space-y-6 fade-in pt-16 md:pt-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Alerts</h1>
        <p className="text-gray-500 text-xs md:text-sm mt-0.5">Push notification history</p>
      </div>
      <div className="space-y-2">
        {notifications.length === 0 && <EmptyState text="No alerts yet" />}
        {notifications.map((n, i) => {
          const sev = SEV[n.severity] || SEV.info
          return (
            <div key={i} className={`rounded-xl p-3 border ${sev.border} ${sev.bg} slide-in flex items-start gap-3`}>
              <Bell className={`w-4 h-4 ${sev.text} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{n.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</div>
                <div className="text-[9px] text-gray-700 mt-1">{new Date(n.timestamp).toLocaleString()}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Ticket Modal ─────────────────────────────────────────────────────
function TicketModal({ ticket, token, onClose, onRefresh }) {
  const [checklist, setChecklist] = useState(ticket.checklist || [])
  const [notes, setNotes] = useState(ticket.resolution_notes || '')
  const [suspicious, setSuspicious] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const toggleItem = (idx) => {
    const updated = [...checklist]
    updated[idx] = { ...updated[idx], checked: !updated[idx].checked }
    setChecklist(updated)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await api(`/tickets/${ticket.id}`, 'PATCH', { checklist, resolution_notes: notes, suspicious }, token)
      setResult(res); onRefresh()
    } catch { alert('Error submitting') }
    setSubmitting(false)
  }

  const sev = SEV[ticket.severity] || SEV.info
  const checkedCount = checklist.filter(c => c.checked).length

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl p-5 md:p-6 max-w-lg w-full max-h-[92vh] md:max-h-[90vh] overflow-y-auto slide-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sev.bg}`}>
              {ticket.event_type?.includes('fire') ? <Flame className={`w-5 h-5 ${sev.text}`} /> : <Lock className={`w-5 h-5 ${sev.text}`} />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm line-clamp-2">{ticket.title}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{new Date(ticket.created_at).toLocaleString()}</div>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 ml-2 p-1"><XCircle className="w-5 h-5 text-gray-600" /></button>
        </div>

        {ticket.description && (
          <div className="bg-gray-900/40 rounded-xl p-3 mb-4 text-xs text-gray-400 whitespace-pre-wrap border border-gray-800/50 max-h-32 overflow-y-auto no-scrollbar">{ticket.description}</div>
        )}

        {result ? (
          <div className={`p-5 rounded-2xl text-center ${result.escalation_triggered ? 'bg-red-500/10 border border-red-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
            {result.escalation_triggered ? (
              <><AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" /><p className="font-bold text-red-400 text-sm">ESCALATED</p><p className="text-xs text-gray-400 mt-1">{result.message}</p></>
            ) : (
              <><CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" /><p className="font-bold text-green-400 text-sm">Submitted</p><p className="text-xs text-gray-400 mt-1">{result.message}</p></>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Checklist</h3>
                <span className="text-[10px] text-gray-600">{checkedCount}/{checklist.length}</span>
              </div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <button key={idx} onClick={() => toggleItem(idx)} className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                    item.checked ? 'bg-green-500/5 border border-green-500/15' : 'bg-gray-900/40 border border-gray-800/50'
                  }`}>
                    <div className={`w-5 h-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                      item.checked ? 'bg-green-500 border-green-500' : 'border-gray-600'
                    }`}>
                      {item.checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className={`text-xs ${item.checked ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-400 mb-2 block">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations, findings..."
                className="w-full bg-gray-900/80 border border-gray-800 rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500/50 min-h-[70px] resize-none" />
            </div>

            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-4 transition-all active:scale-[0.98] ${
              suspicious ? 'bg-red-500/10 border-red-500/30' : 'bg-red-500/5 border-red-500/15'
            }`}>
              <input type="checkbox" checked={suspicious} onChange={e => setSuspicious(e.target.checked)} className="w-4 h-4 accent-red-500" />
              <div>
                <span className="text-sm font-medium text-red-400">Mark as Suspicious</span>
                <p className="text-[10px] text-gray-500">Triggers immediate escalation to emergency services</p>
              </div>
            </label>

            <button onClick={handleSubmit} disabled={submitting}
              className={`w-full text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                suspicious ? 'bg-red-600 hover:bg-red-700 glow-red' : 'bg-blue-600 hover:bg-blue-700 glow-blue'
              }`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {suspicious ? 'Submit & Escalate' : 'Submit Checklist'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────
function EmptyState({ text }) {
  return (
    <div className="text-center py-10 text-gray-700">
      <p className="text-xs">{text}</p>
    </div>
  )
}
