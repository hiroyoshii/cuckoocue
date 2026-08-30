export type RetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  delayMs?: number;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 8000;
  const delayMs = options.delayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(operation(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

export async function withFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
  options: RetryOptions = {},
): Promise<T> {
  try {
    return await withRetry(operation, options);
  } catch {
    return fallback;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
