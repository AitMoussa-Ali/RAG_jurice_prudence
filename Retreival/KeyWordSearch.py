from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from transformers import BertTokenizer
from rank_bm25 import BM25Okapi
import chromadb
from sentence_transformers import SentenceTransformer
from pathlib import Path
tokenizer = BertTokenizer.from_pretrained('bert-base-multilingual-cased')

def KeywordSearch_TFIDF(query : str, top_k : int, collection : chromadb.Collection) -> list :
    #Call the vectorizer
    vectorizer = TfidfVectorizer()

    stored = collection.get(
                include=["documents"]
            )
    
    docs = stored["documents"]
    ids = stored["ids"]
    
    document_vectors = vectorizer.fit_transform(docs)

    # Convert the query into the same TF-IDF space
    query_vector = vectorizer.transform([query])
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
            "document": docs[idx],
            "score": float(scores[idx]),
            "id" : ids[idx]
        })

        if len(results) == top_k:
            break

    return results
    
def KeywordSearch_BM25(query : str, top_k : int, collection : chromadb.Collection) -> list :

    stored = collection.get(
            include=["documents"]
        )

    docs = stored["documents"]
    ids = stored["ids"]
    
    tokenized_docs = [tokenizer.tokenize(doc) for doc in docs]
    bm25 = BM25Okapi(tokenized_docs)

    scores = bm25.get_scores(tokenizer.tokenize(query))

    ranked_indices = scores.argsort()[::-1]

    return [
        {
            "document": docs[i],
            "id" : ids[i],
            "score": float(scores[i])
        }
        for i in ranked_indices[:top_k]
        if scores[i] > 0
    ]

    