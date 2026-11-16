from fastapi import APIRouter, HTTPException
from app.models.device import Device
from typing import List

router = APIRouter()

@router.get("/", response_model=List[Device])
async def get_devices():
    return await Device.find_all().to_list()

@router.post("/", response_model=Device)
async def create_device(device: Device):
    await device.insert()
    return device

@router.get("/{device_id}", response_model=Device)
async def get_device(device_id: str):
    device = await Device.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.delete("/{device_id}")
async def delete_device(device_id: str):
    device = await Device.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await device.delete()
    return {"message": "Device deleted"}
