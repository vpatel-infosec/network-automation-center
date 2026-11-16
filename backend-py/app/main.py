from fastapi import FastAPI
from app.core.database import init_db
from app.api import auth, devices

app = FastAPI(title="Network Automation Center API")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "nac-backend-py"}


