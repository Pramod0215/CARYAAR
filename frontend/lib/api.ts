export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
};

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError("Could not connect to the API. Check that the services are running.", 0);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload
      ) {
        const detail = payload.detail;
        message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail
                  .map((item) =>
                    typeof item === "object" &&
                    item !== null &&
                    "msg" in item &&
                    typeof item.msg === "string"
                      ? item.msg
                      : "Invalid request.",
                  )
                  .join(" ")
              : message;
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApiError(message, response.status);
      }
      throw error;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
