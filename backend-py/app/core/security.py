from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel

SECRET_KEY = "super-secret-key-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
