export type LogContext = {
  requestId?: string;
  taskId?: string;
  organizationId?: string;
  repositoryId?: string;
};

export type LogEntry = {
  level: "info" | "error";
  message: string;
  request_id?: string;
  task_id?: string;
  organization_id?: string;
  repository_id?: string;
};

function createLogEntry(
  level: LogEntry["level"],
  message: string,
  context: LogContext
): LogEntry {
  return {
    level,
    message,
    request_id: context.requestId,
    task_id: context.taskId,
    organization_id: context.organizationId,
    repository_id: context.repositoryId,
  };
}

export function createLogger(context: LogContext = {}) {
  return {
    info(message: string): LogEntry {
      return createLogEntry("info", message, context);
    },
    error(message: string): LogEntry {
      return createLogEntry("error", message, context);
    },
  };
}
