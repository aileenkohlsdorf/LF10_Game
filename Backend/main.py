from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from Backend.db import get_connection, init_database
from Backend.auth import hash_password, verify_password, create_token

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class SaveGameRequest(BaseModel):
    coins: int
    bullets: int


@app.post("/game/save")
def save_game(save: SaveGameRequest, token: str = Header(...)):
    connection = get_connection()

    result = connection.execute(
        """
        SELECT user_id
        FROM sessions
        WHERE token = ?
        """,
        (token,)
    ).fetchone()

    if result is None:
        connection.close()
        raise HTTPException(
            status_code=401,
            detail="Ungültiger Token."
        )

    user_id = result["user_id"]

    coins = max(0, min(save.coins, 500))
    bullets = max(0, min(save.bullets, 50))

    connection.execute(
        """
        INSERT INTO saves (user_id, coins, bullets)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
            coins = excluded.coins,
            bullets = excluded.bullets
        """,
        (user_id, coins, bullets)
    )

    connection.commit()
    connection.close()

    return {
        "message": "Spielstand gespeichert!",
        "coins": coins,
        "bullets": bullets
    }

@app.get("/game/save")
def get_save(token: str = Header(...)):
    connection = get_connection()

    result = connection.execute(
        """
        SELECT user_id
        FROM sessions
        WHERE token = ?
        """,
        (token,)
    ).fetchone()

    if result is None:
        connection.close()
        raise HTTPException(
            status_code=401,
            detail="Ungültiger Token."
        )

    user_id = result["user_id"]

    save = connection.execute(
        """
        SELECT coins, bullets
        FROM saves
        WHERE user_id = ?
        """,
        (user_id,)
    ).fetchone()

    connection.close()

    if save is None:
        return {
            "coins": 0,
            "bullets": 0
        }

    return {
        "coins": save["coins"],
        "bullets": save["bullets"]
    }

class CompleteLevelRequest(BaseModel):
    level_id: int

@app.post("/game/level/complete")
def complete_level(
    level: CompleteLevelRequest,
    token: str = Header(...)
):
    connection = get_connection()

    result = connection.execute(
        """
        SELECT user_id
        FROM sessions
        WHERE token = ?
        """,
        (token,)
    ).fetchone()

    if result is None:
        connection.close()
        raise HTTPException(
            status_code=401,
            detail="Ungültiger Token."
        )

    user_id = result["user_id"]

    if level.level_id > 1:
        previous_level = connection.execute(
            """
            SELECT id
            FROM completed_levels
            WHERE user_id = ? AND level_id = ?
            """,
            (user_id, level.level_id - 1)
        ).fetchone()

        if previous_level is None:
            connection.close()
            raise HTTPException(
                status_code=400,
                detail=f"Level {level.level_id - 1} muss zuerst abgeschlossen werden."
            )

    connection.execute(
        """
        INSERT OR IGNORE INTO completed_levels (user_id, level_id)
        VALUES (?, ?)
        """,
        (user_id, level.level_id)
    )

    connection.commit()
    connection.close()

    return {
        "message": "Level abgeschlossen!",
        "level_id": level.level_id
    }

@app.get("/game/levels")
def get_completed_levels(token: str = Header(...)):
    connection = get_connection()

    result = connection.execute(
        """
        SELECT user_id
        FROM sessions
        WHERE token = ?
        """,
        (token,)
    ).fetchone()

    if result is None:
        connection.close()
        raise HTTPException(
            status_code=401,
            detail="Ungültiger Token."
        )

    user_id = result["user_id"]

    levels = connection.execute(
        """
        SELECT level_id
        FROM completed_levels
        WHERE user_id = ?
        ORDER BY level_id
        """,
        (user_id,)
    ).fetchall()

    connection.close()

    return {
        "completed_levels": [level["level_id"] for level in levels]
    }