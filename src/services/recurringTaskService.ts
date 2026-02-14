import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  differenceInWeeks,
  isAfter,
} from "date-fns";
import { prisma } from "../db/prisma";
import * as templateRepository from "../repositories/templateRepository";
import {
  RecurrenceFrequency,
  TaskEventType,
  TaskStatus,
  type Prisma,
  type RecurringTaskTemplate,
} from "../generated/prisma/client";

// Type for template with relations
type TemplateWithRelations = Prisma.RecurringTaskTemplateGetPayload<{
  include: {
    creator: true;
    default_assignees: {
      include: { user: true };
    };
  };
}>;

export class RecurringTaskService {
  /**
   * Create a new recurring template and generate initial instances
   * This is fully atomic - all operations succeed or all fail together
   */
  async createTemplate(
    data: Prisma.RecurringTaskTemplateCreateInput,
    assigneeUserIds?: string[],
  ): Promise<RecurringTaskTemplate> {
    return await prisma.$transaction(async (tx) => {
      // 1. Create the template using transaction client
      const template = await templateRepository.createTemplate(data, tx);

      // 2. Set default assignees if provided (within same transaction)
      if (assigneeUserIds && assigneeUserIds.length > 0) {
        await this.setDefaultAssigneesInTransaction(
          tx,
          template.id,
          assigneeUserIds,
        );
      }

      // 3. Generate initial 12 instances (within same transaction)
      await this.generateInstancesInTransaction(tx, template.id, 12);

      // 4. Log creation event (within same transaction)
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
  ): Promise<TemplateWithRelations | null> {
    return prisma.recurringTaskTemplate.findUnique({
      where: { id: templateId },
      include: {
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<TemplateWithRelations[]> {
    return prisma.recurringTaskTemplate.findMany({
      include: {
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
  }

  /**
   * Get all active templates
   */
  async getActiveTemplates(): Promise<TemplateWithRelations[]> {
    return prisma.recurringTaskTemplate.findMany({
      where: { is_active: true },
      include: {
        creator: true,
        default_assignees: {
          include: { user: true },
        },
      },
    });
  }

  /**
   * Set default assignees for a template
   * Public method - creates its own transaction
   */
  async setDefaultAssignees(
    templateId: string,
    userIds: string[],
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.setDefaultAssigneesInTransaction(tx, templateId, userIds);
    });
  }

  /**
   * Set default assignees within an existing transaction
   * Private method for use in atomic operations
   */
  private async setDefaultAssigneesInTransaction(
    tx: Prisma.TransactionClient,
    templateId: string,
    userIds: string[],
  ): Promise<void> {
    // Validate that all user IDs exist
    if (userIds.length > 0) {
      const existingUsers = await tx.user.findMany({
        where: {
          user_id: {
            in: userIds,
          },
        },
        select: { user_id: true },
      });

      const existingUserIds = existingUsers.map((u) => u.user_id);
      const invalidUserIds = userIds.filter(
        (id) => !existingUserIds.includes(id),
      );

      if (invalidUserIds.length > 0) {
        throw new Error(
          `Invalid user IDs: ${invalidUserIds.join(", ")}. These users do not exist.`,
        );
      }
    }

    // Delete existing assignees
    await tx.recurringTaskTemplateAssignee.deleteMany({
      where: { template_id: templateId },
    });

    // Create new assignees
    if (userIds.length > 0) {
      await tx.recurringTaskTemplateAssignee.createMany({
        data: userIds.map((userId) => ({
          template_id: templateId,
          user_id: userId,
        })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * Delete template and all its instances
   */
  async deleteTemplate(templateId: string): Promise<RecurringTaskTemplate> {
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

    // Batch create all instances
    const taskData = occurrences.map((occurrenceDate) => {
      // Create deadline as a Date object
      const deadlineDate = new Date(occurrenceDate);
      deadlineDate.setHours(23, 59, 59, 999);

      return {
        title: template.title,
        description: template.description || "",
        priority: template.priority,
        status: TaskStatus.PENDING,
        deadline: deadlineDate,
        scheduled_date: occurrenceDate,
        occurrence_date: occurrenceDate,
        unit: template.unit,
        goal_type: template.goal_type,
        target_quantity: template.target_quantity,
        current_quantity: 0,
        created_by: template.created_by,
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
    let currentDate = startOfDay(template.start_date);
    const endDate = template.end_date ? startOfDay(template.end_date) : null;

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
        const dayOfWeek = date.getDay();
        return daysOfWeek.includes(dayOfWeek);
      }

      case RecurrenceFrequency.MONTHLY: {
        const dayOfMonth = template.day_of_month;
        if (!dayOfMonth) {
          return true;
        }
        return date.getDate() === dayOfMonth;
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
    const currentDayOfWeek = fromDate.getDay();
    const startDate = startOfDay(template.start_date);

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
    const nextCycleDayOfWeek = nextCycleWeek.getDay();
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
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0,
    ).getDate();

    // Handle case where day doesn't exist (e.g., Feb 31 -> Feb 28)
    nextDate.setDate(Math.min(dayOfMonth, daysInMonth));

    return nextDate;
  }

  /**
   * Update template and regenerate future instances
   */
  async updateTemplate(
    templateId: string,
    updates: Prisma.RecurringTaskTemplateUpdateInput,
    assigneeUserIds?: string[],
  ): Promise<RecurringTaskTemplate> {
    return await prisma.$transaction(async (tx) => {
      // Update the template
      const template = await templateRepository.updateTemplate(
        templateId,
        updates,
        tx,
      );

      // Update assignees if provided
      if (assigneeUserIds !== undefined) {
        await this.setDefaultAssigneesInTransaction(
          tx,
          templateId,
          assigneeUserIds,
        );
      }

      // Regenerate future instances if recurrence settings changed
      if (
        updates.frequency ||
        updates.interval ||
        updates.days_of_week ||
        updates.day_of_month ||
        updates.start_date ||
        updates.end_date
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
    const today = startOfDay(new Date());

    // Delete future PENDING instances that haven't been worked on
    await tx.task.deleteMany({
      where: {
        recurring_template_id: templateId,
        occurrence_date: { gte: today },
        status: TaskStatus.PENDING,
        current_quantity: 0,
      },
    });

    // Generate new instances
    await this.generateInstancesInTransaction(tx, templateId, 12);
  }

  /**
   * Deactivate template (stops generating new instances)
   */
  async deactivateTemplate(templateId: string): Promise<RecurringTaskTemplate> {
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
  async reactivateTemplate(templateId: string): Promise<RecurringTaskTemplate> {
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
  async getTemplateInstances(templateId: string): Promise<
    Prisma.TaskGetPayload<{
      include: {
        assignments: {
          include: { user: true };
        };
      };
    }>[]
  > {
    return prisma.task.findMany({
      where: { recurring_template_id: templateId },
      orderBy: { occurrence_date: "asc" },
      include: {
        assignments: {
          include: { user: true },
        },
      },
    });
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

    const today = startOfDay(new Date());
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
