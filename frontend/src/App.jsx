import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Cpu, Camera, Thermometer, DoorClosed, AlertTriangle, Flame,
  Bell, CheckCircle2, XCircle, Clock, Activity, MapPin, Zap, ChevronRight,
  Smartphone, Lock, Eye, Send, Loader2, Sun, Moon, Menu, X, Home,
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

// ─── Theme hook ───────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('tl_theme') || 'light'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('tl_theme', theme)
  }, [theme])
  return { theme, toggle: () => setTheme(t => t === 'light' ? 'dark' : 'light') }
}

// ─── Severity helpers ────────────────────────────────────────────────
const SEV = {
  critical: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', label: 'Critical' },
  warning:  { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', label: 'Warning' },
  info:     { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6', label: 'Info' },
}

const STATUS = {
  open:         { label: 'Open',          color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  investigating:{ label: 'Investigating', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  escalated:    { label: 'Escalated',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  resolved:     { label: 'Resolved',      color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  false_alarm:  { label: 'False Alarm',   color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
}

const DEVICE_ICON = { camera: Camera, sensor: Thermometer, door: DoorClosed }

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const { theme, toggle } = useTheme()
  const [token, setToken] = useState(localStorage.getItem('tl_token') || '')
  const [view, setView] = useState('dashboard')
  const [wsConnected, setWsConnected] = useState(false)
  const [events, setEvents] = useState([])
  const [devices, setDevices] = useState([])
  const [tickets, setTickets] = useState([])
  const [notifications, setNotifications] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)

  const isAuthed = !!token

  // ─── WebSocket ──────────────────────────────────────────────────────
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
      else if (msg.type === 'ticket') { setTickets(p => [msg.payload, ...p].slice(0, 50)); setNotifications(p => [msg.payload, ...p].slice(0, 20)) }
      else if (msg.type === 'notification') setNotifications(p => [msg.payload, ...p].slice(0, 20))
      else if (msg.type === 'ticket_update') setTickets(p => p.map(t => t.id === msg.payload.id ? { ...t, ...msg.payload } : t))
    }
    return () => ws.close()
  }, [token])

  // ─── Fetch data ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [evs, devs, tix] = await Promise.all([
        api('/events?limit=50', 'GET', null, token),
        api('/devices', 'GET', null, token),
        api('/tickets', 'GET', null, token),
      ])
      setEvents(evs); setDevices(devs); setTickets(tix)
    } catch {}
  }, [token])

  useEffect(() => { if (token) refresh() }, [token, refresh])
  useEffect(() => {
    if (!token) return
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [token, refresh])

  const handleLogin = (newToken) => {
    localStorage.setItem('tl_token', newToken)
    setToken(newToken)
  }
  const handleLogout = () => {
    localStorage.removeItem('tl_token')
    setToken('')
  }

  if (!isAuthed) return <Login onLogin={handleLogin} theme={theme} onToggleTheme={toggle} />

  const stats = {
    devices: devices.length,
    active: tickets.filter(t => ['open', 'investigating', 'escalated'].includes(t.status)).length,
    critical: events.filter(e => e.severity === 'critical').length,
    total: events.length,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopBar theme={theme} toggle={theme === 'light' ? 'dark' : 'light'} onToggle={toggle} onLogout={handleLogout} wsConnected={wsConnected} />
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 pb-28 md:pb-10">
        {view === 'dashboard' && <Dashboard events={events} tickets={tickets} stats={stats} wsConnected={wsConnected} />}
        {view === 'devices' && <DevicesView devices={devices} token={token} onRefresh={refresh} />}
        {view === 'tickets' && <TicketsView tickets={tickets} onSelect={setSelectedTicket} />}
        {view === 'officer' && <OfficerView tickets={tickets} onSelect={setSelectedTicket} />}
      </div>
      {/* Mobile bottom nav */}
      <MobileNav view={view} setView={setView} />
      {/* Desktop sidebar floating */}
      <DesktopNav view={view} setView={setView} />
      {selectedTicket && <TicketModal ticket={selectedTicket} token={token} onClose={() => setSelectedTicket(null)} onRefresh={refresh} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════
function Login({ onLogin, theme, onToggleTheme }) {
  const [tokenInput, setTokenInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tokenInput.trim()) return
    setLoading(true)
    try {
      await api('/devices', 'GET', null, tokenInput.trim())
      onLogin(tokenInput.trim())
    } catch {
      onLogin(tokenInput.trim())
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        style={{
          position: 'absolute', top: 24, right: 24,
          background: 'var(--card)', border: '1.5px solid var(--border)',
          borderRadius: 12, padding: 10, cursor: 'pointer',
          color: 'var(--text-secondary)',
        }}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      <div className="fade-in" style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72,
            background: 'var(--accent-light)', borderRadius: 20, marginBottom: 20,
          }}>
            <Shield size={36} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            THYNKLAYER
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Sovereign AI Platform for Physical Security
          </p>
        </div>

        {/* Form card */}
        <div className="tl-card" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Access Token
              </label>
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Enter your API token"
                className="tl-input"
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="tl-btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              {loading ? 'Connecting...' : 'Access Dashboard'}
            </button>
          </form>
        </div>

        {/* Demo hint */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => { setTokenInput('1950d00f-eb7d-47df-b34c-02321b294eb9'); }}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
              fontSize: 14, fontWeight: 500,
            }}
          >
            Use demo token →
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════
function TopBar({ theme, onToggle, onLogout, wsConnected }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--accent-light)',
        }}>
          <Shield size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>THYNKLAYER</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Live status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          background: wsConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: wsConnected ? '#10b981' : '#ef4444',
        }}>
          <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
          {wsConnected ? 'Live' : 'Off'}
        </div>
        {/* Theme toggle */}
        <button onClick={onToggle} style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-secondary)',
        }}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        {/* Logout */}
        <button onClick={onLogout} style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-muted)',
        }}>
          <X size={18} />
        </button>
      </div>
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'devices',   label: 'Devices',   icon: Cpu },
  { id: 'tickets',   label: 'Tickets',   icon: AlertTriangle },
  { id: 'officer',   label: 'Officer',   icon: Smartphone },
]

