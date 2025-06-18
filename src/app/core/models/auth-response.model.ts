export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  role: string;
  name: string;
  exp: number;
}
