from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.user import User
from app.models.device import Device
from app.models.credential import Credential

async def init_db():
    # In production, use environment variables
    client = AsyncIOMotorClient("mongodb://localhost:27017/network_automation")
    await init_beanie(database=client.network_automation, document_models=[User, Device, Credential])
