import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Shield, Cpu, Camera, Thermometer, DoorClosed, AlertTriangle, Flame,
  Bell, CheckCircle2, XCircle, Clock, Activity, MapPin, Zap, ChevronRight,
  Smartphone, Lock, Radio, Eye, Send, Loader2, Building2, User
} from 'lucide-react'

const API = '/api/v1'
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}${window.location.port ? ':' + (window.location.port === '3101' ? '3100' : window.location.port) : ''}/ws`

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
const SEV_COLORS = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
}

const STATUS_COLORS = {
  open: 'bg-blue-500/15 text-blue-400',
  investigating: 'bg-amber-500/15 text-amber-400',
  escalated: 'bg-red-500/15 text-red-400',
  resolved: 'bg-green-500/15 text-green-400',
  false_alarm: 'bg-gray-500/15 text-gray-400',
}

const DEVICE_ICONS = {
  camera: Camera,
  sensor: Thermometer,
  door: DoorClosed,
}

// ─── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('tl_token') || '')
  const [tokenInput, setTokenInput] = useState('')
  const [view, setView] = useState('dashboard') // dashboard, devices, tickets, officer, notifications
  const [ws, setWs] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)

  // Data
  const [events, setEvents] = useState([])
  const [devices, setDevices] = useState([])
  const [tickets, setTickets] = useState([])
  const [notifications, setNotifications] = useState([])
  const [stats, setStats] = useState({ total: 0, critical: 0, active: 0, devices: 0 })

  // Modal
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showLogin, setShowLogin] = useState(!token)

  // ─── Connect WebSocket ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let wsUrl
    if (window.location.port === '3101') {
      wsUrl = `ws://${window.location.hostname}:3100/ws`
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      wsUrl = `${proto}://${window.location.host}/ws`
    }
    const websocket = new WebSocket(wsUrl)
    websocket.onopen = () => setWsConnected(true)
    websocket.onclose = () => { setWsConnected(false); setTimeout(() => window.location.reload(), 3000) }
    websocket.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'event') {
        setEvents(prev => [msg.payload, ...prev].slice(0, 50))
      } else if (msg.type === 'ticket') {
        setTickets(prev => [msg.payload, ...prev].slice(0, 50))
        setNotifications(prev => [msg.payload, ...prev])
      } else if (msg.type === 'notification') {
        setNotifications(prev => [msg.payload, ...prev].slice(0, 20))
      } else if (msg.type === 'ticket_update') {
        setTickets(prev => prev.map(t => t.id === msg.payload.id ? { ...t, ...msg.payload } : t))
      }
    }
    setWs(websocket)
    return () => websocket.close()
  }, [token])

  // ─── Fetch initial data ───────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [evs, devs, tix] = await Promise.all([
        api('/events?limit=50', 'GET', null, token),
        api('/devices', 'GET', null, token),
        api('/tickets', 'GET', null, token),
      ])
      setEvents(evs)
      setDevices(devs)
      setTickets(tix)
      setStats({
        total: evs.length,
        critical: evs.filter(e => e.severity === 'critical').length,
        active: tix.filter(t => ['open', 'investigating', 'escalated'].includes(t.status)).length,
        devices: devs.length,
      })
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }, [token])

  useEffect(() => { if (token) refresh() }, [token, refresh])

  // Auto-refresh every 15s
  useEffect(() => {
    if (!token) return
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [token, refresh])

  // ─── Login ─────────────────────────────────────────────────────────
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
    setToken('')
    setShowLogin(true)
  }

  if (showLogin || !token) {
    return <LoginScreen tokenInput={tokenInput} setTokenInput={setTokenInput} onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <Sidebar view={view} setView={setView} stats={stats} wsConnected={wsConnected} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto" style={{ maxHeight: '100vh' }}>
        {view === 'dashboard' && <Dashboard events={events} tickets={tickets} stats={stats} wsConnected={wsConnected} />}
        {view === 'devices' && <DevicesView devices={devices} token={token} onRefresh={refresh} />}
        {view === 'tickets' && <TicketsView tickets={tickets} onSelect={setSelectedTicket} />}
        {view === 'officer' && <OfficerView tickets={tickets} token={token} onSelect={setSelectedTicket} />}
        {view === 'notifications' && <NotificationsView notifications={notifications} />}
      </main>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketModal ticket={selectedTicket} token={token} onClose={() => setSelectedTicket(null)} onRefresh={refresh} />
      )}
    </div>
  )
}

