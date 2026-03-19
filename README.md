# Andreassen-Tasks_BE

This is a backend service for managing tasks, built with the Bun runtime and Prisma ORM connected to a MySQL database.

to run Prisma migrations inside of the Docker container, use the following command (recommended):

```bash
docker compose exec backend bunx --bun prisma migrate dev
```

to populate the database with seed data, use the following command:

```bash
docker compose exec backend bun run prisma/seed/populateDB.ts
```

## Deployment

The BE is designed to be deployed using Docker. It requires a parent docker-compose file to set up the database, backend and frontend together on the same network.

it is deployed on a digital ocean droplet using docker compose. For pulling the latest changes, you can use the following command:

```bash
docker compose -f compose.prod.yaml --env-file .env pull backend
```

and for building and restarting the container, you can use:

```bash
docker compose -f compose.prod.yaml --env-file .env up -d --build
```

## Local development

for local development, you can use the provided `compose.yaml` which includes the BE and a MySQL database.
