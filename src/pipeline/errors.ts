export class PipelineError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}
