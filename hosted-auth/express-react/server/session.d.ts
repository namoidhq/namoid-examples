import "express-session";
import type { NamoIDTokenResponse } from "@namoidhq/js";

declare module "express-session" {
  interface SessionData {
    namoidTransaction?: {
      state: string;
      codeVerifier: string;
      createdAt: number;
    };
    namoidAuth?: {
      tokens: NamoIDTokenResponse;
      userId: string;
      sessionId: string | null;
      expiresAt: number;
    };
  }
}
