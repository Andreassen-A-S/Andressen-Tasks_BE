import express from "express";
import cors from "cors";
import taskRoutes from "./routes/task.routes.ts";
import userRoutes from "./routes/user.routes.ts";

const app = express();
const PORT = process.env.PORT;

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // Allow cookies if needed
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/api/status", (req, res) => {
  res.send("OK");
});

app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not Found" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
