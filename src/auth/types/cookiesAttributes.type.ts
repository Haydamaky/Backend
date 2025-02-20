export type AccessCookieAttributes = {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure?: boolean;
  domain: string;
};

export type RefreshCookieAttributes = {
  httpOnly: boolean;
  secure?: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain: string;
};
