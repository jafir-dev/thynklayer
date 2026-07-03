"""
Device Simulator — generates realistic security events for demo.

Simulates:
- Camera with AI vision (fire/smoke/human detection)
- Temperature sensor
- Smoke detector
- Door access controller

Run scenarios: fire, intrusion, normal
"""
import httpx
import asyncio
import random
import json
import argparse
import sys
from datetime import datetime

API_BASE = "http://localhost:3100/api/v1"


async def create_tenant():
    """Create demo tenant and return token."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{API_BASE}/tenants", json={
            "name": "THYNKLAYER Demo Corp",
            "contact_email": "demo@thynklayer.ai",
            "plan": "enterprise",
        })
        data = r.json()
        return data["api_token"], data["tenant_id"]


async def setup_devices(token: str, tenant_id: str):
    """Create a site + devices for the demo."""
    async with httpx.AsyncClient() as c:
        # Create site
        r = await c.post(
            f"{API_BASE}/sites?token={token}",
            json={"name": "Marina Gate Tower", "address": "Dubai Marina, UAE"},
        )
        site_id = r.json()["id"]

        # Create devices at this site
        devices = [
            {
                "name": "Lobby Camera — Main Entrance",
                "device_type": "camera",
                "protocol": "onvif",
                "endpoint": "rtsp://192.168.1.101:554/stream1",
                "site_id": site_id,
                "location_desc": "Building A, Ground Floor, Main Lobby",
                "capabilities": ["fire_detection", "smoke_detection", "human_detection", "motion_detection"],
                "config": {"resolution": "4K", "fps": 30},
            },
            {
                "name": "Server Room Camera",
                "device_type": "camera",
                "protocol": "onvif",
                "endpoint": "rtsp://192.168.1.102:554/stream1",
                "site_id": site_id,
                "location_desc": "Building A, Floor 2, Server Room",
                "capabilities": ["fire_detection", "smoke_detection", "human_detection"],
            },
            {
                "name": "Server Room Temperature Sensor",
                "device_type": "sensor",
                "protocol": "mqtt",
                "endpoint": "mqtt://192.168.1.201:1883/sensor/temp-01",
                "site_id": site_id,
                "location_desc": "Building A, Floor 2, Server Room",
                "capabilities": ["temperature"],
                "config": {"threshold": 60, "unit": "celsius"},
            },
            {
                "name": "Server Room Smoke Detector",
                "device_type": "sensor",
                "protocol": "mqtt",
                "endpoint": "mqtt://192.168.1.202:1883/sensor/smoke-01",
                "site_id": site_id,
                "location_desc": "Building A, Floor 2, Server Room",
                "capabilities": ["smoke"],
            },
            {
                "name": "Server Room Door — Access Control",
                "device_type": "door",
                "protocol": "generic",
                "endpoint": "http://192.168.1.151:8080/api/access",
                "site_id": site_id,
                "location_desc": "Building A, Floor 2, Server Room Entrance",
                "capabilities": ["access_control", "badge_reader"],
            },
        ]

        created = {}
        for d in devices:
            r = await c.post(f"{API_BASE}/devices?token={token}", json=d)
            data = r.json()
            created[d["name"]] = data["id"]
            print(f"  ✓ {d['name']} → {data['id'][:8]}")

        return created


async def send_event(token: str, device_id: str, event_type: str, message: str, severity: str = "info", raw_data: dict = None):
    """Send an event to the platform."""
    async with httpx.AsyncClient() as c:
        payload = {
            "device_id": device_id,
            "event_type": event_type,
            "message": message,
            "severity": severity,
            "raw_data": raw_data or {},
        }
        r = await c.post(f"{API_BASE}/events?token={token}", json=payload)
        data = r.json()
        return data


async def scenario_fire(token: str, devices: dict):
    """Fire scenario — camera + temperature sensor + smoke detector."""
    print("\n🔥 SCENARIO: FIRE DETECTION")
    print("=" * 50)

    # Step 1: Camera detects fire/smoke via AI vision
    print("\n[Step 1] Camera AI detects fire in server room...")
    result = await send_event(
        token, devices["Server Room Camera"],
        "fire_detected",
        "AI Vision: Flame detected in server room. Confidence: 94%. "
        "Visible smoke rising from rack 3.",
        "critical",
        {"confidence": 0.94, "bbox": [120, 80, 340, 280]},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")
    print(f"  → Confirmed: {result['ai_confirmed']} | Action: {result['action']}")
    if result.get("ticket"):
        print(f"  → Ticket created: {result['ticket']['title'][:60]}")

    await asyncio.sleep(3)

    # Step 2: AI triggers temperature sensor check — temp is rising
    print("\n[Step 2] Temperature sensor reports rising temp...")
    result = await send_event(
        token, devices["Server Room Temperature Sensor"],
        "temperature_reading",
        "Temperature: 78°C and rising. Threshold exceeded (60°C).",
        "critical",
        {"temperature": 78, "trend": "rising", "threshold": 60},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")

    await asyncio.sleep(2)

    # Step 3: Smoke detector triggers
    print("\n[Step 3] Smoke detector triggered...")
    result = await send_event(
        token, devices["Server Room Smoke Detector"],
        "smoke_detected",
        "Smoke detector alarm: Particulate density above threshold.",
        "critical",
        {"smoke_density": 0.82, "threshold": 0.3},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")
    print("\n✅ Fire scenario complete — check dashboard for tickets & notifications!")


async def scenario_intrusion(token: str, devices: dict):
    """Intrusion scenario — human detected + unauthorized door access."""
    print("\n🚨 SCENARIO: UNAUTHORIZED INTRUSION")
    print("=" * 50)

    # Step 1: Camera detects human after hours
    print("\n[Step 1] Camera AI detects human at server room door...")
    result = await send_event(
        token, devices["Server Room Camera"],
        "human_detected",
        "AI Vision: Human figure detected near server room entrance. "
        "Individual wearing dark clothing, no visible badge.",
        "warning",
        {"confidence": 0.91, "person_count": 1},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")
    print(f"  → Confirmed: {result['ai_confirmed']}")

    await asyncio.sleep(3)

    # Step 2: Door access denied
    print("\n[Step 2] Door access attempt — DENIED...")
    result = await send_event(
        token, devices["Server Room Door — Access Control"],
        "unauthorized_access",
        "Access attempt with expired credential (BADGE-8842). "
        "Door remains locked. 3 failed attempts.",
        "critical",
        {"badge_id": "BADGE-8842", "attempts": 3, "result": "denied"},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")
    if result.get("ticket"):
        print(f"  → Ticket created: {result['ticket']['title'][:60]}")

    print("\n✅ Intrusion scenario complete — check dashboard for tickets!")


async def scenario_normal(token: str, devices: dict):
    """Normal activity — AI determines no threat."""
    print("\n✅ SCENARIO: NORMAL ACTIVITY (No threat)")
    print("=" * 50)

    print("\n[Step 1] Camera detects human during business hours...")
    result = await send_event(
        token, devices["Lobby Camera — Main Entrance"],
        "human_detected",
        "AI Vision: Person entering through main lobby. "
        "Walking normally, carrying briefcase.",
        "info",
        {"confidence": 0.97, "person_count": 1},
    )
    print(f"  → AI: {result['ai_analysis'][:100]}...")
    print(f"  → Confirmed: {result['ai_confirmed']} (should be False — normal activity)")
    print(f"  → Action: {result['action']} (should be 'ignore')")


async def main():
    parser = argparse.ArgumentParser(description="THYNKLAYER Device Simulator")
    parser.add_argument("--scenario", choices=["fire", "intrusion", "normal", "all"], default="all")
    parser.add_argument("--token", default=None, help="Existing tenant token")
    args = parser.parse_args()

    # Create or reuse tenant
    if args.token:
        token = args.token
        print(f"Using existing token: {token[:20]}...")
    else:
        print("Creating demo tenant...")
        token, tenant_id = await create_tenant()
        print(f"  ✓ Tenant created. Token: {token}")

    print(f"\n  ⚠️  SAVE THIS TOKEN: {token}")
    print(f"  Use it in the dashboard or API as ?token={token}")

    # Setup devices
    print("\nSetting up demo devices...")
    devices = await setup_devices(token, "")

    # Run scenario(s)
    if args.scenario in ("fire", "all"):
        await scenario_fire(token, devices)
        await asyncio.sleep(2)

    if args.scenario in ("intrusion", "all"):
        await scenario_intrusion(token, devices)
        await asyncio.sleep(2)

    if args.scenario in ("normal", "all"):
        await scenario_normal(token, devices)

    print("\n" + "=" * 50)
    print("🎮 Simulator finished! Open the dashboard to see results.")
    print(f"   Dashboard: http://localhost:3101")
    print(f"   API token: {token}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
