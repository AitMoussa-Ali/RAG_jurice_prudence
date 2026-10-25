from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from rank_bm25 import BM25Okapi
import chromadb
from transformers import BertTokenizer
from collections import defaultdict
from typing import Literal
from Backend.Common.llm import get_llm
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import json
from Backend.Controllers.DiscussionController import load_discussions, save_discussions
from Backend.Prompts.Prompt import in_case_search_prompt, search_case_prompt, build_search_case_prompt, build_retreive_prompt
tokenizer = BertTokenizer.from_pretrained('bert-base-multilingual-cased')
DB_PATH = r"C:\Users\aliai\Desktop\M2 I2A\RAG Salah Bouchama\Collections"

def Choose_method(query: str, method : Literal["BM_25", "TFIDF", "Semantic", "Hybrid"]):
    client = chromadb.PersistentClient(path=DB_PATH)
    results = {
            "cour_d_appel": None,
            "tribunal_judiciaire": None,
            "cour_de_cassation": None
        }

    match method: 
            case "BM_25":
                results["cour_d_appel"] = KeywordSearch_BM25(query=query, top_k=100, collection=client.get_collection(name="cour_d_appel"))
                results["tribunal_judiciaire"] = KeywordSearch_BM25(query=query, top_k=100, collection=client.get_collection(name="tribunal_judiciaire"))
                results["cour_de_cassation"] = KeywordSearch_BM25(query=query, top_k=100, collection=client.get_collection(name="cour_de_cassation"))
            case "Semantic":
                results["cour_d_appel"] = SemanticSearch(query=query, collection=client.get_collection(name="cour_d_appel"), top_k=100)
                results["tribunal_judiciaire"] = SemanticSearch(query=query, collection=client.get_collection(name="tribunal_judiciaire"), top_k=100)
                results["cour_de_cassation"] = SemanticSearch(query=query, collection=client.get_collection(name="cour_de_cassation"), top_k=100)
            case "TFIDF":
                results["cour_d_appel"] = KeywordSearch_TFIDF(query=query, top_k=100, collection=client.get_collection(name="cour_d_appel"))
                results["tribunal_judiciaire"] = KeywordSearch_TFIDF(query=query, top_k=100, collection=client.get_collection(name="tribunal_judiciaire"))
                results["cour_de_cassation"] = KeywordSearch_TFIDF(query=query, top_k=100, collection=client.get_collection(name="cour_de_cassation"))
            case "Hybrid":
                results["cour_d_appel"] = HybridSearch(query=query, collection=client.get_collection(name="cour_d_appel"), top_k=100)
                results["tribunal_judiciaire"] = HybridSearch(query=query, collection=client.get_collection(name="tribunal_judiciaire"), top_k=100)
                results["cour_de_cassation"] = HybridSearch(query=query, collection=client.get_collection(name="cour_de_cassation"), top_k=100)

    return results

def KeywordSearch_TFIDF(query : str, top_k : int, collection : chromadb.Collection) -> list :
    #Call the vectorizer
    vectorizer = TfidfVectorizer()
    stored = collection.get(
                include=["documents", "metadatas"]
            )
    
    docs = stored["documents"]
    ids = stored["ids"]
    metadatas = stored["metadatas"]
    
    document_vectors = vectorizer.fit_transform(docs)

    # Convert the query into the same TF-IDF space
    query_vector = vectorizer.transform(["affaire " + query])
    # Score the query against all indexed documents
    scores = cosine_similarity(
        query_vector,
        document_vectors
    ).ravel()

    # Sort from highest score to lowest
    ranked_indices = scores.argsort()[::-1]

    results = []

    for idx in ranked_indices:
        if scores[idx] <= 0:
            break

        results.append({
            "documents": docs[idx],
            "score": float(scores[idx]),
            "id" : ids[idx],
            "metadatas" : metadatas[idx]
        })

        if len(results) == top_k:
            break

    return results
    
