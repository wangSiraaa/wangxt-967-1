export interface User {
  id: number;
  username: string;
  role: 'merchant' | 'admin';
  name: string;
  phone: string;
  created_at: string;
}

export interface Batch {
  id: number;
  name: string;
  status: 'open' | 'closed' | 'lottery_done' | 'published';
  stall_count: number;
  stall_numbers: string;
  start_date: string;
  end_date: string;
  created_at: string;
  registration_count?: number;
}

export interface Registration {
  id: number;
  batch_id: number;
  user_id: number;
  merchant_name: string;
  contact_person: string;
  phone: string;
  category: string;
  license_no: string;
  license_expiry: string;
  license_image: string;
  food_license_no: string;
  food_license_expiry: string;
  food_license_image: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string;
  created_at: string;
  reviewed_at: string;
  batch_name?: string;
}

export interface LotteryResult {
  id: number;
  batch_id: number;
  registration_id: number;
  stall_number: string;
  is_published: number;
  created_at: string;
  merchant_name?: string;
  contact_person?: string;
  phone?: string;
  category?: string;
  license_no?: string;
  batch_name?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function clearAuth() {
  localStorage.removeItem('token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error('登录已过期，请重新登录');
  }

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || '请求失败');
  }

  return json.data;
}

async function uploadFile(path: string, file: File): Promise<{ filename: string; path: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const json: ApiResponse<{ filename: string; path: string }> = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || '上传失败');
  }

  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  upload: uploadFile,
};
