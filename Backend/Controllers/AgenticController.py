from langchain.tools import tool
from typing import Literal
import chromadb
from Controllers.RetreivalController import KeywordSearch_TFIDF, KeywordSearch_BM25, SemanticSearch
DB_PATH = r"C:\Users\aliai\Desktop\M2 I2A\RAG Salah Bouchama\Collections"

client = chromadb.PersistentClient(path=str(DB_PATH))
#prestation
@tool
def search_cases(query : str, k : int, collection_name : Literal["cour_d_appel", "tribunal_judiciaire", "cour_de_cassation"], method : Literal["BM25","TFID","Semantic","Hybrid"]) : 
    
    """
    Cet outil permet de chercher les chunks ou les documents depuis une collection baser sur la requete ou la question de l'utilisateur, 
    il permet de faire sortir les chunks basé sur les trois méthodes de recherche qui sont les suivants : 
        Key word search avec TFID, 
        Key word Search aveec BM25,
        et Semantic Search avec cosine similarity
    """

    collection = client.get_collection(name = collection_name)

    key_words_search_results_tf_idf = KeywordSearch_TFIDF(query, k, collection)

    key_words_search_results_BM25 = KeywordSearch_BM25(query, k, collection)

    semantic_search_results = SemanticSearch(query, collection, k)

    return semantic_search_results, key_words_search_results_BM25, key_words_search_results_tf_idf