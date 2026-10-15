export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong while analyzing routes. Please try again.';
}