def KeywordSearch_BM25(query : str, top_k : int, collection : chromadb.Collection) -> list :

    stored = collection.get(
            include=["documents", "metadatas"]
        )
    docs = stored["documents"]
    ids = stored["ids"]
    metadatas = stored["metadatas"]
    
    tokenized_docs = [tokenizer.tokenize(doc) for doc in docs]
    bm25 = BM25Okapi(tokenized_docs)

    scores = bm25.get_scores(tokenizer.tokenize("affaire " + query))

    ranked_indices = scores.argsort()[::-1]

    return [
        {
            "documents": docs[i],
            "id" : ids[i],
            "score": float(scores[i]),
            "metadatas" : metadatas[i]
        }
        for i in ranked_indices[:top_k]
        if scores[i] > 0
    ]

def SemanticSearch(
    query: str,
    collection: chromadb.Collection,
    top_k: int = 3
) -> list[dict]:

    results = collection.query( 
        query_texts=["affaire " + query],
        n_results=top_k,
        include=["documents", "metadatas", "distances"]
    )

    output = []

    for i, document in enumerate(results["documents"][0]):
        output.append({
            "documents": document,
            "id" : results['ids'][0][i],
            "metadata": results["metadatas"][0][i],
            "score": results["distances"][0][i]
        })

    return output

def reciprocal_rank_fusion(
    result_lists: list[list[str]],
    k: int = 60,
) -> list[tuple[str, float]]:

    scores = defaultdict(float)

    for results in result_lists:
        for rank, doc_id in enumerate(results, start=1):
            scores[doc_id] += (1 / (k + rank))*100

    return sorted(
        scores.items(),
        key=lambda item: item[1],
        reverse=True,
    )

def HybridSearch(query: str, collection: chromadb.Collection, top_k: int):

    #Results of each search
    bm25_res = KeywordSearch_BM25(query=query, collection=collection, top_k=top_k)
    tfidf_res = KeywordSearch_TFIDF(query=query, top_k=top_k, collection=collection)
    sem_res = SemanticSearch(query=query, collection=collection, top_k=top_k)

    #Building lists
    bm25_res_ids = [id["id"] for id in bm25_res]
    tfidf_res_ids = [id["id"] for id in tfidf_res]
    sem_res_ids = [id["id"] for id in sem_res]
    list_3 = [tfidf_res_ids, bm25_res_ids] 
    res3 = reciprocal_rank_fusion(result_lists=list_3)
    ids = [t for t, n in res3]
    list4 = [ids, sem_res_ids]

    #Applying the fusion
    res4 = reciprocal_rank_fusion(list4)
    chunks = res4[:top_k]
    chunks_ids = [t for t, n in chunks]

    # Normalize relative to the best result in this query
    max_score = chunks[0][1] if chunks else 0

    scores_by_id = {
        doc_id: round((score / max_score) * 100, 1)
        if max_score > 0 else 0.0
        for doc_id, score in chunks
    }

    # Récupération brute depuis ChromaDB
    raw_results = collection.get(
        ids=chunks_ids,
        include=["documents", "metadatas"]
    )

    # REFORMATAGE : Transformer le dict de listes en liste de dictionnaires
    formatted_results = []
    
    # Pour s'assurer de garder l'ordre exact trié par le RRF (chunks_ids)
    # on parcourt les IDs dans l'ordre de `chunks_ids`
    for doc_id in chunks_ids:
        if doc_id in raw_results["ids"]:
            idx = raw_results["ids"].index(doc_id)
            formatted_results.append({
                "documents": raw_results["documents"][idx],
                "id": raw_results["ids"][idx],
                "metadatas": raw_results["metadatas"][idx],
                "score": scores_by_id[doc_id]
            })

    return formatted_results

def is_case_search_request(query: str) -> bool:
    llm = get_llm()

    try:
        response = llm.invoke([
            SystemMessage(content=in_case_search_prompt),
            HumanMessage(content=query)
        ])

        result = json.loads(response.content)
        return result.get("intent")

    except (json.JSONDecodeError, AttributeError, TypeError):
        # En cas de résultat invalide, ne pas lancer la recherche.
        return False

