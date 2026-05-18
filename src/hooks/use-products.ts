import { useEffect, useState } from 'react';

import { useSQLiteContext } from '@/db';
import type { Product, ProductInspectionPoint } from '@/types';

interface ProductRow {
  id: string;
  name: string;
  attributes: string;
}

interface InspectionPointRow {
  product_id: string;
  point_index: number;
  point_text: string;
}

export function useProducts() {
  const db = useSQLiteContext();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const rows = await db.getAllAsync<ProductRow>('SELECT * FROM products ORDER BY name');
    setProducts(rows.map((r) => ({ id: r.id, name: r.name, attributes: JSON.parse(r.attributes) })));
  }

  async function getProductInspectionPoints(productId: string): Promise<ProductInspectionPoint[]> {
    const rows = await db.getAllAsync<InspectionPointRow>(
      'SELECT * FROM product_inspection_points WHERE product_id = ? ORDER BY point_index',
      [productId],
    );
    return rows.map((r) => ({
      productId: r.product_id,
      pointIndex: r.point_index,
      pointText: r.point_text,
    }));
  }

  function search(query: string): Product[] {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }

  return { products, search, getProductInspectionPoints, reload: loadProducts };
}
