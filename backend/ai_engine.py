"""
THYNKLAYER AI Correlation Engine — The "Brain"

When an event comes in (e.g. camera detects fire), the AI engine:
1. Looks at OTHER devices at the same site
2. Checks their recent readings for corroborating signals
3. Decides whether this is a real threat or false alarm
4. Generates a recommended action (create ticket, escalate, etc.)

This is rule-based for the prototype. In production, this would use
LLM reasoning + ML models trained on security operational data.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from models import Device, Event, Ticket, EventSeverity, TicketStatus
import logging

logger = logging.getLogger("thynklayer.ai")


# ─── Correlation Rules ──────────────────────────────────────────────
# Each rule: trigger event type → devices to check → decision logic

CORRELATION_RULES = {
    "fire_detected": {
        "name": "Fire / Smoke Detection",
        "check_devices": ["sensor"],  # check temperature & smoke sensors
        "check_types": ["temperature_reading", "smoke_detected"],
        "logic": "If ANY nearby sensor shows rising temperature OR smoke → CONFIRMED. "
                 "If temperature > 60°C or smoke = true → CRITICAL.",
        "checklist": [
            "Visually confirm fire or smoke at the reported location",
            "Check if any personnel are in the immediate area",
            "Verify fire suppression system is active (if applicable)",
            "Ensure emergency exits are accessible and unblocked",
            "If fire confirmed: activate building evacuation",
        ],
        "escalation": "fire_dept",
    },
    "smoke_detected": {
        "name": "Smoke Sensor Triggered",
        "check_devices": ["camera"],
        "check_types": ["fire_detected"],
        "logic": "Cross-check cameras for visible smoke/flames. "
                 "If camera also flags → CONFIRMED. Otherwise → WARNING (investigate).",
        "checklist": [
            "Check camera feed at the reported location for visible smoke",
            "Inspect the area for source of smoke",
            "Check HVAC system for possible cause",
            "Verify no personnel are at risk",
        ],
        "escalation": "fire_dept",
    },
    "human_detected": {
        "name": "Human Detected",
        "check_devices": ["door"],
        "check_types": ["access_granted", "access_denied"],
        "logic": "Check door access log. If access DENIED or person is at a door "
                 "they have no access to, especially after hours → CONFIRMED INTRUSION. "
                 "If access GRANTED → NORMAL ENTRY (no action).",
        "checklist": [
            "Verify identity of person at the access point",
            "Check if entry was authorized via access control system",
            "Review camera footage for suspicious behavior",
            "If unauthorized: question individual and/or call security backup",
        ],
        "escalation": "police",
    },
    "unauthorized_access": {
        "name": "Unauthorized Access Attempt",
        "check_devices": ["camera"],
        "check_types": ["human_detected"],
        "logic": "Pull camera feed at door location. If person detected + "
                 "access denied + after hours → CRITICAL INTRUSION.",
        "checklist": [
            "Review camera footage of the access attempt",
            "Verify badge/credential used (if any)",
            "Check if this is a known employee with expired credentials",
            "If suspicious: dispatch security officer immediately",
        ],
        "escalation": "police",
    },
    "motion_detected": {
        "name": "Motion Detected (After Hours)",
        "check_devices": ["camera", "door"],
        "check_types": ["human_detected", "unauthorized_access"],
        "logic": "Check if motion is during off-hours. Cross-reference cameras for "
                 "human presence and doors for access events. If human + after hours "
                 "→ WARNING. If human + access denied → CRITICAL.",
        "checklist": [
            "Review camera feed for cause of motion",
            "Check if motion was triggered by an animal or environmental factor",
            "Verify no unauthorized personnel in the area",
        ],
        "escalation": "police",
    },
    "temperature_reading": {
        "name": "Temperature Sensor Reading",
        "check_devices": ["camera"],
        "check_types": ["fire_detected", "smoke_detected"],
        "logic": "If temperature > threshold + camera shows fire/smoke → CRITICAL. "
                 "If temp high but no visual fire → WARNING (investigate).",
        "checklist": [
            "Check camera feed at sensor location for visible heat/fire",
            "Inspect sensor for malfunction",
            "Verify HVAC system status",
            "If temperature continues rising: evacuate area",
        ],
        "escalation": "fire_dept",
    },
    "crowd_anomaly": {
        "name": "Crowd Density Anomaly",
        "check_devices": ["door"],
        "check_types": ["access_granted", "access_denied"],
        "logic": "If crowd density exceeds threshold + multiple access events → WARNING. "
                 "Possible unauthorized gathering or tailgating.",
        "checklist": [
            "Review camera feed for crowd assessment",
            "Count individuals vs access events (tailgating check)",
            "Verify all individuals have valid credentials",
        ],
        "escalation": "police",
    },
}


def is_after_hours(config: dict = None) -> bool:
    """Check if current time is outside business hours."""
    now = datetime.now()
    hour = now.hour
    # Default: after hours if before 7am or after 7pm
    after_start = config.get("after_hours_start", 19) if config else 19
    after_end = config.get("after_hours_end", 7) if config else 7
    return hour >= after_start or hour < after_end


def get_recent_events_for_device(
    db: Session, device_id: str, minutes: int = 10
) -> list[Event]:
    """Get events from a device in the last N minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return (
        db.query(Event)
        .filter(Event.device_id == device_id, Event.created_at >= cutoff)
        .order_by(Event.created_at.desc())
        .all()
    )


