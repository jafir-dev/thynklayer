"""
Notification Service — Firebase FCM (configurable later) + WebSocket push.

For prototype: stores notifications in a list and pushes via WebSocket.
For production: will use Firebase Cloud Messaging for mobile push.
"""
import asyncio
import logging
from datetime import datetime, timezone
from collections import defaultdict

logger = logging.getLogger("thynklayer.notifications")

# In-memory notification store for prototype
_notifications: list[dict] = []
_ws_clients: set = set()


async def register_ws_client(websocket):
    _ws_clients.add(websocket)


async def unregister_ws_client(websocket):
    _ws_clients.discard(websocket)


async def broadcast_ws(message: dict):
    """Broadcast a message to all connected WebSocket clients."""
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.discard(ws)


async def send_notification(
    title: str,
    body: str,
    data: dict = None,
    severity: str = "info",
    fcm_token: str = None,
):
    """
    Send a notification.

    Prototype: WebSocket push + in-memory store.
    Production: Firebase FCM HTTP v1 API.
    """
    notification = {
        "id": f"notif_{len(_notifications) + 1}",
        "title": title,
        "body": body,
        "data": data or {},
        "severity": severity,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _notifications.append(notification)
    if len(_notifications) > 100:
        del _notifications[:-100]

    # WebSocket push
    await broadcast_ws({"type": "notification", "payload": notification})

    # FCM push (production)
    if fcm_token:
        logger.info(f"[FCM] Would push to {fcm_token[:20]}...: {title}")
        # TODO: Uncomment when Firebase is configured
        # await _send_fcm(fcm_token, title, body, data)

    logger.info(f"Notification sent: {title}")
    return notification


async def _send_fcm(token: str, title: str, body: str, data: dict):
    """Firebase Cloud Messaging — HTTP v1 API. Activate when configured."""
    # import httpx
    # from google.oauth2 import service_account
    # ... FCM implementation here
    pass


def get_notifications(limit: int = 50) -> list[dict]:
    return list(reversed(_notifications[-limit:]))
