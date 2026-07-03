# 🔒 THYNKLAYER

**Sovereign AI Platform for Physical Security**

The AI Intelligence Layer that sits above existing security infrastructure — connecting cameras, sensors, and access control systems into one unified, AI-driven operational command center.

Built in the UAE. Powered by AI. Trusted by the World.

---

## 🎯 What It Does

THYNKLAYER doesn't replace hardware — it makes it intelligent. The platform connects any existing security device via generic APIs, correlates events using AI, and automates incident response workflows.

### Core Scenario Examples:

**🔥 Fire Detection:**
```
Camera AI detects fire/smoke
  → AI cross-checks temperature sensor: "Is temp rising?"
  → AI cross-checks smoke detector: "Is smoke confirmed?"
  → Multi-device correlation confirms threat
  → Auto-creates ticket → Officer notified
  → Officer investigates on-site with checklist
  → If suspicious → Auto-escalate to Fire Department
```

**🚨 Unauthorized Access:**
```
Camera AI detects human at door (after hours)
  → AI cross-checks door access log: "Was access denied?"
  → Human + Denied + After Hours = Confirmed Intrusion
  → Auto-creates ticket → Security officer dispatched
  → Officer investigates with checklist
  → If suspicious → Auto-escalate to Police
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│         REACT PWA DASHBOARD (Mobile + Desktop)    │
│  Dashboard · Devices · Tickets · Field Officer    │
└──────────────────────┬──────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────┴──────────────────────────┐
│           FASTAPI BACKEND (Python)                │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ Devices   │ │ Tickets   │ │  AI Correlation │  │
│  │ API       │ │ + Workflow│ │  Engine (Brain) │  │
│  └──────────┘ └───────────┘ └───────┬────────┘  │
│  ┌──────────────────────────────────┐           │
│  │   Notification Service (FCM)     │           │
│  └──────────────────────────────────┘           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              SQLITE / POSTGRESQL                  │
└─────────────────────────────────────────────────┘
```

### AI Correlation Engine

The brain of the platform. When any device sends an event, the AI engine:

1. **Looks at OTHER devices** at the same site
2. **Checks their recent readings** for corroborating signals
3. **Decides** if this is a real threat or false alarm
4. **Generates recommended action** (create ticket, escalate, log only)

---

## 💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS + Lucide Icons |
| **Mobile** | PWA (installable, service worker, offline support) |
| **Backend** | Python FastAPI + Uvicorn (ASGI) |
| **Database** | SQLite (prototype) → PostgreSQL (production) |
| **Real-time** | WebSocket (live event streaming) |
| **Notifications** | Firebase Cloud Messaging (FCM) — ready for config |
| **AI** | Rule-based correlation engine → LLM integration (production) |
| **Deployment** | Nginx reverse proxy + systemd |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm

### Backend
```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 3100
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # Development at http://localhost:3101
npm run build  # Production build to dist/
```

### Run Simulator (Demo Data)
```bash
cd backend
python3 simulator.py --scenario all
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tenants` | Register a new tenant/company |
| GET | `/api/v1/sites` | List sites |
| POST | `/api/v1/sites` | Create a site |
| GET | `/api/v1/devices` | List devices |
| POST | `/api/v1/devices` | Register any device (camera, sensor, door) |
| POST | `/api/v1/events` | Device pushes event → AI correlation triggered |
| GET | `/api/v1/events` | List events |
| GET | `/api/v1/tickets` | List tickets |
| GET | `/api/v1/tickets/{id}` | Get ticket details |
| PATCH | `/api/v1/tickets/{id}` | Submit checklist / escalate |
| GET | `/api/v1/notifications` | List notifications |
| WS | `/ws` | WebSocket for real-time updates |
| GET | `/docs` | Interactive API documentation (Swagger) |
| GET | `/health` | Health check |

### Authentication
All authenticated endpoints require a tenant API token:
```
?token=<your_api_token>
```

---

## 🔌 Device Integration Models

### 1. Edge Agent (On-Premise)
A lightweight Docker container runs on the client's local network, talks to local devices via native protocols (ONVIF, MQTT, BACnet), and forwards events to THYNKLAYER cloud via outbound HTTPS only.

### 2. API Webhook (Cloud Devices)
Cloud-native devices (Verkada, Arlo, smart sensors) push events directly to THYNKLAYER's webhook endpoint via HTTPS.

### 3. RTSP Stream Pull
Edge agent pulls RTSP video streams locally, extracts frames, and sends to AI engine for analysis.

---

## 🎮 Demo Token

```
Token: 1950d00f-eb7d-47df-b34c-02321b294eb9
```

---

## 📁 Project Structure

```
thynklayer/
├── backend/
│   ├── main.py           # FastAPI app entry point
│   ├── database.py       # SQLAlchemy setup
│   ├── models.py         # Database models
│   ├── routes.py         # REST API routes
│   ├── ai_engine.py      # AI correlation engine (the brain)
│   ├── notifications.py  # FCM + WebSocket notifications
│   ├── simulator.py      # Device event simulator
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main React application
│   │   ├── main.jsx      # Entry point
│   │   └── index.css     # Global styles + Tailwind
│   ├── public/
│   │   ├── manifest.json # PWA manifest
│   │   └── sw.js         # Service worker
│   ├── vite.config.js
│   └── index.html
└── README.md
```

---

## 🔮 Production Roadmap

- [ ] PostgreSQL migration
- [ ] Firebase FCM push notifications activation
- [ ] LLM-powered AI Copilot (natural language queries)
- [ ] Real device integrations (Genetec, Milestone, LenelS2)
- [ ] Multi-tenant RBAC + JWT authentication
- [ ] Kubernetes deployment
- [ ] UAE sovereign cloud deployment
- [ ] Digital Twin (3D site models)
- [ ] Predictive risk scoring

---

## 🏢 About

**THYNKLAYER** is a sovereign AI platform for physical security, originating from the UAE. It transforms fragmented security infrastructure into a unified, intelligent, cloud-native operational ecosystem.

© 2026 THYNKLAYER. All rights reserved.
