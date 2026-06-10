import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  differenceInWeeks,
  isAfter,
} from "date-fns";
import { appDateKey } from "../utils/dateUtils";
import { prisma } from "../db/prisma";
import * as templateRepository from "../repositories/templateRepository";
import { allocateTaskNumbersForProject } from "../repositories/taskRepository";
import { TemplateNotFoundError, TemplateForbiddenError } from "../errors/domainErrors";
import {
  RecurrenceFrequency,
  TaskEventType,
  TaskStatus,
  UserRole,
  type Prisma,
  type RecurringTaskTemplate,
} from "../generated/prisma/client";
import type { RequestContext } from "../types/requestContext";
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
} from "../types/template";

// Type for template with relations
type TemplateWithRelations = Prisma.RecurringTaskTemplateGetPayload<{
  include: {
    goal: true;
    creator: true;
    default_assignees: {
      include: { user: true };
    };
  };
}>;

type TemplateResponse = TemplateWithRelations;

export class RecurringTaskService {
  /**
   * Create a new recurring template and generate initial instances
   * This is fully atomic - all operations succeed or all fail together
   */
  async createTemplate(
    ctx: RequestContext,
    data: CreateTemplateInput,
    effectiveOrgId: string | null = null,
  ): Promise<RecurringTaskTemplate> {
    const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
    if (!isAdmin) throw new TemplateForbiddenError();
    return await prisma.$transaction(async (tx) => {
      // 1. Create template + validate project org + validate assignees (all in repo)
      const template = await templateRepository.createTemplateWithAssignees(
        tx,
        data,
        effectiveOrgId,
      );

      // 2. Generate initial 6 instances
      await this.generateInstancesInTransaction(tx, template.id, 6);

      // 3. Log creation event
      const firstTask = await tx.task.findFirst({
        where: { recurring_template_id: template.id },
      });

      if (firstTask) {
        await tx.taskEvent.create({
          data: {
            task_id: firstTask.task_id,
            actor_id: template.created_by,
            type: TaskEventType.RECURRING_TEMPLATE_CREATED,
            message: `Created recurring template: ${template.title}`,
          },
        });
      }

      return template;
    });
  }

