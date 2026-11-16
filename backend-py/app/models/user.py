from beanie import Document
from pydantic import EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class Role(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"

class User(Document):
    name: str
    email: EmailStr
    password_hash: str = Field(..., exclude=True)
    role: Role = Role.VIEWER
    active: bool = True
    last_login_at: Optional[datetime] = None

    class Settings:
        name = "users"

    def verify_password(self, plain_password: str) -> bool:
        return pwd_context.verify(plain_password, self.password_hash)

    @staticmethod
    def hash_password(plain_password: str) -> str:
        return pwd_context.hash(plain_password)
