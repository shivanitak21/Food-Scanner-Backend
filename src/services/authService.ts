import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';
import { User } from '../models/User';
import { ConflictError, UnauthorizedError, isMongoDuplicate } from '../utils/errors';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export class AuthService {
  async register(input: { name: string; email: string; password: string }): Promise<AuthSession> {
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    try {
      const user = await User.create({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash,
      });
      return { token: signToken(String(user._id)), user: { id: String(user._id), name: user.name, email: user.email } };
    } catch (error) {
      if (isMongoDuplicate(error)) throw new ConflictError('An account with this email already exists.');
      throw error;
    }
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const user = await User.findOne({ email: input.email.trim().toLowerCase() }).select('+passwordHash');
    const passwordHash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const matches = await bcrypt.compare(input.password, passwordHash).catch(() => false);
    if (!user || !matches) {
      throw new UnauthorizedError('Email or password is incorrect, or your session has ended.');
    }
    return {
      token: signToken(String(user._id)),
      user: { id: String(user._id), name: user.name, email: user.email },
    };
  }

  async currentUser(userId: string): Promise<PublicUser> {
    const user = await User.findById(userId);
    if (!user) throw new UnauthorizedError('Your session has ended. Sign in again.');
    return { id: String(user._id), name: user.name, email: user.email };
  }
}

function signToken(userId: string): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'], subject: userId };
  return jwt.sign({}, env.jwtSecret, options);
}

export const authService = new AuthService();
