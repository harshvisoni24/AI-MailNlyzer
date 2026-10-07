import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../services/authService";
import { recordAudit } from "../services/auditService";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  roleName: z.enum(["ADMIN", "SECURITY_ANALYST", "INVESTIGATOR", "VIEWER"]).default("VIEWER"),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    await recordAudit({ userId: result.user.id, action: "LOGIN", status: "SUCCESS", ipAddress: req.ip });
    res.cookie("ai_mailnlyzer_token", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    });
    return res.json(result);
  } catch (err) {
    await recordAudit({ action: "LOGIN", status: "FAILURE", ipAddress: req.ip });
    return next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data = registerSchema.parse(req.body);
    const user = await authService.registerUser({ ...data, roleName: "VIEWER" });
    return res.status(201).json(user);
  } catch (err) {
    return next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie("ai_mailnlyzer_token");
  return res.json({ message: "Logged out." });
}

export async function me(req: Request, res: Response) {
  return res.json({ user: req.user });
}
