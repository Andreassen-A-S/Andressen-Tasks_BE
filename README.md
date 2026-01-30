# Andressen-Tasks_BE

This is a backend service for managing tasks, built with the Bun runtime and Prisma ORM connected to a MySQL database.

to run Prisma migrations inside of the Docker container, use the following command (recommended):

```bash
docker compose exec backend bunx --bun prisma migrate dev
```

to populate the database with seed data, use the following command:

```bash
docker compose exec backend bun run prisma/seed/populateDB.ts
```