def correlate_event(db: Session, event: Event, device: Device) -> dict:
    """
    The core AI correlation function.

    Takes an incoming event, checks OTHER devices at the same site,
    and produces a decision: is this confirmed, what severity, what action.

    Returns:
        {
            "confirmed": bool,
            "severity": EventSeverity,
            "ai_analysis": str,
            "action": "create_ticket" | "ignore" | "log_only",
            "checklist": [...],
            "escalation_target": str | None,
        }
    """
    rule = CORRELATION_RULES.get(event.event_type)

    if not rule:
        # Unknown event type — log only
        return {
            "confirmed": False,
            "severity": EventSeverity.info,
            "ai_analysis": f"No correlation rule defined for '{event.event_type}'. Logged for monitoring.",
            "action": "log_only",
            "checklist": [],
            "escalation_target": None,
        }

    # ─── Step 1: Find related devices at the same site ───────────────
    related_devices = []
    if device.site_id:
        related_devices = (
            db.query(Device)
            .filter(
                Device.site_id == device.site_id,
                Device.id != device.id,
                Device.status == "online",
            )
            .all()
        )

    # ─── Step 2: Gather corroborating evidence ───────────────────────
    evidence = []
    for rd in related_devices:
        if rd.device_type in rule["check_devices"]:
            recent = get_recent_events_for_device(db, rd.id, minutes=10)
            for e in recent:
                if e.event_type in rule["check_types"]:
                    evidence.append({
                        "device": rd.name,
                        "device_type": rd.device_type,
                        "event_type": e.event_type,
                        "message": e.message,
                        "raw_data": e.raw_data or {},
                        "time": e.created_at.isoformat(),
                    })

    # ─── Step 3: AI Decision Logic ───────────────────────────────────
    confirmed = False
    severity = EventSeverity.warning
    analysis_parts = [f"[AI] Trigger: {rule['name']} from {device.name}"]

    # Type-specific reasoning
    if event.event_type == "fire_detected":
        temp_evidence = [e for e in evidence if "temp" in e["event_type"]]
        smoke_evidence = [e for e in evidence if "smoke" in e["event_type"]]

        if temp_evidence:
            temps = []
            for e in temp_evidence:
                t = e["raw_data"].get("temperature")
                if t:
                    temps.append(t)
            if temps and max(temps) > 60:
                confirmed = True
                severity = EventSeverity.critical
                analysis_parts.append(
                    f"[AI] Temperature sensor confirms: {max(temps)}°C detected. "
                    f"This exceeds the 60°C threshold — fire CONFIRMED."
                )
            elif temps:
                confirmed = True
                severity = EventSeverity.warning
                analysis_parts.append(
                    f"[AI] Temperature sensor reading: {max(temps)}°C. "
                    f"Elevated but below critical threshold. Investigating."
                )

        if smoke_evidence:
            confirmed = True
            severity = EventSeverity.critical
            analysis_parts.append(
                "[AI] Smoke sensor ALSO triggered. Dual confirmation — fire CONFIRMED."
            )

        if not confirmed:
            confirmed = True  # Fire detected by AI camera is always at least warning
            severity = EventSeverity.warning
            analysis_parts.append(
                "[AI] No corroborating sensor data yet, but AI vision detected fire/smoke. "
                "Creating investigation ticket. Will auto-escalate if sensors confirm."
            )

    elif event.event_type in ("human_detected", "unauthorized_access"):
        access_denied = any(
            "denied" in e["event_type"] or "denied" in e["message"].lower()
            for e in evidence
        )
        after_hours = is_after_hours()

        if access_denied and after_hours:
            confirmed = True
            severity = EventSeverity.critical
            analysis_parts.append(
                "[AI] CRITICAL: Human detected + access DENIED + after hours. "
                "This is a confirmed intrusion attempt."
            )
        elif access_denied:
            confirmed = True
            severity = EventSeverity.warning
            analysis_parts.append(
                "[AI] Human detected + access DENIED during business hours. "
                "Possible unauthorized access attempt — investigating."
            )
        elif after_hours:
            confirmed = True
            severity = EventSeverity.warning
            analysis_parts.append(
                "[AI] Human detected after hours. No access event recorded. "
                "Investigating — possible unauthorized presence."
            )
        else:
            confirmed = False
            severity = EventSeverity.info
            analysis_parts.append(
                "[AI] Human detected during business hours with no access denial. "
                "This appears to be normal activity. Logging only."
            )

    elif event.event_type == "temperature_reading":
        temp = event.raw_data.get("temperature", 0)
        threshold = device.config.get("threshold", 60) if device.config else 60
        if evidence:
            confirmed = True
            severity = EventSeverity.critical
            analysis_parts.append(
                f"[AI] Temperature: {temp}°C (threshold: {threshold}°C). "
                f"Camera ALSO detected fire/smoke. CRITICAL — fire risk confirmed."
            )
        elif temp > threshold:
            confirmed = True
            severity = EventSeverity.warning
            analysis_parts.append(
                f"[AI] Temperature: {temp}°C exceeds threshold ({threshold}°C). "
                f"No visual fire confirmation yet. Investigating — possible HVAC or equipment issue."
            )
        else:
            confirmed = False
            severity = EventSeverity.info
            analysis_parts.append(
                f"[AI] Temperature: {temp}°C within normal range. Logged for monitoring."
            )

    else:
        # Generic rule confirmation
        if evidence:
            confirmed = True
            severity = EventSeverity.warning
            analysis_parts.append(
                f"[AI] Corroborating evidence found from {len(evidence)} device(s). "
                f"Event confirmed."
            )
        else:
            confirmed = True
            severity = EventSeverity.warning
            analysis_parts.append(
                "[AI] No corroborating evidence yet. Creating investigation ticket."
            )

    # Mark event as correlated
    event.correlated = True
    ai_text = " ".join(analysis_parts)
    event.ai_analysis = ai_text

    # Determine action
    action = "ignore" if not confirmed else "create_ticket"

    return {
        "confirmed": confirmed,
        "severity": severity,
        "ai_analysis": ai_text,
        "action": action,
        "checklist": rule.get("checklist", []),
        "escalation_target": rule.get("escalation") if confirmed else None,
        "evidence": evidence,
    }
