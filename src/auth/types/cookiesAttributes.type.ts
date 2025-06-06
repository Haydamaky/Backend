export type AccessCookieAttributes = {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure?: boolean;
  domain: string;
  path: string;
  maxAge: number;
};

export type RefreshCookieAttributes = {
  httpOnly: boolean;
  secure?: boolean;
  maxAge: number;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain: string;
};
