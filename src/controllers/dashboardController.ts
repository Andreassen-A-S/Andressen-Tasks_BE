import type { RequestHandler } from "express";
import { getRequestContext } from "../types/requestContext";
import * as dashboardService from "../services/dashboardService";

export const getDashboard: RequestHandler = async (req, res) => {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const data = await dashboardService.getDashboardData(ctx);
  if (!data) return res.status(403).json({ success: false, error: "Forbidden" });

  return res.json({ success: true, data });
};
