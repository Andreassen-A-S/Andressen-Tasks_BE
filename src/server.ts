import express from "express";
import taskRoutes from "./routes/task.routes.ts";

const app = express();
const PORT = 3000;

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not Found" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
