from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.models.user import User
from app.core.security import create_access_token, verify_password

router = APIRouter()

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await User.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}
