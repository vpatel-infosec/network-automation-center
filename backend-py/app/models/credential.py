from beanie import Document
from pydantic import Field
from typing import Optional

class Credential(Document):
    name: str = Field(..., index=True)
    username: str
    password: str  # Note: In production, this must be encrypted/masked
    enable_password: Optional[str] = None
    
    class Settings:
        name = "credentials"
