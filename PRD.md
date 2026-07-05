# 📋 THYNKLAYER — Product Requirements Document (PRD)

**Sovereign AI Platform for Physical Security**
**Version:** 1.0 | **Date:** June 2026 | **Status:** MVP Prototype

---

## 1. Executive Summary

THYNKLAYER is a cloud-native, vendor-neutral AI platform that acts as an "Intelligence Layer" above existing physical security infrastructure. It connects cameras, sensors, and access control systems into a unified operational command center — without replacing any hardware.

The platform uses AI to correlate events across multiple devices in real time, automate incident response, and ensure compliance — transforming fragmented, manual security operations into an intelligent, automated ecosystem.

---

## 2. Problem Statement

### Current Industry Pain Points:
- **Fragmented Systems:** VMS, access control, and building systems operate in silos with no shared intelligence
- **Vendor Lock-In:** Proprietary ecosystems trap organizations with single-vendor dependencies
- **Manual Monitoring:** Security teams rely on human monitoring — slow response, high error rates, operator fatigue
- **No Multi-Device Correlation:** A camera detects fire, a sensor detects temperature, but nobody connects the dots
- **Slow Incident Response:** Average response time of 17+ minutes in manual environments
- **Compliance Complexity:** Data residency, privacy regulations unmanageable without automation

---

## 3. Target Users

| User | Role | Primary Need |
|------|------|-------------|
| **Security Operator** | Monitors dashboard in a control room | Real-time visibility, AI-assisted decisions |
| **Field Officer** | Responds to incidents on-site | Mobile checklist, quick escalation |
| **Security Manager** | Oversees operations across sites | Analytics, compliance reporting |
| **IT/Integration Team** | Connects devices to platform | Easy API integration, vendor-neutral |
| **Tenant Admin** | Manages subscription and users | Multi-tenant management, billing |

---

## 4. Core Features (MVP)

### 4.1 Vendor-Neutral Device Integration
- **Register any device** via standardized REST API
- Supported device types: Camera, Sensor (temperature/smoke/motion), Door/Access Control
- Generic protocol adapter — connect via ONVIF, MQTT, RTSP, or custom HTTP endpoints
- No hardware replacement required

### 4.2 AI Correlation Engine (The Brain)
When any device sends an event, the AI engine:

1. **Identifies related devices** at the same site
2. **Checks their recent readings** for corroborating signals
3. **Applies decision logic** to determine if threat is confirmed
4. **Generates recommended action** — create ticket, escalate, or log only

**Correlation Scenarios:**

| Trigger Event | Cross-Check Devices | Decision Logic |
|--------------|--------------------|----|
| Camera: Fire detected | Temperature sensor, Smoke detector | If temp > 60°C OR smoke confirmed → CRITICAL |
| Camera: Human detected | Door access log | If access DENIED + after hours → CRITICAL INTRUSION |
| Sensor: Temperature high | Camera feed | If camera shows fire/smoke → CRITICAL; else → WARNING |
| Door: Unauthorized access | Camera at same location | If human detected + after hours → CRITICAL |

### 4.3 Ticketing & Workflow System
- **Auto-generated tickets** on confirmed AI events
- Each event type has a **predefined investigation checklist**
- Officer receives push notification → opens ticket on mobile
- Officer completes checklist on-site → submits findings
- **If suspicious** → automatic escalation to emergency services

### 4.4 Emergency Escalation
- Configurable escalation targets: Fire Department, Hospital, Police
- Triggered when field officer marks incident as suspicious
- Auto-notification with incident details and location

### 4.5 Real-Time Dashboard
- Live event stream via WebSocket
- Device status monitoring (online/offline)
- Active ticket tracking with severity filters
- Stat cards: device count, active tickets, critical events, total events

### 4.6 Field Officer Mobile Interface (PWA)
- Installable on any phone (no app store needed)
- Push notifications via Firebase FCM
- Mobile-optimized ticket view with interactive checklist
- One-tap escalation for emergencies

### 4.7 Multi-Tenant SaaS Architecture
- Each tenant (company) gets isolated data and API token
- Multiple sites per tenant
- Multiple users per tenant with roles (admin, operator, officer)

---

## 5. Technical Architecture

### 5.1 System Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite + Tailwind CSS | Responsive PWA dashboard |
| **Mobile** | PWA (installable, service worker) | Field officer interface |
| **Backend** | Python FastAPI + Uvicorn | Async REST API + WebSocket |
| **Database** | SQLite (MVP) → PostgreSQL (prod) | Tenant data, events, tickets |
| **Real-time** | WebSocket | Live event streaming |
| **Notifications** | Firebase Cloud Messaging (FCM) | Mobile push notifications |
| **AI Engine** | Rule-based correlation → LLM (roadmap) | Cross-device event analysis |
| **Deployment** | Nginx reverse proxy + systemd | Production serving |

### 5.2 Device Connection Models

**Model 1: Edge Agent (On-Premise)**
- Lightweight Docker container on client's local network
- Talks to devices via native protocols (ONVIF, MQTT, BACnet)
- Forwards events to THYNKLAYER cloud via outbound HTTPS only
- No inbound ports opened — fully secure

**Model 2: API Webhook (Cloud Devices)**
- Cloud-native devices push events directly to THYNKLAYER API
- Zero local installation — just configure API keys

**Model 3: RTSP Stream Pull**
- Edge agent pulls video stream locally
- Extracts frames → sends to AI engine for analysis

