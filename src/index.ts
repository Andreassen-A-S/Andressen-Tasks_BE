import type { Task } from "./types/task";
import { TaskPriority } from "./types/taskPriority";
import { TaskStatus } from "./types/taskStatus";
import { tasksDummyData } from "../misc/taskDummyData";

const tasks: Task[] = tasksDummyData;

const server = Bun.serve({
  routes: {
    // Static routes
    "/api/status": new Response("OK"),

    "/api/tasks": {
      GET: () => Response.json(tasks),
      POST: async (req) => {
        try {
          const body = await req.json();
          const newTask: Task = {
            id: crypto.randomUUID(),
            title: "new Task",
            priority: TaskPriority.MEDIUM,
            status: TaskStatus.PENDING,
            deadline: new Date(),
            ...body,
          };
          tasks.push(newTask);
          return Response.json(newTask, { status: 201 });
        } catch (error) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      },
    },

    // Per-HTTP method handlers
    "/api/task/:id": {
      GET: (req) => {
        const task = tasks.find((t) => t.id === req.params.id);
        if (!task)
          return Response.json({ error: "Task not found" }, { status: 404 });
        return Response.json(task);
      },
      PUT: async (req) => {
        try {
          const task = tasks.find((t) => t.id === req.params.id);
          if (!task)
            return Response.json({ error: "Task not found" }, { status: 404 });

          const body = await req.json();
          Object.assign(task, body);
          return Response.json(task);
        } catch (error) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      },
      DELETE: (req) => {
        const index = tasks.findIndex((t) => t.id === req.params.id);
        if (index === -1)
          return Response.json({ error: "Task not found" }, { status: 404 });
        tasks.splice(index, 1);
        return new Response(null, { status: 204 });
      },
    },

    // Wildcard route for all routes that start with "/api/" and aren't otherwise matched
    "/api/*": Response.json({ message: "Not found" }, { status: 404 }),
  },

  // // Dynamic routes
  // "/users/:id": (req) => {
  //   return new Response(`Hello User ${req.params.id}!`);
  // },

  // Redirect from /blog/hello to /blog/hello/world
  // "/blog/hello": Response.redirect("/blog/hello/world"),

  // Serve a file by lazily loading it into memory
  // "/favicon.ico": Bun.file("./favicon.ico"),

  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
  // (optional) fallback for unmatched routes:
  // Required if Bun's version < 1.2.3
});

console.log(`Server running at ${server.url}`);
