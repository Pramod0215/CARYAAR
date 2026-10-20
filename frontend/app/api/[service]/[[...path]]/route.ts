import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "caryaar_access_token";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

type Service = "auth" | "cars" | "feedback" | "support";
type Context = { params: Promise<{ service: string; path?: string[] }> };

const serviceBases: Record<Service, string> = {
  auth: process.env.AUTH_API_URL ?? "http://localhost:8001",
  cars: process.env.CAR_API_URL ?? "http://localhost:8002",
  feedback: process.env.FEEDBACK_API_URL ?? "http://localhost:8003",
  support: process.env.SUPPORT_API_URL ?? "http://localhost:8004",
};
const servicePrefixes: Record<Service, string> = {
  auth: "/api/v1/auth",
  cars: "/api/v1/cars",
  feedback: "/api/v1/feedback",
  support: "/api/v1/support",
};

function isAllowedRoute(service: Service, method: string, path: string[]) {
  const route = path.join("/");
  if (service === "auth") {
    return (
      (method === "POST" && ["login", "register", "logout"].includes(route)) ||
      (method === "GET" && route === "me")
    );
  }
  if (service === "cars") {
    if (path[0] === "uploads" && path.length === 2) {
      return method === "GET" && UPLOAD_PATTERN.test(path[1]);
    }
    return (
      (path.length === 0 && (method === "GET" || method === "POST")) ||
      (path.length === 1 &&
        ((method === "GET" && path[0] === "mine") ||
          (UUID_PATTERN.test(path[0]) &&
            (method === "GET" || method === "PUT" || method === "DELETE")))) ||
      (path.length === 2 && UUID_PATTERN.test(path[0]) && path[1] === "image" && method === "POST")
    );
  }
  return (
    (service === "feedback" && method === "POST" && route === "") ||
    (service === "support" &&
      method === "POST" &&
      ["chat", "tickets"].includes(route))
  );
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status });
}

async function proxy(request: NextRequest, context: Context) {
  const { service: rawService, path = [] } = await context.params;
  if (!Object.hasOwn(serviceBases, rawService)) {
    return errorResponse("Unknown API service.", 404);
  }
  const service = rawService as Service;
  if (!isAllowedRoute(service, request.method, path)) {
    return errorResponse("API route not found.", 404);
  }

  if (service === "auth" && path[0] === "logout") {
    const response = NextResponse.json({ message: "Signed out." });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (service === "auth" && path[0] === "me" && !token) {
    return errorResponse("Not signed in.", 401);
  }

  const isImage = service === "cars" && path[0] === "uploads";
  const encodedPath = path.map(encodeURIComponent).join("/");
  const baseUrl = serviceBases[service].replace(/\/+$/, "");
  const target = new URL(
    isImage
      ? `/uploads/${encodedPath.slice("uploads/".length)}`
      : `${servicePrefixes[service]}${encodedPath ? `/${encodedPath}` : ""}`,
    baseUrl,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({ Accept: "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
        return errorResponse("Image upload requests must be 6 MB or smaller.", 413);
      }
      try {
        body = await request.formData();
      } catch (error) {
        console.error("CarYAAR API received an invalid multipart form:", error);
        return errorResponse("The image upload form could not be read.", 400);
      }
    } else {
      body = await request.text();
      if (contentType) headers.set("Content-Type", contentType);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    console.error(`CarYAAR ${service} API request failed:`, error);
    return errorResponse(`${service} service is unavailable. Please try again shortly.`, 502);
  }

  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const responseBody = upstream.status === 204 ? null : upstream.body;

  if (
    service === "auth" &&
    (path[0] === "login" || path[0] === "register") &&
    upstream.ok
  ) {
    try {
      const result: unknown = await upstream.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("access_token" in result) ||
        typeof result.access_token !== "string" ||
        !("expires_in" in result) ||
        typeof result.expires_in !== "number" ||
        !Number.isSafeInteger(result.expires_in) ||
        result.expires_in < 1 ||
        !("user" in result)
      ) {
        return errorResponse("The authentication service returned an invalid response.", 502);
      }
      const response = NextResponse.json({ user: result.user }, { status: upstream.status });
      response.cookies.set(SESSION_COOKIE, result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: result.expires_in,
      });
      return response;
    } catch (error) {
      console.error("CarYAAR authentication response could not be read:", error);
      return errorResponse("The authentication service returned an invalid response.", 502);
    }
  }

  return new Response(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
