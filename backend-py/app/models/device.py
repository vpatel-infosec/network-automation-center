from beanie import Document, Link
from pydantic import Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from app.models.user import User # Assuming Credential model is next

class Vendor(str, Enum):
    CISCO = 'cisco'
    ARUBA = 'aruba'
    JUNIPER = 'juniper'
    UBIQUITI = 'ubiquiti'
    GENERIC = 'generic'

class DeviceType(str, Enum):
    SWITCH = 'switch'
    ROUTER = 'router'
    ACCESS_POINT = 'access_point'
    WLC = 'wlc'
    FIREWALL = 'firewall'
    OTHER = 'other'

class Protocol(str, Enum):
    SSH = 'ssh'
    RESTCONF = 'restconf'

class Driver(str, Enum):
    AUTO = 'auto'
    CISCO_IOS = 'cisco_ios'
    CISCO_NXOS = 'cisco_nxos'
    CISCO_WLC = 'cisco_wlc'
    CISCO_RESTCONF = 'cisco_restconf'
    ARUBA_OS = 'aruba_os'
    JUNIPER = 'juniper'
    UBIQUITI = 'ubiquiti'
    GENERIC_SSH = 'generic_ssh'

class BackupStatus(str, Enum):
    NEVER = 'never'
    SUCCESS = 'success'
    UNCHANGED = 'unchanged'
    FAILED = 'failed'

class DeviceStatus(BackupStatus):
    reachable: bool = False
    last_checked_at: Optional[datetime] = None
    last_check_message: str = ""
    latency_ms: Optional[int] = None
    last_backup_at: Optional[datetime] = None
    last_backup_status: BackupStatus = BackupStatus.NEVER
    last_backup_message: str = ""

class Device(Document):
    name: str = Field(..., unique=True, index=True)
    host: str
    port: int = 22
    vendor: Vendor = Vendor.GENERIC
    device_type: DeviceType = DeviceType.SWITCH
    platform: str = ""
    model: str = ""
    os_version: str = ""
    protocol: Protocol = Protocol.SSH
    driver: Driver = Driver.AUTO
    # Placeholder for Link to Credential document
    credential_id: Any 
    site: str = ""
    location: str = ""
    tags: List[str] = []
    notes: str = ""
    command_overrides: Dict[str, Any] = {}
    status: DeviceStatus = DeviceStatus()

    class Settings:
        name = "devices"
