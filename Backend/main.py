from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

from Backend.db import get_connection, init_database
from Backend.auth import hash_password, verify_password, create_token

app = FastAPI()

init_database()

class RegisterRequest(BaseModel):
    username: str
    password: str


@app.get("/")
def root():
    return {"message": "Backend läuft!"}


@app.post("/auth/register")
def register(user: RegisterRequest):
    connection = get_connection()
    password_hash = hash_password(user.password)

    try:
        connection.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (user.username, password_hash)
        )
        connection.commit()

    except Exception:
        connection.close()
        raise HTTPException(
            status_code=400,
            detail="Username ist bereits vergeben."
        )

    connection.close()

    return {"message": "Account erfolgreich erstellt."}

@app.post("/auth/login")
def login(user: RegisterRequest):
    connection = get_connection()

    result = connection.execute(
        "SELECT * FROM users WHERE username = ?",
        (user.username,)
    ).fetchone()

    connection.close()

    if result is None:
        raise HTTPException(
            status_code=401,
            detail="Username oder Passwort ist falsch."
        )

    if not verify_password(user.password, result["password_hash"]):
        raise HTTPException(
            status_code=401,
            detail="Username oder Passwort ist falsch."
        )

    token = create_token()

    connection = get_connection()

    connection.execute(
        "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
        (token, result["id"])
    )

    connection.commit()
    connection.close()

    return {
        "message": "Login erfolgreich!",
        "token": token
    }

@app.get("/users/me")
def get_current_user(token: str = Header(...)):
    connection = get_connection()

    result = connection.execute(
        """
        SELECT users.id, users.username
        FROM users
        JOIN sessions ON users.id = sessions.user_id
        WHERE sessions.token = ?
        """,
        (token,)
    ).fetchone()

    connection.close()

    if result is None:
        raise HTTPException(
            status_code=401,
            detail="Ungültiger Token."
        )

    return {
        "id": result["id"],
        "username": result["username"]
    }

@app.post("/auth/logout")
def logout(token: str = Header(...)):
    connection = get_connection()

    connection.execute(
        "DELETE FROM sessions WHERE token = ?",
        (token,)
    )

    connection.commit()
    connection.close()

    return {
        "message": "Logout erfolgreich!"
    }