from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import lobby, game, ws

app = FastAPI(title="Hide @ Nite API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lobby.router, prefix="/api/lobby")
app.include_router(game.router, prefix="/api/game")
app.include_router(ws.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}
