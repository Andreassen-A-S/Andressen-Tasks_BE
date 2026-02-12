import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  isBefore,
} from "date-fns";
import { prisma } from "../db/prisma";
import * as templateRepository from "../repositories/templateRepository";
import {
  RecurrenceFrequency,
  TaskEventType,
  TaskStatus,
  type Prisma,
} from "../generated/prisma/client";

export class RecurringTaskService {
  /**
   * Create a new recurring template and generate initial instances
   */
  async createTemplate(data: Prisma.RecurringTaskTemplateCreateInput) {
    const template = await templateRepository.createTemplate(data);

    // Generate first 12 instances
    await this.generateInstances(template.id, 12);

    // Log event - get first task if it exists
    const firstTask = await prisma.task.findFirst({
      where: { recurring_template_id: template.id },
    });

    if (firstTask) {
      await prisma.taskEvent.create({
        data: {
          task_id: firstTask.task_id,
          actor_id: template.created_by,
          type: TaskEventType.RECURRING_TEMPLATE_CREATED,
          message: `Created recurring template: ${template.title}`,
        },
      });
    }

    return template;
  }

  /**
   * Get template by ID with relations
   */
  async getTemplateById(templateId: string) {
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
   * Get all active templates
   */
  async getActiveTemplates() {
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
   */
  async setDefaultAssignees(templateId: string, userIds: string[]) {
    // Validate that all user IDs exist
    if (userIds.length > 0) {
      const existingUsers = await prisma.user.findMany({
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
    await prisma.recurringTaskTemplateAssignee.deleteMany({
      where: { template_id: templateId },
    });

    // Create new assignees
    if (userIds.length > 0) {
      await prisma.recurringTaskTemplateAssignee.createMany({
        data: userIds.map((userId) => ({
          template_id: templateId,
          user_id: userId,
        })),
        skipDuplicates: true, // Skip if somehow a duplicate exists
      });
    }
  }

  /**
   * Delete template and all its instances
   */
  async deleteTemplate(templateId: string) {
    // Cascade will handle deleting instances and assignees
    return prisma.recurringTaskTemplate.delete({
      where: { id: templateId },
    });
  }

  /**
   * Generate task instances for the next N periods
   */
  async generateInstances(templateId: string, count: number = 12) {
    const template = await templateRepository.getTemplateById(templateId);

    if (!template || !template.is_active) {
      return;
    }

    // Get existing instances
    const existingInstances = await prisma.task.findMany({
      where: { recurring_template_id: templateId },
      orderBy: { occurrence_date: "desc" },
    });

    // Find the last occurrence date, or use start_date
    const lastOccurrence =
      existingInstances[0]?.occurrence_date || template.start_date;

    // Calculate next occurrence dates
    const occurrences = this.calculateOccurrences(
      template,
      lastOccurrence,
      count,
    );

    // Create task instances
    for (const occurrenceDate of occurrences) {
      // Check if instance already exists
      const exists = existingInstances.some(
        (t) => t.occurrence_date?.getTime() === occurrenceDate.getTime(),
      );

      if (!exists) {
        await this.createTaskInstance(template, occurrenceDate);
      }
    }
  }

  /**
   * Calculate next occurrence dates based on recurrence rule
   */
  private calculateOccurrences(
    template: any,
    fromDate: Date,
    count: number,
  ): Date[] {
    const occurrences: Date[] = [];
    let currentDate = startOfDay(fromDate);

    while (occurrences.length < count) {
      currentDate = this.getNextOccurrence(template, currentDate);

      // Stop if we've passed the end_date
      if (template.end_date && isBefore(template.end_date, currentDate)) {
        break;
      }

      occurrences.push(currentDate);
    }

    return occurrences;
  }

  /**
   * Get the next occurrence date based on frequency
   */
  private getNextOccurrence(template: any, fromDate: Date): Date {
    const { frequency, interval } = template;

    switch (frequency) {
      case RecurrenceFrequency.DAILY:
        return addDays(fromDate, interval);
      case RecurrenceFrequency.WEEKLY:
        return this.getNextWeeklyOccurrence(template, fromDate);
      case RecurrenceFrequency.MONTHLY:
        return this.getNextMonthlyOccurrence(template, fromDate);
      case RecurrenceFrequency.YEARLY:
        return addYears(fromDate, interval);
      default:
        return addDays(fromDate, 1);
    }
  }

  /**
   * Handle weekly recurrence with specific days
   */
  private getNextWeeklyOccurrence(template: any, fromDate: Date): Date {
    const daysOfWeek = template.days_of_week as number[] | null;

    if (!daysOfWeek || daysOfWeek.length === 0) {
      // Default: same day of week, N weeks later
      return addWeeks(fromDate, template.interval);
    }

    // Find next matching day
    let nextDate = addDays(fromDate, 1);
    const maxIterations = 7 * template.interval;

    for (let i = 0; i < maxIterations; i++) {
      const dayOfWeek = nextDate.getDay();
      if (daysOfWeek.includes(dayOfWeek)) {
        return nextDate;
      }
      nextDate = addDays(nextDate, 1);
    }

    return addWeeks(fromDate, template.interval);
  }

  /**
   * Handle monthly recurrence
   */
  private getNextMonthlyOccurrence(template: any, fromDate: Date): Date {
    const dayOfMonth = template.day_of_month;

    if (!dayOfMonth) {
      // Default: same day of month, N months later
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
   * Create a task instance from template
   */
  private async createTaskInstance(template: any, occurrenceDate: Date) {
    const deadlineDate = new Date(occurrenceDate);
    deadlineDate.setHours(23, 59, 59);

    const task = await prisma.task.create({
      data: {
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
      },
    });

    // Auto-assign default assignees
    const assignees = await prisma.recurringTaskTemplateAssignee.findMany({
      where: { template_id: template.id },
    });

    for (const assignee of assignees) {
      await prisma.taskAssignment.create({
        data: {
          task_id: task.task_id,
          user_id: assignee.user_id,
        },
      });
    }

    // Log event
    await prisma.taskEvent.create({
      data: {
        task_id: task.task_id,
        actor_id: template.created_by,
        type: TaskEventType.RECURRING_INSTANCE_GENERATED,
        message: `Generated instance for ${occurrenceDate.toISOString().split("T")[0]}`,
      },
    });

    return task;
  }

  /**
   * Update template and regenerate future instances
   */
  async updateTemplate(
    templateId: string,
    updates: Prisma.RecurringTaskTemplateUpdateInput,
  ) {
    const template = await templateRepository.updateTemplate(
      templateId,
      updates,
    );

    // Regenerate future instances if recurrence settings changed
    if (
      updates.frequency ||
      updates.interval ||
      updates.days_of_week ||
      updates.day_of_month ||
      updates.start_date ||
      updates.end_date
    ) {
      await this.regenerateFutureInstances(templateId);
    }

    // Log event
    const firstTask = await prisma.task.findFirst({
      where: { recurring_template_id: templateId },
    });

    if (firstTask) {
      await prisma.taskEvent.create({
        data: {
          task_id: firstTask.task_id,
          actor_id: template.created_by,
          type: TaskEventType.RECURRING_TEMPLATE_UPDATED,
          message: `Updated recurring template: ${template.title}`,
        },
      });
    }

    return template;
  }

  /**
   * Delete future unstarted instances and regenerate
   */
  private async regenerateFutureInstances(templateId: string) {
    const today = startOfDay(new Date());

    // Delete future PENDING instances that haven't been worked on
    await prisma.task.deleteMany({
      where: {
        recurring_template_id: templateId,
        occurrence_date: { gte: today },
        status: TaskStatus.PENDING,
        current_quantity: 0, // No progress logged
      },
    });

    // Generate new instances
    await this.generateInstances(templateId, 12);
  }

  /**
   * Deactivate template (stops generating new instances)
   */
  async deactivateTemplate(templateId: string) {
    const template = await templateRepository.updateTemplate(templateId, {
      is_active: false,
    });

    // Log event
    const firstTask = await prisma.task.findFirst({
      where: { recurring_template_id: templateId },
    });

    if (firstTask) {
      await prisma.taskEvent.create({
        data: {
          task_id: firstTask.task_id,
          actor_id: template.created_by,
          type: TaskEventType.RECURRING_TEMPLATE_DEACTIVATED,
          message: `Deactivated recurring template: ${template.title}`,
        },
      });
    }

    return template;
  }

  /**
   * Reactivate template and generate instances
   */
  async reactivateTemplate(templateId: string) {
    const template = await templateRepository.updateTemplate(templateId, {
      is_active: true,
    });

    await this.generateInstances(templateId, 12);

    return template;
  }

  /**
   * Get all instances for a template
   */
  async getTemplateInstances(templateId: string) {
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
  async ensureInstanceBuffer(templateId: string, minBuffer: number = 12) {
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
  async ensureAllTemplatesHaveInstances() {
    const activeTemplates = await templateRepository.getActiveTemplates();

    for (const template of activeTemplates) {
      await this.ensureInstanceBuffer(template.id, 12);
    }
  }
}
