# Exécuter et partager l’application avec Docker

L’image Docker contient le frontend React, le backend FastAPI, la base de données Chroma ainsi que les fichiers du tokenizer et du modèle d’embeddings utilisés pour la recherche documentaire.

Le LLM reste un service externe. Chaque utilisateur doit donc fournir sa propre URL de service LLM et sa propre clé API via un fichier `.env` local.

## 1. Construire l’image sous Windows

### Prérequis

- Docker Desktop installé et démarré, avec les conteneurs Linux activés.
- Le répertoire `Collections` présent à la racine du dépôt, contenant la base de données Chroma.
- Une connexion Internet pour télécharger les dépendances.
- Un service LLM compatible avec l’API OpenAI, accessible depuis Docker.

### Étape 1 : Préparer le projet

Dans PowerShell, place-toi à la racine du dépôt, dans le répertoire contenant le fichier `Dockerfile`.

Vérifie que le répertoire `Collections` est présent. Celui-ci est ignoré par Git et occupe environ 543 Mo dans le projet actuel. Il doit être disponible sur la machine utilisée pour construire l’image.

Avant de continuer, arrête toute instance locale de l’application qui utilise cette base de données afin que Docker puisse en copier un instantané cohérent.

### Étape 2 : Configurer le service LLM

Crée ton fichier de configuration local à partir du modèle fourni :

```powershell
Copy-Item .env.example .env
notepad .env
```

Configure les variables suivantes dans le fichier `.env` :

```env
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=your_api_key
LLM_MODEL=your_model_name
```

Remplace les valeurs d’exemple par celles de ton service LLM.

- `LLM_BASE_URL` : URL du point de terminaison du service LLM.
- `LLM_API_KEY` : clé API permettant d’accéder au service.
- `LLM_MODEL` : nom du modèle à utiliser.

Les valeurs doivent être renseignées sans guillemets.

**Important :**
- Ne place jamais de véritables identifiants dans l’image Docker.
- Ne partage pas ton fichier `.env`.
- Si tu utilises Ollama sur la même machine Windows, utilise `http://host.docker.internal:11434/v1` et vérifie que le modèle choisi est déjà disponible dans Ollama.
- Si ton fournisseur LLM utilise une autre URL, configure celle-ci à la place.

### Étape 3 : Construire l’image Docker

Depuis la racine du dépôt, exécute :

```powershell
docker build -t rag-jurice-prudence:1.1 .
```

Cette commande construit l’image Docker de l’application.

La construction télécharge les dépendances Python et Node, puis met en cache le tokenizer et le modèle d’embeddings utilisés par Chroma.

Cette opération nécessite une connexion Internet et peut prendre plusieurs minutes. L’image obtenue est volumineuse, car elle contient également la base de données et les modèles nécessaires à l’exécution.

### Étape 4 : Démarrer l’application

Une fois l’image construite, démarre le conteneur :

```powershell
docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  rag-jurice-prudence:1.1
```

Cette commande :

- démarre le conteneur en arrière-plan ;
- expose le port `8000` du conteneur sur le port `8080` de la machine hôte ;
- charge les variables d’environnement depuis le fichier `.env` ;
- conserve les données Chroma et les données de l’application dans des volumes Docker nommés ;
- configure le redémarrage automatique du conteneur, sauf s’il a été arrêté manuellement.

### Étape 5 : Accéder à l’application

Une fois le conteneur démarré, ouvre les adresses suivantes dans ton navigateur :

| Service | URL |
|---|---|
| Interface React | http://localhost:8080 |
| Vérification de l’état de santé | http://localhost:8080/health |
| Documentation de l’API FastAPI | http://localhost:8080/docs |

Le point de terminaison `/health` doit renvoyer une réponse similaire à celle-ci :

```json
{
  "status": "ok"
}
```

Cette réponse confirme que le point de terminaison de santé fonctionne. Elle ne garantit pas que le service LLM est correctement configuré.

## 2. Gérer le conteneur Docker

### Consulter les journaux

Pour suivre les journaux de l’application en temps réel :

```powershell
docker logs -f rag-jurice-prudence
```

### Arrêter l’application

```powershell
docker stop rag-jurice-prudence
```

### Redémarrer l’application

```powershell
docker start rag-jurice-prudence
```

### Supprimer le conteneur

```powershell
docker rm -f rag-jurice-prudence
```

La suppression du conteneur ne supprime pas les volumes Docker nommés. Les données qui y sont stockées restent donc disponibles pour une utilisation ultérieure.

### Persistance des données

L’application utilise deux volumes Docker :

| Volume | Répertoire dans le conteneur | Utilisation |
|---|---|---|
| `rag-jurice-collections` | `/app/Collections` | Base de données Chroma |
| `rag-jurice-data` | `/app/data` | Données de l’application, notamment l’historique des conversations |

Lors de leur première utilisation, les volumes sont initialisés à partir des données présentes dans l’image, si les conditions de montage Docker le permettent.

Les volumes permettent de conserver les données lors de la suppression et de la recréation du conteneur.

