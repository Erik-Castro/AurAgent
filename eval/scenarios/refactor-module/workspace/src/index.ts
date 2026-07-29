export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\d{10,11}$/.test(phone);
}

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function calculateTotal(prices: number[]): number {
  return prices.reduce((acc, p) => acc + p, 0);
}

export function calculateAverage(prices: number[]): number {
  if (prices.length === 0) return 0;
  return calculateTotal(prices) / prices.length;
}
