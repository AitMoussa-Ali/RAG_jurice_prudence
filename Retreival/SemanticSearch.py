import chromadb

def SemanticSearch(
    query: str,
    collection: chromadb.Collection,
    top_k: int = 3
) -> list[dict]:

    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        include=["documents", "metadatas", "distances"]
    )

    output = []

    for i, document in enumerate(results["documents"][0]):
        output.append({
            "document": document,
            "id" : results['ids'][0][i],
            # "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i]
        })

    return output
   