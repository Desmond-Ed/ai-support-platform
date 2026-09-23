import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import {
  clearRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE,
  setRefreshTokenCookie,
} from '../utils/cookies.js';
import type { LoginInput, RegisterInput } from '../validators/auth.validators.js';

export const AuthController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await AuthService.register(req.body as RegisterInput);
    setRefreshTokenCookie(res, result.tokens.refreshToken);
    res.status(201).json({ user: result.user, accessToken: result.tokens.accessToken });
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await AuthService.login(req.body as LoginInput);
    setRefreshTokenCookie(res, result.tokens.refreshToken);
    res.status(200).json({ user: result.user, accessToken: result.tokens.accessToken });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!token) {
      throw new AppError('Missing refresh token', 401);
    }

    const tokens = await AuthService.refresh(token);
    setRefreshTokenCookie(res, tokens.refreshToken);
    res.status(200).json({ accessToken: tokens.accessToken });
  },

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (token) {
      await AuthService.logout(token);
    }

    clearRefreshTokenCookie(res);
    res.status(204).send();
  },

  async logoutAll(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    await AuthService.logoutAll(req.user.id);
    clearRefreshTokenCookie(res);
    res.status(204).send();
  },
};