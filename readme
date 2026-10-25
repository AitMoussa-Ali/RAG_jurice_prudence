# Recherche de jurisprudence

Cette application permet de retrouver des décisions de justice à partir d’une
question en langage courant, puis de poser des questions sur une affaire
sélectionnée.

## Comment l’application est organisée

L’application est composée de deux parties qui communiquent entre elles :

- **L’interface**, réalisée avec React et TypeScript, se trouve dans
  `Frontend/Front`. Elle permet de saisir une recherche, de choisir une méthode
  et de discuter à propos d’une affaire.
- **Le serveur**, réalisé avec FastAPI, se trouve dans `Backend`. Il reçoit les
  demandes de l’interface, interroge les données et prépare les réponses.

Le fonctionnement général est le suivant :

```text
Utilisateur
    ↓
Interface React
    ↓  requête HTTP
API FastAPI
    ↓
Recherche dans ChromaDB
    ↓
Réponse rédigée par le modèle de langage
    ↓
Interface React
```

## Déroulement d’une recherche

Quand une recherche est envoyée, le serveur commence par vérifier si la demande
concerne bien la recherche d’une affaire. Si c’est le cas, il consulte les
collections de jurisprudence dans `Collections`, qui contient la base ChromaDB.
Les décisions sont réparties entre les cours d’appel, les tribunaux judiciaires
et la Cour de cassation.

Quatre méthodes de recherche sont proposées :

- **BM25** et **TF-IDF** recherchent des correspondances à partir des mots de la
  demande ;
- **Sémantique** utilise les vecteurs enregistrés dans ChromaDB pour trouver des
  textes proches par leur sens ;
- **Hybride** combine plusieurs classements afin de rapprocher les résultats
  trouvés.

Le serveur transmet ensuite les éléments les plus pertinents au modèle de
langage, qui formule la réponse et identifie l’affaire à afficher. Après avoir
sélectionné une affaire, l’utilisateur peut poser des questions à son sujet :
le serveur retrouve alors des passages de cette même affaire et s’en sert pour
préparer sa réponse.

## Rôle des principaux dossiers

- `Frontend/Front/src` contient l’interface et les appels vers l’API.
- `Backend/main.py` démarre l’API et, dans la version préparée pour Docker,
  sert aussi les fichiers de l’interface.
- `Backend/Routes` définit les adresses de l’API, notamment celles de recherche
  et de discussion.
- `Backend/Controllers` contient la logique de recherche et de gestion des
  échanges.
- `Backend/Prompts` regroupe les instructions qui guident les réponses du
  modèle.
- `Backend/Common/llm.py` centralise la configuration du modèle de langage.
- `Backend/Discussions/discussions.json` conserve les conversations.
- `Collections` contient les données indexées utilisées pour retrouver les
  décisions.
- `Dataset/upload.py` récupère les données de jurisprudence depuis la source
  configurée.

Le modèle de langage est un service séparé de l’application. Son adresse, son
nom et sa clé d’accès se règlent dans le fichier `.env`. Les consignes pour
construire et partager l’application avec Docker sont dans [DOCKER.md](DOCKER.md).