  /**
   * Get template by ID with relations
   */
  async getTemplateById(
    templateId: string,
    orgId: string | null = null,
  ): Promise<TemplateResponse | null> {
    const template = await prisma.recurringTaskTemplate.findFirst({
      where: {
        id: templateId,
        ...(orgId ? { project: { organization_id: orgId } } : {}),
      },
      include: {
        goal: true,
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
    return template;
  }

  /**
   * Get all templates
   */
  async getAllTemplates(
    orgId: string | null = null,
  ): Promise<TemplateResponse[]> {
    const templates = await prisma.recurringTaskTemplate.findMany({
      where: orgId ? { project: { organization_id: orgId } } : undefined,
      include: {
        goal: true,
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
    return templates;
  }

  /**
   * Get all active templates (unscoped — used by the scheduler across all orgs)
   */
  async getActiveTemplates(
    orgId: string | null = null,
  ): Promise<TemplateResponse[]> {
    const templates = await prisma.recurringTaskTemplate.findMany({
      where: {
        is_active: true,
        ...(orgId ? { project: { organization_id: orgId } } : {}),
      },
      include: {
        goal: true,
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
    return templates;
  }

  /**
   * Delete template and all its instances
   */
  async deleteTemplate(ctx: RequestContext, templateId: string, effectiveOrgId: string | null = null): Promise<RecurringTaskTemplate> {
    const template = await this.getTemplateById(templateId, effectiveOrgId);
    if (!template) throw new TemplateNotFoundError(templateId);

    const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
    if (!isAdmin && template.created_by !== ctx.actorUserId) throw new TemplateForbiddenError();

    // Cascade will handle deleting instances and assignees
    return prisma.recurringTaskTemplate.delete({
      where: { id: templateId },
    });
  }

  /**
   * Generate task instances for the next N periods
   * Public method - creates its own transaction
   */
  async generateInstances(
    templateId: string,
    count: number = 12,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.generateInstancesInTransaction(tx, templateId, count);
    });
  }

  /**
   * Generate task instances within an existing transaction
   * Private method for use in atomic operations
   */
  private async generateInstancesInTransaction(
    tx: Prisma.TransactionClient,
    templateId: string,
    count: number = 12,
  ): Promise<void> {
    const template = await tx.recurringTaskTemplate.findUnique({
      where: { id: templateId },
      include: { goal: true },
    });

    if (!template || !template.is_active) {
      return;
    }

    // Get existing occurrence dates (only what we need)
    const existingInstances = await tx.task.findMany({
      where: { recurring_template_id: templateId },
      select: { occurrence_date: true },
    });

    // Create efficient Set for O(1) duplicate checking
    const existingDates = new Set(
      existingInstances
        .map((t) => t.occurrence_date?.getTime())
        .filter((t): t is number => t !== undefined && t !== null),
    );

    // Calculate next occurrences (starting from start_date, skipping existing)
    const occurrences = this.calculateOccurrences(
      template,
      count,
      existingDates,
    );

    if (occurrences.length === 0) {
      return;
    }

    // Allocate a contiguous block of numbers for all occurrences in one write
    const numbers = await allocateTaskNumbersForProject(
      tx,
      template.project_id,
      occurrences.length,
    );

    // Batch create all instances
    const taskData = occurrences.map((occurrenceDate, i) => {
      return {
        number: numbers[i]!,
        title: template.title,
        description: template.description || "",
        priority: template.priority,
        status: TaskStatus.PENDING,
        deadline: occurrenceDate,
        start_date: occurrenceDate,
        occurrence_date: occurrenceDate,
        created_by: template.created_by,
        project_id: template.project_id,
        recurring_template_id: template.id,
      };
    });

    // Batch create tasks
    await tx.task.createMany({ data: taskData });

    // Get the newly created tasks
    const createdTasks = await tx.task.findMany({
      where: {
        recurring_template_id: templateId,
        occurrence_date: { in: occurrences },
      },
    });

    // Get assignees
    const assignees = await tx.recurringTaskTemplateAssignee.findMany({
      where: { template_id: templateId },
    });

    // Batch create assignments
    if (assignees.length > 0) {
      const assignmentData = createdTasks.flatMap((task) =>
        assignees.map((assignee) => ({
          task_id: task.task_id,
          user_id: assignee.user_id,
        })),
      );

      await tx.taskAssignment.createMany({ data: assignmentData });
    }

    // Create goals for tasks spawned from templates with a goal
    if (template.goal) {
      for (const task of createdTasks) {
        const goal = await tx.taskGoal.create({
          data: {
            task_id: task.task_id,
            target_quantity: template.goal!.target_quantity,
            unit: template.goal!.unit,
            current_quantity: template.goal!.current_quantity,
          },
        });
        await tx.task.update({
          where: { task_id: task.task_id },
          data: { current_goal_id: goal.goal_id },
        });
      }
    }

    // Batch create events
    const eventData = createdTasks.map((task) => ({
      task_id: task.task_id,
      actor_id: template.created_by,
      type: TaskEventType.RECURRING_INSTANCE_GENERATED,
      message: `Generated instance for ${task.occurrence_date?.toISOString().split("T")[0]}`,
    }));

    await tx.taskEvent.createMany({ data: eventData });
  }

  /**
   * Calculate next occurrence dates based on recurrence rule
   */
  private calculateOccurrences(
    template: RecurringTaskTemplate,
    count: number,
    existingDates: Set<number>,
  ): Date[] {
    const occurrences: Date[] = [];
    let currentDate = template.start_date; // @db.Date — already UTC midnight
    const endDate = template.end_date ?? null; // @db.Date — already UTC midnight

    // Safety limit to prevent infinite loops
    const maxIterations = count * 100;
    let iterations = 0;

    // Check if start_date itself matches the recurrence pattern
    if (this.dateMatchesPattern(template, currentDate)) {
      if (!endDate || !isAfter(currentDate, endDate)) {
        if (!existingDates.has(currentDate.getTime())) {
          occurrences.push(currentDate);
        }
      }
    }

    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;

      // Advance to next occurrence
      currentDate = this.getNextOccurrence(template, currentDate);

      // Check if past end_date
      if (endDate && isAfter(currentDate, endDate)) {
        break;
      }

      // Skip if duplicate
      if (!existingDates.has(currentDate.getTime())) {
        occurrences.push(currentDate);
      }
    }

    return occurrences;
  }

  /**
   * Check if a date matches the recurrence pattern
   */
  private dateMatchesPattern(
    template: RecurringTaskTemplate,
    date: Date,
  ): boolean {
    switch (template.frequency) {
      case RecurrenceFrequency.DAILY:
        return true;

      case RecurrenceFrequency.WEEKLY: {
        const daysOfWeek = template.days_of_week as number[] | null;
        if (!daysOfWeek || daysOfWeek.length === 0) {
          return true;
        }
        const dayOfWeek = date.getUTCDay();
        return daysOfWeek.includes(dayOfWeek);
      }

      case RecurrenceFrequency.MONTHLY: {
        const dayOfMonth = template.day_of_month;
        if (!dayOfMonth) {
          return true;
        }
        return date.getUTCDate() === dayOfMonth;
      }

      case RecurrenceFrequency.YEARLY:
        return true;

      default:
        return false;
    }
  }

  /**
   * Get next occurrence date based on frequency
   */
  private getNextOccurrence(
    template: RecurringTaskTemplate,
    fromDate: Date,
  ): Date {
    switch (template.frequency) {
      case RecurrenceFrequency.DAILY:
        return addDays(fromDate, template.interval);

      case RecurrenceFrequency.WEEKLY:
        return this.getNextWeeklyOccurrence(template, fromDate);

      case RecurrenceFrequency.MONTHLY:
        return this.getNextMonthlyOccurrence(template, fromDate);

      case RecurrenceFrequency.YEARLY:
        return addYears(fromDate, template.interval);

      default:
        throw new Error(`Unknown frequency: ${template.frequency}`);
    }
  }

  /**
   * Handle weekly recurrence with specific days
   */
  private getNextWeeklyOccurrence(
    template: RecurringTaskTemplate,
    fromDate: Date,
  ): Date {
    const daysOfWeek = template.days_of_week as number[] | null;

    if (!daysOfWeek || daysOfWeek.length === 0) {
      return addWeeks(fromDate, template.interval);
    }

    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const currentDayOfWeek = fromDate.getUTCDay();
    const startDate = template.start_date; // @db.Date — already UTC midnight

    // Calculate which week we're in relative to start_date
    const weeksSinceStart = differenceInWeeks(fromDate, startDate);

    // Check if there's a later day in the SAME week (and we're in a valid cycle week)
    if (weeksSinceStart % template.interval === 0) {
      const laterDayInSameWeek = sortedDays.find(
        (day) => day > currentDayOfWeek,
      );

      if (laterDayInSameWeek !== undefined) {
        return addDays(fromDate, laterDayInSameWeek - currentDayOfWeek);
      }
    }

    // Move to next valid cycle week
    const weeksToNextCycle =
      template.interval - (weeksSinceStart % template.interval);
    const nextCycleWeek = addWeeks(fromDate, weeksToNextCycle);

    // Find the first target day in that week
    const nextCycleDayOfWeek = nextCycleWeek.getUTCDay();
    const firstTargetDay = sortedDays[0]!;

    let daysToTarget = firstTargetDay - nextCycleDayOfWeek;
    if (daysToTarget < 0) {
      daysToTarget += 7;
    }

    return addDays(nextCycleWeek, daysToTarget);
  }

  /**
   * Handle monthly recurrence
   */
  private getNextMonthlyOccurrence(
    template: RecurringTaskTemplate,
    fromDate: Date,
  ): Date {
    const dayOfMonth = template.day_of_month;

    if (!dayOfMonth) {
      return addMonths(fromDate, template.interval);
    }

    let nextDate = addMonths(fromDate, template.interval);
    const daysInMonth = new Date(
      Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, 0),
    ).getUTCDate();

    // Handle case where day doesn't exist (e.g., Feb 31 -> Feb 28)
    nextDate.setUTCDate(Math.min(dayOfMonth, daysInMonth));

    return nextDate;
  }

  /**
   * Update template and regenerate future instances
   */
  async updateTemplate(
    ctx: RequestContext,
    templateId: string,
    data: UpdateTemplateInput,
    effectiveOrgId: string | null = null,
  ): Promise<RecurringTaskTemplate> {
    const existing = await this.getTemplateById(templateId, effectiveOrgId);
    if (!existing) throw new TemplateNotFoundError(templateId);

    const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
    if (!isAdmin && existing.created_by !== ctx.actorUserId) throw new TemplateForbiddenError();
    return await prisma.$transaction(async (tx) => {
      // Update template + validate project org + validate assignees (all in repo)
      const template = await templateRepository.updateTemplateWithAssignees(
        tx,
        templateId,
        data,
        effectiveOrgId,
      );

      // Regenerate future instances if recurrence settings changed
      if (
        data.frequency !== undefined ||
        data.interval !== undefined ||
        data.days_of_week !== undefined ||
        data.day_of_month !== undefined ||
        data.start_date !== undefined ||
        data.end_date !== undefined
      ) {
        await this.regenerateFutureInstancesInTransaction(tx, templateId);
      }

      // Log event
      const firstTask = await tx.task.findFirst({
        where: { recurring_template_id: templateId },
      });

      if (firstTask) {
        await tx.taskEvent.create({
          data: {
            task_id: firstTask.task_id,
            actor_id: template.created_by,
            type: TaskEventType.RECURRING_TEMPLATE_UPDATED,
            message: `Updated recurring template: ${template.title}`,
          },
        });
      }

      return template;
    });
  }

  /**
   * Delete future unstarted instances and regenerate (within transaction)
   */
  private async regenerateFutureInstancesInTransaction(
    tx: Prisma.TransactionClient,
    templateId: string,
  ): Promise<void> {
    const today = new Date(appDateKey());

    // Delete future PENDING instances that haven't been worked on
    await tx.task.deleteMany({
      where: {
        recurring_template_id: templateId,
        occurrence_date: { gte: today },
        status: TaskStatus.PENDING,
      },
    });

    // Generate new instances
    await this.generateInstancesInTransaction(tx, templateId, 12);
  }

  /**
   * Deactivate template (stops generating new instances)
   */
  async deactivateTemplate(ctx: RequestContext, templateId: string, effectiveOrgId: string | null = null): Promise<RecurringTaskTemplate> {
    const existing = await this.getTemplateById(templateId, effectiveOrgId);
    if (!existing) throw new TemplateNotFoundError(templateId);

    const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
    if (!isAdmin && existing.created_by !== ctx.actorUserId) throw new TemplateForbiddenError();
    return await prisma.$transaction(async (tx) => {
      const template = await templateRepository.updateTemplate(
        templateId,
        { is_active: false },
        tx,
      );

      // Log event
      const firstTask = await tx.task.findFirst({
        where: { recurring_template_id: templateId },
      });

      if (firstTask) {
        await tx.taskEvent.create({
          data: {
            task_id: firstTask.task_id,
            actor_id: template.created_by,
            type: TaskEventType.RECURRING_TEMPLATE_DEACTIVATED,
            message: `Deactivated recurring template: ${template.title}`,
          },
        });
      }

      return template;
    });
  }

  /**
   * Reactivate template and generate instances
   */
  async reactivateTemplate(ctx: RequestContext, templateId: string, effectiveOrgId: string | null = null): Promise<RecurringTaskTemplate> {
    const existing = await this.getTemplateById(templateId, effectiveOrgId);
    if (!existing) throw new TemplateNotFoundError(templateId);

    const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
    if (!isAdmin && existing.created_by !== ctx.actorUserId) throw new TemplateForbiddenError();
    return await prisma.$transaction(async (tx) => {
      const template = await templateRepository.updateTemplate(
        templateId,
        { is_active: true },
        tx,
      );

      // Generate instances
      await this.generateInstancesInTransaction(tx, template.id, 12);

      return template;
    });
  }

  /**
   * Get all instances for a template
   */
  async getTemplateInstances(
    templateId: string,
    orgId: string | null = null,
  ): Promise<
    (Omit<
      Prisma.TaskGetPayload<{
        include: {
          assignments: {
            include: { user: true };
          };
          goals: true;
        };
      }>,
      "goals"
    > & { goal: Prisma.TaskGoalGetPayload<{}> | null })[]
  > {
    if (orgId) {
      const template = await prisma.recurringTaskTemplate.findFirst({
        where: { id: templateId, project: { organization_id: orgId } },
        select: { id: true },
      });
      if (!template) throw new TemplateNotFoundError(templateId);
    }

    const tasks = await prisma.task.findMany({
      where: { recurring_template_id: templateId },
      orderBy: { occurrence_date: "asc" },
      include: {
        assignments: {
          include: { user: true },
        },
        current_goal: true,
      },
    });
    return tasks.map(({ current_goal, ...task }) => ({
      ...task,
      goal: current_goal ?? null,
    }));
  }

  /**
   * Check if instance generation is needed and top up
   * Called by cron job or after task completion
   */
  async ensureInstanceBuffer(
    templateId: string,
    minBuffer: number = 12,
  ): Promise<void> {
    const template = await templateRepository.getTemplateById(templateId);

    if (!template || !template.is_active) {
      return;
    }

    const today = new Date(appDateKey());
    const futureInstances = await prisma.task.count({
      where: {
        recurring_template_id: templateId,
        occurrence_date: { gte: today },
      },
    });

    if (futureInstances < minBuffer) {
      const needed = minBuffer - futureInstances;
      await this.generateInstances(templateId, needed);
    }
  }

  /**
   * Ensure all active templates have enough future instances
   * Called by cron job
   */
  async ensureAllTemplatesHaveInstances(): Promise<void> {
    const activeTemplates = await templateRepository.getActiveTemplates();

    for (const template of activeTemplates) {
      await this.ensureInstanceBuffer(template.id, 12);
    }
  }
}
