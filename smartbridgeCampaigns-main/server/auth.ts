import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";
import { UserRole, UserRoles } from "@shared/schema";
import { storage } from "./storage";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: UserRole;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userRole = req.session.userRole;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  if (req.session.userRole !== UserRoles.ADMIN) {
    return res.status(403).json({ error: "Access denied. Admin privileges required." });
  }
  
  next();
}

export function requireCampaignAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const role = req.session.userRole;
  if (role !== UserRoles.ADMIN && role !== UserRoles.ASSOCIATE) {
    return res.status(403).json({ error: "Access denied. Campaign management requires Admin or Associate role." });
  }
  
  next();
}

export function requireAssociateAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const role = req.session.userRole;
  if (role !== UserRoles.ADMIN && role !== UserRoles.ASSOCIATE) {
    return res.status(403).json({ error: "Access denied. This feature requires Admin or Associate role." });
  }
  
  next();
}

export function getSessionUserId(req: Request): string | undefined {
  return req.session?.userId;
}

export function getSessionUserRole(req: Request): UserRole | undefined {
  return req.session?.userRole;
}