// ─── Login Screen ─────────────────────────────────────────────────────
function LoginScreen({ tokenInput, setTokenInput, onLogin }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-md w-full slide-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/15 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-2">THYNKLAYER</h1>
          <p className="text-gray-400 text-sm">Sovereign AI Platform for Physical Security</p>
        </div>
        <form onSubmit={onLogin} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">API Token</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter your tenant API token"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
            Access Dashboard →
          </button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-6">
          Demo Token: <code className="text-gray-400">1950d00f-eb7d-47df-b34c-02321b294eb9</code>
        </p>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────
function Sidebar({ view, setView, stats, wsConnected, onLogout }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'devices', label: 'Devices', icon: Cpu, badge: stats.devices },
    { id: 'tickets', label: 'Tickets', icon: AlertTriangle, badge: stats.active },
    { id: 'officer', label: 'Field Officer', icon: Smartphone },
    { id: 'notifications', label: 'Alerts', icon: Bell },
  ]

  return (
    <aside className="w-16 md:w-64 border-r border-gray-800 flex flex-col" style={{ background: '#0d1320' }}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-3">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-500/15 rounded-xl shrink-0">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div className="hidden md:block">
          <div className="font-bold text-sm">THYNKLAYER</div>
          <div className="text-[10px] text-gray-500">AI Security Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 md:p-3 space-y-1">
        {items.map(item => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:bg-gray-800/50'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
              {item.badge ? (
                <span className="hidden md:inline ml-auto bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* Status + Logout */}
      <div className="p-3 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          <span className="hidden md:inline">{wsConnected ? 'Live' : 'Disconnected'}</span>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <XCircle className="w-5 h-5" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </aside>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────
function Dashboard({ events, tickets, stats, wsConnected }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Security Operations Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time AI-correlated security intelligence</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
          wsConnected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          {wsConnected ? 'Live Monitoring' : 'Reconnecting...'}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Cpu} label="Connected Devices" value={stats.devices} color="blue" />
        <StatCard icon={AlertTriangle} label="Active Tickets" value={stats.active} color="amber" />
        <StatCard icon={Flame} label="Critical Events" value={stats.critical} color="red" />
        <StatCard icon={Activity} label="Total Events" value={stats.total} color="purple" />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Event Feed */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400" /> Live Event Stream
            </h2>
            <span className="text-xs text-gray-500">{events.length} events</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.length === 0 && <EmptyState text="No events yet. Run the simulator to see live data." />}
            {events.map((ev, i) => <EventRow key={ev.id + i} event={ev} />)}
          </div>
        </div>

        {/* Active Tickets */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Active Tickets
            </h2>
            <span className="text-xs text-gray-500">{tickets.filter(t => t.status !== 'resolved' && t.status !== 'false_alarm').length} open</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tickets.length === 0 && <EmptyState text="No tickets yet. Events will auto-create tickets." />}
            {tickets.map((t, i) => <TicketRow key={t.id + i} ticket={t} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-500/15 text-blue-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
    purple: 'bg-purple-500/15 text-purple-400',
  }
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}

// ─── Event Row ────────────────────────────────────────────────────────
function EventRow({ event }) {
  const sev = SEV_COLORS[event.severity] || SEV_COLORS.info
  const typeIcons = {
    fire_detected: Flame,
    smoke_detected: AlertTriangle,
    temperature_reading: Thermometer,
    human_detected: User,
    unauthorized_access: Lock,
    motion_detected: Eye,
  }
  const Icon = typeIcons[event.event_type] || Activity

  return (
    <div className={`rounded-lg p-3 border ${sev.border} ${sev.bg} slide-in`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sev.bg}`}>
          <Icon className={`w-4 h-4 ${sev.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase font-medium ${sev.text}`}>{event.severity}</span>
            <span className="text-[10px] text-gray-500">{event.device}</span>
            <span className="text-[10px] text-gray-600 ml-auto">{new Date(event.timestamp).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm text-gray-300 truncate">{event.message}</p>
          {event.ai_analysis && (
            <p className="text-xs text-blue-400/70 mt-1 line-clamp-2">{event.ai_analysis.substring(0, 120)}...</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Row ───────────────────────────────────────────────────────
function TicketRow({ ticket }) {
  const sev = SEV_COLORS[ticket.severity] || SEV_COLORS.info
  const statusCls = STATUS_COLORS[ticket.status] || 'bg-gray-500/15 text-gray-400'
  return (
    <div className="rounded-lg p-3 border border-gray-800 bg-gray-900/50 hover:border-gray-700 transition-colors slide-in">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] uppercase font-medium ${sev.text}`}>{ticket.severity}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusCls}`}>{ticket.status}</span>
      </div>
      <p className="text-sm font-medium text-gray-200">{ticket.title}</p>
      <p className="text-xs text-gray-500 mt-1">{new Date(ticket.created_at).toLocaleString()}</p>
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
      setShowAdd(false)
      onRefresh()
    } catch (err) { alert('Error adding device') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Devices</h1>
          <p className="text-gray-500 text-sm mt-1">Vendor-neutral device integration</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <Cpu className="w-4 h-4" /> Add Device
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card p-5 space-y-3 slide-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Device Name" value={newDevice.name} onChange={e => setNewDevice({ ...newDevice, name: e.target.value })} required />
            <select className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" value={newDevice.device_type} onChange={e => setNewDevice({ ...newDevice, device_type: e.target.value })}>
              <option value="camera">Camera</option>
              <option value="sensor">Sensor</option>
              <option value="door">Door / Access Control</option>
            </select>
            <input className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Location (e.g. Floor 2, Server Room)" value={newDevice.location_desc} onChange={e => setNewDevice({ ...newDevice, location_desc: e.target.value })} />
            <input className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Endpoint (RTSP URL / API / MQTT)" value={newDevice.endpoint} onChange={e => setNewDevice({ ...newDevice, endpoint: e.target.value })} />
          </div>
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Connect Device</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map(d => <DeviceCard key={d.id} device={d} />)}
      </div>
    </div>
  )
}

function DeviceCard({ device }) {
  const Icon = DEVICE_ICONS[device.type] || Cpu
  return (
    <div className="card p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{device.name}</div>
          <div className="text-xs text-gray-500 mt-1">{device.location || 'No location set'}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${device.status === 'online' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              ● {device.status}
            </span>
            <span className="text-[10px] text-gray-500 uppercase">{device.type} · {device.protocol}</span>
          </div>
          {device.capabilities && device.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {device.capabilities.map(c => <span key={c} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{c}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tickets View ─────────────────────────────────────────────────────
function TicketsView({ tickets, onSelect }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security Tickets</h1>
        <p className="text-gray-500 text-sm mt-1">AI-generated incident tickets with response workflows</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'open', 'investigating', 'escalated', 'resolved'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
            filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}>
            {f} {f !== 'all' && `(${tickets.filter(t => t.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <EmptyState text="No tickets found." />}
        {filtered.map(t => (
          <div key={t.id} onClick={() => onSelect(t)} className="card p-4 cursor-pointer hover:border-blue-500/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                t.severity === 'critical' ? 'bg-red-500/15 text-red-400' : t.severity === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
              }`}>
                {t.event_type?.includes('fire') ? <Flame className="w-5 h-5" /> : t.event_type?.includes('access') || t.event_type?.includes('human') ? <Lock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                  <span className={`text-[10px] uppercase ${SEV_COLORS[t.severity]?.text || ''}`}>{t.severity}</span>
                  {t.escalation_triggered && <span className="text-[10px] text-red-400 flex items-center gap-1"><Zap className="w-3 h-3" /> ESCALATED</span>}
                </div>
                <div className="font-medium text-sm">{t.title}</div>
                <div className="text-xs text-gray-500 mt-1">{new Date(t.created_at).toLocaleString()}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Officer View (Mobile-First) ─────────────────────────────────────
function OfficerView({ tickets, token, onSelect }) {
  const myTickets = tickets.filter(t => ['open', 'investigating', 'escalated'].includes(t.status))

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500/15 rounded-2xl mb-3">
          <Smartphone className="w-7 h-7 text-blue-400" />
        </div>
        <h1 className="text-xl font-bold">Field Officer View</h1>
        <p className="text-gray-500 text-sm mt-1">Assigned investigation tickets</p>
      </div>

      {myTickets.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-400">All clear — no pending tickets.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myTickets.map(t => (
            <div key={t.id} onClick={() => onSelect(t)} className="card p-4 cursor-pointer active:scale-95 transition-transform">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                <span className={`text-[10px] uppercase ${SEV_COLORS[t.severity]?.text}`}>{t.severity}</span>
              </div>
              <div className="font-medium text-sm mb-2">{t.title}</div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" /> {new Date(t.created_at).toLocaleTimeString()}
                <span className="ml-auto flex items-center gap-1 text-blue-400">Open <ChevronRight className="w-3 h-3" /></span>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alerts & Notifications</h1>
        <p className="text-gray-500 text-sm mt-1">Real-time push notifications</p>
      </div>
      <div className="space-y-2">
        {notifications.length === 0 && <EmptyState text="No notifications yet." />}
        {notifications.map((n, i) => {
          const sev = SEV_COLORS[n.severity] || SEV_COLORS.info
          return (
            <div key={i} className={`rounded-lg p-3 border ${sev.border} ${sev.bg} slide-in flex items-start gap-3`}>
              <Bell className={`w-4 h-4 ${sev.text} shrink-0 mt-0.5`} />
              <div>
                <div className="font-medium text-sm">{n.title}</div>
                <div className="text-xs text-gray-400 mt-1">{n.body}</div>
                <div className="text-[10px] text-gray-600 mt-1">{new Date(n.timestamp).toLocaleString()}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Ticket Modal (Checklist + Escalation) ───────────────────────────
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
      setResult(res)
      onRefresh()
    } catch (err) {
      alert('Error submitting checklist')
    }
    setSubmitting(false)
  }

  const allChecked = checklist.every(c => c.checked)
  const sev = SEV_COLORS[ticket.severity] || SEV_COLORS.info

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto slide-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sev.bg}`}>
              {ticket.event_type?.includes('fire') ? <Flame className={`w-5 h-5 ${sev.text}`} /> : <Lock className={`w-5 h-5 ${sev.text}`} />}
            </div>
            <div>
              <div className="font-semibold">{ticket.title}</div>
              <div className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleString()}</div>
            </div>
          </div>
          <button onClick={onClose}><XCircle className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Description */}
        {ticket.description && (
          <div className="bg-gray-900/50 rounded-lg p-3 mb-4 text-sm text-gray-400 whitespace-pre-wrap">{ticket.description}</div>
        )}

        {/* Result (after submit) */}
        {result ? (
          <div className={`p-4 rounded-lg text-center ${result.escalation_triggered ? 'bg-red-500/15' : 'bg-green-500/15'}`}>
            {result.escalation_triggered ? (
              <>
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="font-semibold text-red-400">ESCALATED TO EMERGENCY SERVICES</p>
                <p className="text-sm text-gray-400 mt-1">{result.message}</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="font-semibold text-green-400">Checklist Submitted</p>
                <p className="text-sm text-gray-400 mt-1">{result.message}</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Checklist */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Investigation Checklist
              </h3>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <label key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/50 hover:bg-gray-900 cursor-pointer transition-colors">
                    <button
                      onClick={() => toggleItem(idx)}
                      className={`w-5 h-5 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                        item.checked ? 'bg-green-600 border-green-600' : 'border-gray-600'
                      }`}
                    >
                      {item.checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <span className={`text-sm ${item.checked ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="text-sm font-semibold text-gray-300 mb-2 block">Resolution Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add observations, findings, actions taken..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
              />
            </div>

            {/* Suspicious Toggle */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer mb-4">
              <input type="checkbox" checked={suspicious} onChange={e => setSuspicious(e.target.checked)} className="w-4 h-4" />
              <div>
                <span className="text-sm font-medium text-red-400">Mark as Suspicious</span>
                <p className="text-xs text-gray-500">This will trigger immediate escalation to emergency services</p>
              </div>
            </label>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
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
    <div className="text-center py-8 text-gray-500">
      <p className="text-sm">{text}</p>
    </div>
  )
}
