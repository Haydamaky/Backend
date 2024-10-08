export type AccessCookieAttributes = {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure?: boolean;
};

export type RefreshCookieAttributes = {
  httpOnly: boolean;
  secure?: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain: string;
};
