import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { StatsService } from "../src/services/statService";
import * as statRepo from "../src/repositories/statRepository";

afterEach(() => {
  mock.restore();
});

describe("StatsService.getUserStats", () => {
  test("returns zeroed payload with weekly stats when user has no workload", async () => {
    const service = new StatsService();

    spyOn(statRepo, "getWorkloadDistribution").mockResolvedValue([
      {
        user_id: "u2",
        name: "User 2",
        email: "u2@test.com",
        assigned_tasks: 5,
        completed_tasks: 3,
      },
    ] as never);
    spyOn(statRepo, "getUserOverdueTasks").mockResolvedValue(0 as never);
    spyOn(statRepo, "getUserWeeklyStats").mockResolvedValue({
      assigned_tasks: 2,
      completed_tasks: 1,
      completion_rate: 50,
    } as never);

    const result = await service.getUserStats("u1");

    expect(result).toEqual({
      user_id: "u1",
      assigned_tasks: 0,
      completed_tasks: 0,
      completion_rate: 0,
      overdue_tasks: 0,
      weekly_stats: {
        assigned_tasks: 2,
        completed_tasks: 1,
        completion_rate: 50,
      },
    });
  });

  test("returns merged workload + weekly stats for existing user", async () => {
    const service = new StatsService();

    spyOn(statRepo, "getWorkloadDistribution").mockResolvedValue([
      {
        user_id: "u1",
        name: "User 1",
        email: "u1@test.com",
        assigned_tasks: 8,
        completed_tasks: 6,
      },
    ] as never);
    spyOn(statRepo, "getUserOverdueTasks").mockResolvedValue(2 as never);
    spyOn(statRepo, "getUserWeeklyStats").mockResolvedValue({
      assigned_tasks: 3,
      completed_tasks: 2,
      completion_rate: 67,
    } as never);

    const result = await service.getUserStats("u1");

    expect(result).toEqual({
      user_id: "u1",
      name: "User 1",
      email: "u1@test.com",
      assigned_tasks: 8,
      completed_tasks: 6,
      overdue_tasks: 2,
      completion_rate: 75,
      weekly_stats: {
        assigned_tasks: 3,
        completed_tasks: 2,
        completion_rate: 67,
      },
    });
  });
});

describe("StatsService validations", () => {
  test("getTopPerformers throws for invalid limit", async () => {
    const service = new StatsService();

    await expect(service.getTopPerformers(0)).rejects.toThrow(
      "Limit must be between 1 and 20",
    );
  });

  test("getTaskTrends throws for invalid day range", async () => {
    const service = new StatsService();

    await expect(service.getTaskTrends(91)).rejects.toThrow(
      "Days must be between 1 and 90",
    );
  });
});
