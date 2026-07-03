"""
THYNKLAYER API Routes — all REST endpoints for the platform.

Auth: Simple API token in header (X-Tenant-Token) for prototype.
Production: JWT + full RBAC.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import uuid

from database import get_db
from models import (
    Tenant, Site, User, Device, Event, Ticket,
    EventSeverity, TicketStatus, UserRole,
)
from ai_engine import correlate_event
import notifications

router = APIRouter(prefix="/api/v1")

# ─── Auth ─────────────────────────────────────────────────────────────
async def get_tenant(token: str = Query(None), db: Session = Depends(get_db)) -> Tenant:
    """Simple token-based auth for prototype."""
    if not token:
        raise HTTPException(401, "Missing token. Pass ?token=<api_token>")
    tenant = db.query(Tenant).filter(Tenant.api_token == token).first()
    if not tenant:
        raise HTTPException(401, "Invalid token")
    return tenant


# ─── Tenant / Auth ────────────────────────────────────────────────────
class TenantCreate(BaseModel):
    name: str
    contact_email: str
    plan: str = "trial"


@router.post("/tenants")
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)):
    """Register a new tenant (company). Returns API token."""
    tenant = Tenant(name=payload.name, contact_email=payload.contact_email, plan=payload.plan)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return {"tenant_id": tenant.id, "api_token": tenant.api_token, "name": tenant.name}


@router.get("/tenants/me")
def get_my_tenant(tenant: Tenant = Depends(get_tenant)):
    return {"id": tenant.id, "name": tenant.name, "plan": tenant.plan, "email": tenant.contact_email}


# ─── Sites ─────────────────────────────────────────────────────────────
class SiteCreate(BaseModel):
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.get("/sites")
def list_sites(tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    sites = db.query(Site).filter(Site.tenant_id == tenant.id).all()
    return [
        {"id": s.id, "name": s.name, "address": s.address, "lat": s.lat, "lng": s.lng}
        for s in sites
    ]


@router.post("/sites")
def create_site(payload: SiteCreate, tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    site = Site(tenant_id=tenant.id, **payload.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return {"id": site.id, "name": site.name}


# ─── Devices ───────────────────────────────────────────────────────────
class DeviceCreate(BaseModel):
    name: str
    device_type: str  # camera, sensor, door
    protocol: str = "generic"
    endpoint: Optional[str] = None
    site_id: Optional[str] = None
    location_desc: Optional[str] = None
    capabilities: list[str] = []
    config: dict = {}


@router.get("/devices")
def list_devices(tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    devices = db.query(Device).filter(Device.tenant_id == tenant.id).all()
    result = []
    for d in devices:
        result.append({
            "id": d.id,
            "name": d.name,
            "type": d.device_type,
            "protocol": d.protocol,
            "endpoint": d.endpoint,
            "site_id": d.site_id,
            "location": d.location_desc,
            "capabilities": d.capabilities,
            "status": d.status,
            "config": d.config,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        })
    return result


@router.post("/devices")
def register_device(payload: DeviceCreate, tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    """Register any device — cameras, sensors, doors. This is the vendor-neutral connector."""
    device = Device(
        tenant_id=tenant.id,
        name=payload.name,
        device_type=payload.device_type,
        protocol=payload.protocol,
        endpoint=payload.endpoint,
        site_id=payload.site_id,
        location_desc=payload.location_desc,
        capabilities=payload.capabilities,
        config=payload.config,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return {"id": device.id, "name": device.name, "type": device.device_type, "status": device.status}


@router.patch("/devices/{device_id}")
def update_device(device_id: str, payload: dict, tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.id == device_id, Device.tenant_id == tenant.id).first()
    if not device:
        raise HTTPException(404, "Device not found")
    for k, v in payload.items():
        if hasattr(device, k):
            setattr(device, k, v)
    db.commit()
    return {"status": "updated"}


# ─── Events (Device → Platform) ───────────────────────────────────────
class EventCreate(BaseModel):
    device_id: str
    event_type: str  # fire_detected, temperature_reading, smoke_detected, human_detected, etc.
    message: str
    severity: str = "info"
    raw_data: dict = {}


@router.post("/events")
async def ingest_event(
    payload: EventCreate,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
):
    """
    Main ingestion endpoint — devices push events here.
    The AI engine immediately correlates and may create a ticket.
    """
    device = db.query(Device).filter(
        Device.id == payload.device_id, Device.tenant_id == tenant.id
    ).first()
    if not device:
        raise HTTPException(404, "Device not found")

    # Create event
    event = Event(
        tenant_id=tenant.id,
        device_id=device.id,
        event_type=payload.event_type,
        severity=EventSeverity(payload.severity),
        message=payload.message,
        raw_data=payload.raw_data,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # ─── AI CORRELATION ───────────────────────────────────────────────
    result = correlate_event(db, event, device)
    db.commit()  # save ai_analysis + correlated flag

    # Broadcast event via WebSocket
    await notifications.broadcast_ws({
        "type": "event",
        "payload": {
            "id": event.id,
            "device": device.name,
            "event_type": event.event_type,
            "severity": event.severity.value,
            "message": event.message,
            "ai_analysis": event.ai_analysis,
            "timestamp": event.created_at.isoformat(),
        }
    })

    # If AI says create ticket → create it
    ticket_data = None
    if result["action"] == "create_ticket":
        ticket = Ticket(
            tenant_id=tenant.id,
            site_id=device.site_id,
            title=f"[{result['severity'].value.upper()}] {event.event_type.replace('_', ' ').title()} — {device.name}",
            description=event.message + "\n\nAI Analysis:\n" + result["ai_analysis"],
            event_type=event.event_type,
            severity=result["severity"],
            checklist=[
                {"label": item, "checked": False, "notes": ""}
                for item in result["checklist"]
            ],
            escalation_target=result.get("escalation_target"),
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        event.ticket_id = ticket.id
        db.commit()

        ticket_data = {
            "id": ticket.id,
            "title": ticket.title,
            "severity": ticket.severity.value,
            "status": ticket.status.value,
        }

        # Broadcast new ticket
        await notifications.broadcast_ws({
            "type": "ticket",
            "payload": ticket_data,
        })

        # Send push notification to officers
        await notifications.send_notification(
            title=f"🚨 New Alert: {ticket.title}",
            body=event.message,
            data={"ticket_id": ticket.id, "event_type": event.event_type},
            severity=result["severity"].value,
        )

    return {
        "event_id": event.id,
        "ai_confirmed": result["confirmed"],
        "severity": result["severity"].value,
        "ai_analysis": result["ai_analysis"],
        "action": result["action"],
        "ticket": ticket_data,
    }


@router.get("/events")
def list_events(
    limit: int = 50,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .filter(Event.tenant_id == tenant.id)
        .order_by(desc(Event.created_at))
        .limit(limit)
        .all()
    )
    result = []
    for e in events:
        device = db.query(Device).filter(Device.id == e.device_id).first()
        result.append({
            "id": e.id,
            "device": device.name if device else "Unknown",
            "device_type": device.device_type if device else "",
            "event_type": e.event_type,
            "severity": e.severity.value,
            "message": e.message,
            "ai_analysis": e.ai_analysis,
            "correlated": e.correlated,
            "ticket_id": e.ticket_id,
            "timestamp": e.created_at.isoformat(),
        })
    return result


# ─── Tickets ──────────────────────────────────────────────────────────
@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket).filter(Ticket.tenant_id == tenant.id)
    if status:
        q = q.filter(Ticket.status == TicketStatus(status))
    tickets = q.order_by(desc(Ticket.created_at)).all()
    result = []
    for t in tickets:
        result.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "event_type": t.event_type,
            "severity": t.severity.value,
            "status": t.status.value,
            "checklist": t.checklist,
            "checklist_completed": t.checklist_completed,
            "escalation_target": t.escalation_target,
            "escalation_triggered": t.escalation_triggered,
            "resolution_notes": t.resolution_notes,
            "assigned_to": t.assigned_to,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        })
    return result


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, tenant: Tenant = Depends(get_tenant), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id, Ticket.tenant_id == tenant.id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "event_type": t.event_type,
        "severity": t.severity.value,
        "status": t.status.value,
        "checklist": t.checklist,
        "checklist_completed": t.checklist_completed,
        "escalation_target": t.escalation_target,
        "escalation_triggered": t.escalation_triggered,
        "resolution_notes": t.resolution_notes,
        "assigned_to": t.assigned_to,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


class ChecklistUpdate(BaseModel):
    checklist: list[dict]
    resolution_notes: Optional[str] = None
    suspicious: bool = False


@router.patch("/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    payload: ChecklistUpdate,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
):
    """Officer submits checklist. If suspicious → escalate."""
    t = db.query(Ticket).filter(Ticket.id == ticket_id, Ticket.tenant_id == tenant.id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")

    t.checklist = payload.checklist
    all_checked = all(item.get("checked") for item in payload.checklist)
    t.checklist_completed = all_checked
    t.resolution_notes = payload.resolution_notes

    if payload.suspicious:
        # ESCALATE
        t.status = TicketStatus.escalated
        t.escalation_triggered = True
        target = t.escalation_target or "emergency"
        await notifications.send_notification(
            title=f"🔴 ESCALATION: {t.title}",
            body=f"Officer marked SUSPICIOUS. Notifying {target.upper()}",
            data={"ticket_id": t.id, "escalation": target},
            severity="critical",
        )
    elif all_checked:
        t.status = TicketStatus.resolved
    else:
        t.status = TicketStatus.investigating

    db.commit()

    # Broadcast update
    await notifications.broadcast_ws({
        "type": "ticket_update",
        "payload": {
            "id": t.id,
            "status": t.status.value,
            "checklist_completed": t.checklist_completed,
            "escalation_triggered": t.escalation_triggered,
        }
    })

    return {
        "id": t.id,
        "status": t.status.value,
        "escalation_triggered": t.escalation_triggered,
        "message": "Escalated to emergency services" if payload.suspicious else "Checklist submitted",
    }


# ─── Notifications ────────────────────────────────────────────────────
@router.get("/notifications")
def get_notifs():
    return notifications.get_notifications(50)
