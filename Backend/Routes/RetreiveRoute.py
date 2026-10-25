from fastapi import APIRouter, HTTPException, Form, Body
from pydantic import BaseModel, Field
from typing import Literal, Optional
from Backend.Controllers.RetreivalController import Search_case, retreive

router = APIRouter(prefix="/api/retrieval", tags=["Retrieval"])

# 1. Define a Pydantic model for JSON requests
class SearchRequest(BaseModel):
    request: str
    method: Literal["BM_25", "TFIDF", "Semantic", "Hybrid"]

@router.post("/search")
async def search_cases(
    # Option A: Accept as JSON Body
    body: Optional[SearchRequest] = None,
    # Option B: Accept as Form-Data (if JSON is not provided)
    request: Optional[str] = Form(None),
    method: Optional[Literal["BM_25", "TFIDF", "Semantic", "Hybrid"]] = Form(None)
):
    try:
        # Determine whether the user sent JSON or Form-Data
        query_str = body.request if body else request
        search_method = body.method if body else method

        if not query_str or not search_method:
            raise HTTPException(
                status_code=422,
                detail="Les champs 'request' (ou query) et 'method' sont obligatoires (via JSON ou Form-Data)."
            )

        response, _ = Search_case(query=query_str, method=search_method)
        # Note: If Search_case returns a raw string (JSON string from LLM), 
        # return it directly or parse it to a dict if it's already a dict.
        return response
    
    except HTTPException as he:
        raise he
    except Exception as exc:
        print(exc)
        raise HTTPException(
            status_code=500,
            detail="Une erreur est survenue pendant la recherche juridique.",
        ) from exc

class DiscussRequest(BaseModel):
    search: dict
    query: str
    conversation_id: str
    method: Literal["BM_25", "TFIDF", "Semantic", "Hybrid"]
    discussion: list[dict] = []

@router.post("/discuss")
def discuss(body: DiscussRequest):
    try:
        return retreive(
            method=body.method, search=body.search, discussion=body.discussion,
            query=body.query, conversation_id=body.conversation_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(exc)
        raise HTTPException(status_code=500, detail="Une erreur est survenue pendant la discussion.") from exc