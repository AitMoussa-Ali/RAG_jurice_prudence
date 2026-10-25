
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from Backend.Routes.RetreiveRoute import router as retrieval_router

app = FastAPI(
    title="RAG juridique",
    description="API de recherche juridique basée sur RAG.",
    version="1.0.0",
)

# Allow your frontend to call the backend during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(retrieval_router)


@app.get("/")
def root():
    return {
        "message": "RAG Salah Bouchama API is running"
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}
