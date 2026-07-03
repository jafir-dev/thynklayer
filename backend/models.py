"""Database models for THYNKLAYER platform."""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Float, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum
from database import Base


def gen_id():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String(200), nullable=False)
    plan = Column(String(50), default="trial")  # trial, starter, pro, enterprise
    contact_email = Column(String(200))
    api_token = Column(String(100), unique=True, default=gen_id)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    sites = relationship("Site", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="tenant", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="tenant", cascade="all, delete-orphan")


class Site(Base):
    __tablename__ = "sites"
    id = Column(String, primary_key=True, default=gen_id)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(200), nullable=False)
    address = Column(Text)
    lat = Column(Float)
    lng = Column(Float)
    created_at = Column(DateTime, default=utcnow)

    tenant = relationship("Tenant", back_populates="sites")
    devices = relationship("Device", back_populates="site")
    tickets = relationship("Ticket", back_populates="site")


class UserRole(enum.Enum):
    admin = "admin"
    operator = "operator"
    officer = "officer"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.operator)
    password_hash = Column(String(200), default="")  # prototype: plain
    fcm_token = Column(Text, nullable=True)  # Firebase FCM push token
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    tenant = relationship("Tenant", back_populates="users")


class Device(Base):
    __tablename__ = "devices"
    id = Column(String, primary_key=True, default=gen_id)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    site_id = Column(String, ForeignKey("sites.id"), nullable=True)
    name = Column(String(200), nullable=False)
    device_type = Column(String(50), nullable=False)  # camera, sensor, door, etc.
    protocol = Column(String(50), default="generic")  # generic, onvif, mqtt, rtsp
    endpoint = Column(String(500), nullable=True)  # RTSP URL, API endpoint, etc.
    location_desc = Column(String(300), nullable=True)  # "Building A, Floor 3, Room 301"
    capabilities = Column(JSON, default=list)  # ["motion_detection","temperature","smoke"]
    status = Column(String(30), default="online")  # online, offline, error
    last_seen = Column(DateTime, default=utcnow)
    config = Column(JSON, default=dict)  # threshold, rules, etc.
    created_at = Column(DateTime, default=utcnow)

    tenant = relationship("Tenant", back_populates="devices")
    site = relationship("Site", back_populates="devices")
    events = relationship("Event", back_populates="device")


class EventSeverity(enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Event(Base):
    __tablename__ = "events"
    id = Column(String, primary_key=True, default=gen_id)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    event_type = Column(String(80), nullable=False)  # fire_detected, temp_rising, unauthorized_access
    severity = Column(SAEnum(EventSeverity), default=EventSeverity.info)
    message = Column(Text, nullable=False)
    raw_data = Column(JSON, default=dict)
    ai_analysis = Column(Text, nullable=True)  # AI's interpretation
    correlated = Column(Boolean, default=False)
    ticket_id = Column(String, ForeignKey("tickets.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    device = relationship("Device", back_populates="events")


class TicketStatus(enum.Enum):
    open = "open"
    investigating = "investigating"
    escalated = "escalated"
    resolved = "resolved"
    false_alarm = "false_alarm"


class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(String, primary_key=True, default=gen_id)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    site_id = Column(String, ForeignKey("sites.id"), nullable=True)
    assigned_to = Column(String, ForeignKey("users.id"), nullable=True)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    event_type = Column(String(80))  # fire, intrusion, unauthorized_access
    severity = Column(SAEnum(EventSeverity), default=EventSeverity.warning)
    status = Column(SAEnum(TicketStatus), default=TicketStatus.open)
    checklist = Column(JSON, default=list)  # [{label, checked, notes}]
    checklist_completed = Column(Boolean, default=False)
    escalation_target = Column(String(100), nullable=True)  # fire_dept, hospital, police
    escalation_triggered = Column(Boolean, default=False)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    tenant = relationship("Tenant", back_populates="tickets")
    site = relationship("Site", back_populates="tickets")
    events = relationship("Event", backref="ticket")