def Search_within_source(
    query: str,
    collection: chromadb.Collection,
    source_id: str,
    method: Literal["BM_25", "TFIDF", "Semantic", "Hybrid"],
    top_k: int = 10,
) -> list[dict]:

    # Retrieve only chunks belonging to the selected source.
    stored = collection.get(
        where={"source_id": source_id},
        include=["documents", "metadatas"],
    )

    if not stored["ids"]:
        return []

    # Build a local collection of chunks in memory.
    docs = stored["documents"]
    ids = stored["ids"]
    metadatas = stored["metadatas"]

    # Rank only these chunks using the selected retrieval method.
    if method == "BM_25":
        tokenized_docs = [tokenizer.tokenize(doc) for doc in docs]
        bm25 = BM25Okapi(tokenized_docs)
        scores = bm25.get_scores(tokenizer.tokenize("affaire " + query))
        ranked_indices = scores.argsort()[::-1]

        results = [
            {
                "id": ids[i],
                "documents": docs[i],
                "metadatas": metadatas[i],
                "score": float(scores[i]),
            }
            for i in ranked_indices
            if scores[i] > 0
        ]

    elif method == "TFIDF":
        vectorizer = TfidfVectorizer()
        document_vectors = vectorizer.fit_transform(docs)
        query_vector = vectorizer.transform(["affaire " + query])

        scores = cosine_similarity(
            query_vector, document_vectors
        ).ravel()

        ranked_indices = scores.argsort()[::-1]

        results = [
            {
                "id": ids[i],
                "documents": docs[i],
                "metadatas": metadatas[i],
                "score": float(scores[i]),
            }
            for i in ranked_indices
            if scores[i] > 0
        ]

    elif method == "Semantic":
        # Filtered vector search directly in ChromaDB.
        results_raw = collection.query(
            query_texts=["affaire " + query],
            where={"source_id": source_id},
            n_results=min(top_k, len(ids)),
            include=["documents", "metadatas", "distances"],
        )

        return [
            {
                "id": results_raw["ids"][0][i],
                "documents": results_raw["documents"][0][i],
                "metadatas": results_raw["metadatas"][0][i],
                "score": results_raw["distances"][0][i],
            }
            for i in range(len(results_raw["ids"][0]))
        ]

    elif method == "Hybrid":
        bm25_results = Search_within_source(
            query, collection, source_id, "BM_25", top_k=len(ids)
        )
        tfidf_results = Search_within_source(
            query, collection, source_id, "TFIDF", top_k=len(ids)
        )

        bm25_ids = [item["id"] for item in bm25_results]
        tfidf_ids = [item["id"] for item in tfidf_results]

        fused = reciprocal_rank_fusion([tfidf_ids, bm25_ids])

        scores_by_id = dict(fused)
        docs_by_id = {
            ids[i]: {
                "id": ids[i],
                "documents": docs[i],
                "metadatas": metadatas[i],
            }
            for i in range(len(ids))
        }

        return [
            {
                **docs_by_id[doc_id],
                "score": score,
            }
            for doc_id, score in fused[:top_k]
        ]

    else:
        raise ValueError(f"Unsupported retrieval method: {method}")

    return results[:top_k]

def Search_case(query: str, method: Literal["BM_25", "TFIDF", "Semantic", "Hybrid"]):
    llm = get_llm()
    # 1. Check the user's intent BEFORE retrieval
    if is_case_search_request(query) != "case_search":
        response = llm.invoke([
                SystemMessage(
                    content=search_case_prompt),
                HumanMessage(content=query)
            ])
        response_json = json.loads(response.content)

        return response_json, []
    
    # 2. Continue with your existing implementation

    # Keep the rest of your existing Search_case()
    # implementation here, unchanged.
    
    results = Choose_method(query=query, method=method)

    # Agrégation de tous les résultats de toutes les collections dans une seule liste
    all_chunks = []
    for collection_name, res_list in results.items():
        if not isinstance(res_list, list):
            continue
        for chunk in res_list:
            # Keep the original chunk information
            chunk_with_source = {
                **chunk,
                "collection_name": collection_name,
            }
            all_chunks.append(chunk_with_source)

    # Extraction conjointe des documents et des métadonnées de manière robuste
    formatted_docs = []
    for chunk in all_chunks:
        doc_text = chunk.get("documents", "")
        # Gère le cas où la clé est "metadatas" ou "metadata" selon la fonction de recherche
        meta = chunk.get("metadatas") or chunk.get("metadata") or {}
        
        # Sécurisation du formatage du score
        score = chunk.get('score', 'non disponible')
        score_str = f"{score:.2f}%" if isinstance(score, (int, float)) else str(score)
        
        # Formatage propre : on combine le texte du document et ses métadonnées sous forme de liste
        doc_block = (
            f"chunk_id: {chunk.get('id')}\n"
            f"collection_name: {chunk['collection_name']}\n"
            f"document: {doc_text}\n"
            f"metadata: {meta}\n"
            f"score: {score_str}"
        )

        formatted_docs.append(doc_block)

    # Fusion avec des sauts de ligne
    documents_text = "\n\n".join(formatted_docs)
    
    system_prompt = build_search_case_prompt(documents_text=documents_text, query=query)

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=query)
    ])

    try:
        response_json = json.loads(response.content)
    except json.JSONDecodeError:
        # Fallback in case the LLM didn't return valid JSON
        response_json = {"error": "Invalid JSON returned by LLM", "raw_content": response.content}
    
    return response_json, formatted_docs

