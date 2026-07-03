"""THYNKLAYER — Sovereign AI Platform for Physical Security | Main App"""
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base
from routes import router
import notifications

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("thynklayer")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("THYNKLAYER backend started. Database initialized.")
    yield
    logger.info("THYNKLAYER backend shutting down.")


app = FastAPI(
    title="THYNKLAYER API",
    description="Sovereign AI Platform for Physical Security — AI Intelligence Layer",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "platform": "THYNKLAYER",
        "tagline": "Sovereign AI Platform for Physical Security",
        "version": "1.0.0",
        "docs": "/docs",
        "api": "/api/v1",
    }


@app.get("/health")
def health():
    return {"status": "healthy", "service": "thynklayer-backend"}


# ─── WebSocket endpoint ───────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await notifications.register_ws_client(websocket)
    logger.info(f"WebSocket client connected. Total: {len(notifications._ws_clients)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notifications.unregister_ws_client(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(notifications._ws_clients)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3100, reload=False)