function MobileNav({ view, setView }) {
  return (
    <nav className="safe-bottom" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      display: 'flex', padding: '8px 4px',
    }}>
      <div className="md:hidden" style={{ display: 'flex', width: '100%', justifyContent: 'space-around' }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button key={item.id} onClick={() => setView(item.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              <Icon size={22} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function DesktopNav({ view, setView }) {
  return (
    <nav className="hidden md:flex" style={{
      position: 'fixed', top: '50%', left: 24, transform: 'translateY(-50%)',
      zIndex: 40, flexDirection: 'column', gap: 4,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 8,
    }}>
      {NAV_ITEMS.map(item => {
        const Icon = item.icon
        const active = view === item.id
        return (
          <button key={item.id} onClick={() => setView(item.id)} title={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
            background: active ? 'var(--accent-light)' : 'none', border: 'none',
            color: active ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: active ? 600 : 500, fontSize: 14,
          }}>
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function Dashboard({ events, tickets, stats, wsConnected }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Security Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Real-time AI-correlated security intelligence
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard icon={Cpu} label="Devices" value={stats.devices} color="#3b82f6" />
        <StatCard icon={AlertTriangle} label="Active Tickets" value={stats.active} color="#f59e0b" />
        <StatCard icon={Flame} label="Critical Events" value={stats.critical} color="#ef4444" />
        <StatCard icon={Activity} label="Total Events" value={stats.total} color="#8b5cf6" />
      </div>

      {/* Two column */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* Live Events */}
        <div className="tl-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Live Events</h2>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{events.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {events.length === 0 && <Empty text="No events yet" />}
            {events.map((ev, i) => <EventRow key={ev.id + i} event={ev} />)}
          </div>
        </div>

        {/* Active Tickets */}
        <div className="tl-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Tickets</h2>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tickets.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {tickets.length === 0 && <Empty text="No tickets yet" />}
            {tickets.map((t, i) => <TicketRowMini key={t.id + i} ticket={t} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="tl-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}15`,
      }}>
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT ROW
// ═══════════════════════════════════════════════════════════════════════
function EventRow({ event }) {
  const s = SEV[event.severity] || SEV.info
  const icons = {
    fire_detected: Flame, smoke_detected: AlertTriangle, temperature_reading: Thermometer,
    human_detected: Eye, unauthorized_access: Lock, motion_detected: Activity,
  }
  const Icon = icons[event.event_type] || Activity

  return (
    <div className="slide-up" style={{
      background: 'var(--bg-secondary)', borderRadius: 12, padding: 14,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: s.bg,
        }}>
          <Icon size={18} style={{ color: s.text }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: s.text }}>{event.severity}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.device}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.message}
          </p>
          {event.ai_analysis && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🤖 {event.ai_analysis.substring(0, 80)}...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TICKET ROW (mini for dashboard)
// ═══════════════════════════════════════════════════════════════════════
function TicketRowMini({ ticket }) {
  const st = STATUS[ticket.status] || STATUS.open
  return (
    <div className="slide-up" style={{
      background: 'var(--bg-secondary)', borderRadius: 12, padding: 14,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 6 }}>
          {st.label}
        </span>
        {ticket.escalation_triggered && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Zap size={10} /> ESCALATED
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, fontWeight: 500 }}>{ticket.title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {new Date(ticket.created_at).toLocaleString()}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// DEVICES VIEW
// ═══════════════════════════════════════════════════════════════════════
function DevicesView({ devices, token, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', device_type: 'camera', location_desc: '', endpoint: '' })

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await api('/devices', 'POST', {
        ...form,
        capabilities: form.device_type === 'camera' ? ['fire_detection', 'human_detection'] : form.device_type === 'sensor' ? ['temperature'] : ['access_control'],
      }, token)
      setForm({ name: '', device_type: 'camera', location_desc: '', endpoint: '' })
      setShowAdd(false)
      onRefresh()
    } catch { alert('Error adding device') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Devices</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Vendor-neutral integration</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="tl-btn-primary" style={{ padding: '10px 18px', fontSize: 14 }}>
          + Add Device
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="tl-card slide-up" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <input className="tl-input" placeholder="Device name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <select className="tl-input" value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}>
              <option value="camera">Camera</option>
              <option value="sensor">Sensor</option>
              <option value="door">Door / Access</option>
            </select>
            <input className="tl-input" placeholder="Location" value={form.location_desc} onChange={e => setForm({ ...form, location_desc: e.target.value })} />
            <input className="tl-input" placeholder="Endpoint URL" value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })} />
          </div>
          <button type="submit" className="tl-btn-primary" style={{ alignSelf: 'flex-start' }}>Connect</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {devices.map(d => <DeviceCard key={d.id} device={d} />)}
      </div>
    </div>
  )
}

function DeviceCard({ device }) {
  const Icon = DEVICE_ICON[device.type] || Cpu
  return (
    <div className="tl-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-light)',
        }}>
          <Icon size={22} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{device.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{device.location || 'No location'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: device.status === 'online' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: device.status === 'online' ? '#10b981' : '#ef4444',
            }}>● {device.status}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{device.type} · {device.protocol}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TICKETS VIEW
// ═══════════════════════════════════════════════════════════════════════
function TicketsView({ tickets, onSelect }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const filters = ['all', 'open', 'investigating', 'escalated', 'resolved']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Tickets</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>AI-generated incident tickets</p>
      </div>

      {/* Filter chips */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            border: '1px solid var(--border)', cursor: 'pointer',
            background: filter === f ? 'var(--accent)' : 'var(--card)',
            color: filter === f ? '#fff' : 'var(--text-secondary)',
            textTransform: 'capitalize', whiteSpace: 'nowrap',
          }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && <Empty text="No tickets" />}
        {filtered.map(t => <TicketCard key={t.id} ticket={t} onClick={() => onSelect(t)} />)}
      </div>
    </div>
  )
}

function TicketCard({ ticket, onClick }) {
  const st = STATUS[ticket.status] || STATUS.open
  const sev = SEV[ticket.severity] || SEV.info
  return (
    <div onClick={onClick} className="tl-card" style={{
      padding: 20, cursor: 'pointer',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: sev.bg,
        }}>
          {ticket.event_type?.includes('fire') ? <Flame size={22} style={{ color: sev.text }} /> :
           ticket.event_type?.includes('access') || ticket.event_type?.includes('human') ? <Lock size={22} style={{ color: sev.text }} /> :
           <AlertTriangle size={22} style={{ color: sev.text }} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 6 }}>{st.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: sev.text, textTransform: 'uppercase' }}>{sev.label}</span>
            {ticket.escalation_triggered && <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 2 }}><Zap size={10} /> Escalated</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{ticket.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(ticket.created_at).toLocaleString()}</div>
        </div>
        <ChevronRight size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// OFFICER VIEW
// ═══════════════════════════════════════════════════════════════════════
function OfficerView({ tickets, onSelect }) {
  const active = tickets.filter(t => ['open', 'investigating', 'escalated'].includes(t.status))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', paddingTop: 12 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 56, borderRadius: 16, marginBottom: 12,
          background: 'var(--accent-light)',
        }}>
          <Smartphone size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Field Officer</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 14 }}>{active.length} active investigations</p>
      </div>

      {active.length === 0 ? (
        <div className="tl-card" style={{ padding: 40, textAlign: 'center' }}>
          <CheckCircle2 size={40} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)' }}>All clear — no pending tickets</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map(t => <TicketCard key={t.id} ticket={t} onClick={() => onSelect(t)} />)}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TICKET MODAL
// ═══════════════════════════════════════════════════════════════════════
function TicketModal({ ticket, token, onClose, onRefresh }) {
  const [checklist, setChecklist] = useState(ticket.checklist || [])
  const [notes, setNotes] = useState(ticket.resolution_notes || '')
  const [suspicious, setSuspicious] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const toggle = (i) => setChecklist(p => p.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c))
  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await api(`/tickets/${ticket.id}`, 'PATCH', { checklist, resolution_notes: notes, suspicious }, token)
      setResult(res); onRefresh()
    } catch { alert('Error submitting') }
    setSubmitting(false)
  }

  return (
    <div onClick={onClose} className="fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="slide-up tl-card" style={{
        width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
        borderRadius: '24px 24px 0 0',
        padding: 28,
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, flex: 1, paddingRight: 16 }}>{ticket.title}</div>
          <button onClick={onClose} style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {ticket.description && (
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, marginBottom: 24,
            fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
          }}>
            {ticket.description}
          </div>
        )}

        {result ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            {result.escalation_triggered ? (
              <>
                <AlertTriangle size={48} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>Escalated to Emergency Services</div>
                <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{result.message}</p>
              </>
            ) : (
              <>
                <CheckCircle2 size={48} style={{ color: '#10b981', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 18, fontWeight: 700 }}>Checklist Submitted</div>
                <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{result.message}</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Checklist */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} /> Investigation Checklist
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checklist.map((item, i) => (
                  <button key={i} onClick={() => toggle(i)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
                    padding: 14, borderRadius: 12, cursor: 'pointer',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                      border: item.checked ? 'none' : '2px solid var(--border-strong)',
                      background: item.checked ? '#10b981' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.checked && <CheckCircle2 size={14} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 14, textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? 'var(--text-muted)' : 'var(--text)' }}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'block' }}>Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add observations, findings, actions taken..."
                className="tl-input"
                style={{ minHeight: 80, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            {/* Suspicious toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 16,
              borderRadius: 12, cursor: 'pointer', marginBottom: 24,
              background: suspicious ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)',
              border: suspicious ? '1.5px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
            }}>
              <input type="checkbox" checked={suspicious} onChange={e => setSuspicious(e.target.checked)} style={{ width: 20, height: 20 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: suspicious ? '#ef4444' : 'var(--text)' }}>Mark as Suspicious</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Triggers immediate emergency escalation</div>
              </div>
            </label>

            <button onClick={submit} disabled={submitting} className="tl-btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {suspicious ? 'Submit & Escalate' : 'Submit Checklist'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════
function Empty({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
      {text}
    </div>
  )
}
