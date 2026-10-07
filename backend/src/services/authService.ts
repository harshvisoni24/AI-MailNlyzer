import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new AppError("Invalid credentials.", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid credentials.", 401);
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions
  );

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role.name },
  };
}

export async function registerUser(params: {
  email: string;
  password: string;
  fullName: string;
  roleName: "ADMIN" | "SECURITY_ANALYST" | "INVESTIGATOR" | "VIEWER";
}) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) {
    throw new AppError("A user with this email already exists.", 409);
  }
  const roleName = "SECURITY_ANALYST";
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName },
  });

  const passwordHash = await bcrypt.hash(params.password, 12);

  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      fullName: params.fullName,
      roleId: role.id,
    },
  });

  return { id: user.id, email: user.email, fullName: user.fullName, role: role.name };
}
