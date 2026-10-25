"""Accès unique au LLM pour tout le cours.

Le même code fonctionne avec Ollama (local) ou une API compatible OpenAI :
seul le fichier .env change.
"""
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
dot_env_path = r"C:\Users\aliai\Desktop\M2 I2A\RAG Salah Bouchama\.env"
load_dotenv()


def get_llm(temperature: float = 0.0, **kwargs) -> ChatOpenAI:
    """Retourne le modèle de chat configuré dans le fichier .env."""
    model = os.getenv("LLM_MODEL")
    if not model: 
        raise RuntimeError("LLM_MODEL est vide : copiez .env.example en .env et complétez-le.")
    base_url = os.getenv("LLM_BASE_URL", "").strip()
    if len(base_url) >= 2 and base_url[0] == base_url[-1] and base_url[0] in {"'", '"'}:
        base_url = base_url[1:-1].strip()
    if not base_url:
        raise RuntimeError("LLM_BASE_URL est vide : indiquez l'adresse de votre service LLM.")
    return ChatOpenAI(
        base_url=base_url,
        api_key=os.getenv("LLM_API_KEY", "ollama"),
        model=model,
        temperature=temperature,
        **kwargs,
    )