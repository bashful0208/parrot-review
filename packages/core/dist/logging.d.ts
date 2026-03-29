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
export declare function createLogger(context?: LogContext): {
    info(message: string): LogEntry;
    error(message: string): LogEntry;
};
