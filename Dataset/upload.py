
import requests
import pandas as pd
from dotenv import load_dotenv
import os

load_dotenv(
    r"C:\Users\aliai\Desktop\M2 I2A\RAG Salah Bouchama\.env"
)

BASE_URL = os.getenv("Base_url")

async def get_data(
    juridication: str,
    offset: int = 0,
    length: int = 100
) -> pd.DataFrame:

    if not BASE_URL:
        raise ValueError("La variable Base_url est absente du fichier .env")

    if not 1 <= length <= 100:
        raise ValueError("length doit être compris entre 1 et 100")

    try:
        response = requests.get(
            BASE_URL,
            params={
                "dataset": "antoinejeannot/jurisprudence",
                "config": "default",
                "split": juridication,
                "offset": offset,
                "length": length,
            },
            timeout=30
        )

        data = response.json()

        rows = [item["row"] for item in data["rows"]]

        data = pd.DataFrame(rows)

        return data[["id","themes","text", "location", "numbers"]]

    except requests.RequestException as e:
        print(f"Erreur lors de la requête HTTP : {e}")
        raise
