import express from "express";
import cors from "cors";
import os from "os";

import taskRoutes from "./routes/task.routes";
import userRoutes from "./routes/user.routes";
import assignmentRoutes from "./routes/assignment.routes";
import authRoutes from "./routes/auth.routes";
import commentRoutes from "./routes/comment.routes";
import taskEventRoutes from "./routes/taskEvent.routes";
import templateRoutes from "./routes/template.routes";
import statRoutes from "./routes/stat.routes";

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const allowedOrigins = (
  process.env.FRONTEND_URL ?? "http://localhost:9000,http://127.0.0.1:9000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow tools like curl/postman in non-production (no Origin header)
      if (!origin) return cb(null, process.env.NODE_ENV !== "production");

      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: false, // Bearer tokens in Authorization header
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));

// Logging: status + duration
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${res.statusCode} ${req.method} ${req.path} - ${ms}ms`);
  });
  next();
});

// Health check
app.get("/api/status", (_req, res) => {
  res.status(200).send("OK");
});

// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/task-events", taskEventRoutes);
app.use("/api/recurring-templates", templateRoutes);
app.use("/api/stats", statRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not Found" });
});

// Error handler (includes CORS errors)
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  },
);

function getLanIp(): string | null {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

app.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIp();
  console.log(`Server running on port ${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  if (lanIp) console.log(`Network: http://${lanIp}:${PORT}`);
});