**Attention :** les volumes existants ne sont pas automatiquement remplacés par les données d’une nouvelle image. Si tu reconstruis l’image avec une base de données mise à jour, le volume Chroma existant peut continuer à contenir l’ancienne base.

## 3. Partager l’image Docker

Deux méthodes sont possibles pour partager l’application avec d’autres utilisateurs.

### Méthode A : Envoyer une archive Docker

Cette méthode permet de transmettre l’image sans la publier sur un registre en ligne.

#### Étape 1 : Exporter l’image

Sur la machine ayant construit l’image, exécute :

```powershell
docker save -o rag-jurice-prudence-1.1.tar rag-jurice-prudence:1.1
```

Cette commande génère une archive contenant l’image Docker.

Le fichier obtenu peut être volumineux. Utilise un moyen de partage de fichiers adapté à sa taille.

#### Étape 2 : Charger l’image sur la machine du destinataire

Après avoir reçu l’archive, le destinataire exécute :

```powershell
docker load -i .\rag-jurice-prudence-1.1.tar
```

L’image est alors disponible localement dans Docker.

#### Étape 3 : Configurer le LLM du destinataire

Le destinataire doit créer son propre fichier `.env` :

```powershell
Copy-Item .env.example .env
notepad .env
```

Il doit ensuite renseigner les variables `LLM_BASE_URL`, `LLM_API_KEY` et `LLM_MODEL` correspondant à son propre service LLM.

Si le destinataire ne dispose pas du fichier `.env.example`, il peut créer manuellement un fichier `.env` contenant ces trois variables.

**Ne transmets jamais ton fichier `.env` avec l’archive Docker.**

#### Étape 4 : Démarrer l’application

Le destinataire exécute :

```powershell
docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  rag-jurice-prudence:1.1
```

L’application est ensuite accessible à l’adresse http://localhost:8080.

### Méthode B : Publier l’image sur Docker Hub

Cette méthode permet aux utilisateurs de télécharger l’image directement depuis un registre de conteneurs.

#### Étape 1 : Attribuer un tag à l’image

Remplace `YOUR_DOCKERHUB_USERNAME` par le nom d’utilisateur du compte Docker Hub utilisé pour publier l’image.

```powershell
docker tag rag-jurice-prudence:1.1 YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

#### Étape 2 : Se connecter à Docker Hub

```powershell
docker login
```

Suis les instructions pour t’authentifier.

#### Étape 3 : Publier l’image

```powershell
docker push YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

L’image est alors disponible sur le registre Docker Hub associé à ton compte.

#### Étape 4 : Télécharger et exécuter l’image

Sur la machine du destinataire, télécharge l’image :

```powershell
docker pull YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

Crée ensuite un fichier `.env` contenant la configuration de son propre service LLM, puis démarre le conteneur :

```powershell
docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

L’application sera accessible à l’adresse http://localhost:8080.

Si le dépôt Docker Hub est privé, accorde préalablement aux destinataires les autorisations nécessaires pour télécharger l’image.

## 4. Dépannage

### L’interface s’affiche, mais les requêtes échouent

Vérifie les éléments suivants :

1. Le service LLM est démarré et accessible.
2. `LLM_BASE_URL` correspond à une URL accessible depuis le conteneur Docker.
3. `LLM_API_KEY` contient une clé valide pour le service utilisé.
4. `LLM_MODEL` correspond à un modèle disponible et compatible avec l’application.
5. Les journaux du conteneur ne révèlent pas d’erreur de connexion ou d’authentification.

Pour consulter les journaux :

```powershell
docker logs -f rag-jurice-prudence
```

### Ollama fonctionne sur la machine hôte, mais Docker ne peut pas y accéder

Si Ollama est exécuté sur la même machine Windows que Docker Desktop, utilise généralement :

```env
LLM_BASE_URL=http://host.docker.internal:11434/v1
```

N’utilise pas `localhost` pour désigner la machine hôte depuis le conteneur.

Vérifie également que le modèle sélectionné est disponible dans Ollama et que le service accepte les requêtes provenant de Docker.

### Les modifications du fichier `.env` ne sont pas prises en compte

Docker charge les variables du fichier `.env` au démarrage du conteneur. Modifier le fichier ne met pas automatiquement à jour les variables d’environnement d’un conteneur déjà créé.

Pour appliquer les nouvelles valeurs, supprime et recrée le conteneur :

```powershell
docker rm -f rag-jurice-prudence

docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  rag-jurice-prudence:1.1
```

Cette opération conserve les données présentes dans les volumes Docker nommés.

### Le répertoire `Collections` est absent

Le répertoire `Collections` est ignoré par Git. Cloner le dépôt ne suffit donc pas à récupérer la base de données nécessaire à la construction de l’image.

Pour résoudre ce problème :

1. Récupère la base de données séparément.
2. Place le répertoire `Collections` à la racine du dépôt.
3. Vérifie que les données sont présentes avant de construire l’image.

Tu peux également utiliser une image construite et partagée depuis une machine disposant déjà de la base de données.

