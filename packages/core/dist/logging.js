function createLogEntry(level, message, context) {
    return {
        level,
        message,
        request_id: context.requestId,
        task_id: context.taskId,
        organization_id: context.organizationId,
        repository_id: context.repositoryId,
    };
}
export function createLogger(context = {}) {
    return {
        info(message) {
            return createLogEntry("info", message, context);
        },
        error(message) {
            return createLogEntry("error", message, context);
        },
    };
}
