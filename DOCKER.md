# Run and share the application with Docker

The Docker image contains the React frontend, FastAPI backend, Chroma database,
and the tokenizer/embedding model files used by retrieval. The LLM remains an
external service, so each person running the image supplies their own LLM
endpoint and API key through a local `.env` file.

## Build on Windows

1. Install and start Docker Desktop with Linux containers enabled.
2. In PowerShell, change to the repository root (the directory containing this
   file). Make sure the populated `Collections` directory is present. It is
   ignored by Git and is about 543 MB in the current project; it must be present
   on the machine that builds the image. Stop any local app process using this
   database before building, so Docker copies a consistent database snapshot.
3. Create a local LLM configuration file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` for an OpenAI-compatible
   service you can access. In this Docker `.env` file, enter values without
   quotes, for example `LLM_BASE_URL=http://host.docker.internal:11434/v1`.
   Do not put real credentials in the Docker image or share your `.env` file.
   For Ollama running on the same Windows machine, use
   `http://host.docker.internal:11434/v1` as the base URL and ensure the chosen
   model is already available in Ollama.

4. Build the image from the repository root:

   ```powershell
   docker build -t rag-jurice-prudence:1.1 .
   ```

   The build downloads Python/Node dependencies and caches the tokenizer and
   Chroma embedding model. It needs internet access and may take several
   minutes; the resulting image is large because it includes the database and
   runtime models.

5. Start the application:

   ```powershell
   docker run -d --name rag-jurice-prudence --restart unless-stopped `
     -p 8080:8000 `
     --env-file .env `
     -v rag-jurice-collections:/app/Collections `
     -v rag-jurice-data:/app/data `
     rag-jurice-prudence:1.1
   ```

6. Open <http://localhost:8080>. Check <http://localhost:8080/health> for
   `{"status":"ok"}` and <http://localhost:8080/docs> for the API.

Useful management commands:

```powershell
docker logs -f rag-jurice-prudence
docker stop rag-jurice-prudence
docker start rag-jurice-prudence
docker rm -f rag-jurice-prudence
```

The named volumes preserve the Chroma database and conversation history across
container recreation. On their first use, Docker initializes the database
volume from the database included in the image.

## Share the image

### Send an image archive

On the build machine:

```powershell
docker save -o rag-jurice-prudence-1.1.tar rag-jurice-prudence:1.1
```

Send the archive to recipients using a suitable file-sharing method. They load
it with:

```powershell
docker load -i .\rag-jurice-prudence-1.1.tar
```

Each recipient then creates their own `.env` and runs the `docker run` command
above. Do not send your `.env` file with the archive.

If the interface loads but requests fail, check that `LLM_BASE_URL` in the
`.env` file is the address of a service reachable from Docker. For Ollama on
the Windows host, use `host.docker.internal`, not `localhost`. If Docker was
already started when the `.env` file was changed, remove and recreate the
container so it receives the updated environment:

```powershell
docker rm -f rag-jurice-prudence
docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  rag-jurice-prudence:1.1
```

### Publish to a container registry

Replace `YOUR_DOCKERHUB_USERNAME` with the publisher's Docker Hub account:

```powershell
docker tag rag-jurice-prudence:1.1 YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
docker login
docker push YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

Recipients pull the image, create their own `.env`, and run:

```powershell
docker pull YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
docker run -d --name rag-jurice-prudence --restart unless-stopped `
  -p 8080:8000 `
  --env-file .env `
  -v rag-jurice-collections:/app/Collections `
  -v rag-jurice-data:/app/data `
  YOUR_DOCKERHUB_USERNAME/rag-jurice-prudence:1.1
```

If the repository is private, grant them registry access first.

## Important

- The image contains the legal-case database. Confirm you have the right to
  redistribute that dataset before publishing or sending the image.
- Because `Collections` is Git-ignored, cloning the source repository alone
  does not provide the data needed to build this image. Obtain the database
  separately or use the image built and shared from a machine that has it.
- The app needs a reachable OpenAI-compatible LLM endpoint and valid model
  credentials to answer search and discussion requests. The image's health
  endpoint can still succeed without those credentials.
