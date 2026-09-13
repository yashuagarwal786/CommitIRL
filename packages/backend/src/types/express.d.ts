declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        provider: string;
        subject: string;
        email: string;
      };
    }
  }
}

export {};
