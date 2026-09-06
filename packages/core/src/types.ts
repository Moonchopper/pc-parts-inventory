import type { Category } from '@pcpi/contracts';

export type NormalizedProduct = {
  productKey: string;
  category: Category;
  manufacturer: string;
  model: string;
  partNumber: string | null;
  specs: Record<string, string | number | boolean | null>;
};

export type NormalizedPart = {
  productKey: string;
  identityKey: string;
  serial: string | null;
  slot: string | null;
  quantity: number;
};

export type NormalizeScanResult = {
  products: NormalizedProduct[];
  parts: NormalizedPart[];
  identityKeys: string[];
};
