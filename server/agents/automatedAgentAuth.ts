import { randomBytes, timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const tokens = new Map<string, number>();

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function pruneExpiredTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of tokens) {
    if (expiresAt <= now) tokens.delete(token);
  }
}

export function loginAutomatedAgent(email: string, password: string) {
  pruneExpiredTokens();

  const normalizedEmail = email.trim().toLowerCase();
  const emailAllowed = config.automatedAgentEmails.includes(normalizedEmail);
  const passwordAllowed =
    Boolean(config.automatedAgentPassword) &&
    safeEqual(password, config.automatedAgentPassword);

  if (!emailAllowed || !passwordAllowed) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, expiresAt);

  return {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function requireAutomatedAgentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  pruneExpiredTokens();

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token || !tokens.has(token)) {
    return res.status(401).json({
      success: false,
      error: "Automated Agent login required",
    });
  }

  next();
}