def retreive(
    method: Literal["BM_25", "TFIDF", "Semantic", "Hybrid"],
    search: dict,
    discussion: dict,
    query: str,
    conversation_id: str = "default",
) -> dict:
    """
    Answer a question about the selected case.

    search:
        The selected case returned by your search workflow.
        Must contain collection_name and chunk_id.

    discussion:
        Optional initial conversation history.
        A list of {"role": ..., "content": ...} messages.

    query:
        The user's new question.
    """
    # 1. Verify that a case has actually been selected.
    if not search or not search.get("chunk_id"):
        if is_case_search_request(query=query) == "case_search" :
            search = Search_case(method = method, query=query)


    collection_name = search.get("collection_name")

    allowed_collections = {
        "cour_d_appel",
        "tribunal_judiciaire",
        "cour_de_cassation",
    }

    if collection_name not in allowed_collections:
        return {
            "message": "La collection de l'affaire sélectionnée est invalide."
        }

    # 2. Load the JSON conversation memory.
    discussions = load_discussions()

    if conversation_id not in discussions:
        discussions[conversation_id] = {
            "selected_case": search,
            "messages": discussion if isinstance(discussion, list) else [],
        }

    conversation = discussions[conversation_id]

    # Prevent accidentally switching cases in an existing conversation.
    previous_case = conversation.get("selected_case", {})

    if (
        previous_case.get("chunk_id") != search.get("chunk_id")
        or previous_case.get("collection_name") != collection_name
    ):
        return {
            "message": (
                "Cette conversation est associée à une autre affaire. "
                "Créez une nouvelle conversation ou changez explicitement "
                "l'affaire sélectionnée."
            )
        }

    # 3. Retrieve evidence from ChromaDB.
    client = chromadb.PersistentClient(path=DB_PATH)
    collection = client.get_collection(name=collection_name)

    source_id = search.get("source_id")

    if source_id:
        evidence = Search_within_source(
            query=query,
            collection=collection,
            source_id=source_id,
            method=method,
            top_k=10,
        )
    else:
        evidence = []

    if not evidence:
        return {
            "message": "Aucun contenu pertinent trouvé dans cette affaire."
        }

    evidence_text = "\n\n".join(
        f"Chunk ID: {item['id']}\n"
        f"Metadata: {item.get('metadatas', item.get('metadata', {}))}\n"
        f"Content: {item['documents']}"
        for item in evidence
    )

    # 5. Build the LLM messages using the saved history.
    llm = get_llm()

    selected_case = conversation["selected_case"]

    system_prompt = build_retreive_prompt(evidence_text=evidence_text, case=selected_case)

    messages = [SystemMessage(content=system_prompt)]

    for message in conversation.get("messages", []):
        role = message.get("role")
        content = message.get("content", "")

        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=query))

    # 6. Generate the answer.
    response = llm.invoke(messages)
    answer = response.content

    # 7. Save both sides of the exchange.
    conversation.setdefault("messages", []).extend([
        {"role": "user", "content": query},
        {"role": "assistant", "content": answer},
    ])

    save_discussions(discussions)

    return {
        "conversation_id": conversation_id,
        "selected_case": selected_case,
        "answer": answer,
        "evidence": evidence,
    }