### 5.3 Security Architecture
- Token-based authentication per tenant
- TLS 1.3 encryption for all traffic
- Zero-trust model (roadmap: full RBAC + JWT)
- Outbound-only connections from edge agents
- Data isolation per tenant

---

## 6. API Specification

### Authentication
All endpoints require tenant API token: `?token=<api_token>`

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/tenants` | Register new tenant → returns API token |
| `GET` | `/api/v1/sites` | List sites for tenant |
| `POST` | `/api/v1/sites` | Create a new site |
| `GET` | `/api/v1/devices` | List all devices |
| `POST` | `/api/v1/devices` | Register a device (camera/sensor/door) |
| `PATCH` | `/api/v1/devices/{id}` | Update device config/status |
| `POST` | `/api/v1/events` | Push event from device → triggers AI correlation |
| `GET` | `/api/v1/events` | List events (latest 50) |
| `GET` | `/api/v1/tickets` | List tickets (filterable by status) |
| `GET` | `/api/v1/tickets/{id}` | Get ticket details with checklist |
| `PATCH` | `/api/v1/tickets/{id}` | Submit checklist / mark suspicious / escalate |
| `GET` | `/api/v1/notifications` | List push notification history |
| `WS` | `/ws` | WebSocket — real-time events, tickets, notifications |
| `GET` | `/docs` | Interactive Swagger API documentation |
| `GET` | `/health` | Health check |

---

## 7. User Flows

### 7.1 Fire Detection Flow
```
1. Camera AI detects fire/smoke (event: fire_detected)
   ↓
2. AI Engine correlates:
   → Checks temperature sensor: "Is temp > 60°C?"
   → Checks smoke detector: "Is smoke confirmed?"
   ↓
3. If corroborated → CRITICAL severity confirmed
   ↓
4. Auto-create ticket with fire investigation checklist
   ↓
5. Push notification sent to field officer via FCM
   ↓
6. Officer opens ticket on mobile PWA
   ↓
7. Officer goes on-site, completes checklist:
   □ Visually confirm fire/smoke
   □ Check if personnel in area
   □ Verify fire suppression active
   □ Ensure exits accessible
   □ Activate evacuation if needed
   ↓
8. If suspicious → AUTO-ESCALATE to Fire Department
   If clear → Ticket resolved, logged
```

### 7.2 Unauthorized Access Flow
```
1. Camera detects human (event: human_detected)
   ↓
2. AI Engine correlates:
   → Checks door access log: "Was access denied?"
   → Checks time: "Is this after hours?"
   ↓
3. If human + denied + after hours → CRITICAL INTRUSION
   ↓
4. Auto-create ticket with security checklist
   ↓
5. Officer dispatched, investigates on-site
   ↓
6. If suspicious → AUTO-ESCALATE to Police
```

---

## 8. Success Metrics (MVP)

| Metric | Target |
|--------|--------|
| Event correlation accuracy | > 85% correct threat assessment |
| Ticket creation latency | < 2 seconds from event to ticket |
| Mobile PWA load time | < 3 seconds on 4G |
| Dashboard real-time latency | < 1 second via WebSocket |
| False alarm reduction | > 80% vs single-device alerts |

---

## 9. Post-MVP Roadmap

### Phase 2: Enterprise Platform (Months 4-12)
- [ ] PostgreSQL migration with multi-region support
- [ ] LLM-powered AI Copilot (natural language queries: "show me all fire events last week")
- [ ] Real device integrations: Genetec, Milestone, LenelS2, Honeywell, Bosch
- [ ] JWT authentication + full RBAC
- [ ] Predictive risk scoring (ML models)
- [ ] Compliance automation (GDPR, UAE Data Law, ISO 27001)
- [ ] Digital Twin — 3D site models with live sensor overlay
- [ ] Kubernetes deployment for horizontal scaling

### Phase 3: Global OS (Months 13-24)
- [ ] API Marketplace for third-party developers
- [ ] Autonomous security operations (AI-driven playbooks)
- [ ] Federated identity matching (face/vehicle recognition)
- [ ] UAE sovereign cloud deployment
- [ ] International expansion (GCC → Europe → Global)

---

## 10. Competitive Differentiation

| Feature | Traditional VMS | PSIM | THYNKLAYER |
|---------|----------------|------|-----------|
| AI event correlation | ❌ | ❌ | ✅ Cross-device |
| Vendor-neutral | ❌ | Partial | ✅ Any device |
| Cloud-native SaaS | ❌ | ❌ | ✅ Multi-tenant |
| Sovereign cloud | ❌ | ❌ | ✅ UAE-compliant |
| Mobile PWA for officers | ❌ | ❌ | ✅ |
| Auto-escalation workflows | ❌ | Manual | ✅ AI-driven |
| API marketplace | ❌ | ❌ | ✅ Roadmap |

---

## 11. Deployment Information

| Item | Detail |
|------|--------|
| **Live URL** | http://thynklayer.tegraz.com |
| **API Docs** | http://thynklayer.tegraz.com/docs |
| **GitHub** | https://github.com/jafir-dev/thynklayer |
| **Demo Token** | `1950d00f-eb7d-47df-b34c-02321b294eb9` |
| **Backend** | FastAPI on port 3100 (systemd) |
| **Frontend** | React PWA served by Nginx |
| **Database** | SQLite (prototype) |

---

*© 2026 THYNKLAYER. Sovereign AI Platform for Physical Security.*
*Built in the UAE. Powered by AI. Trusted by the World.*
