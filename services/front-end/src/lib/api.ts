// Server-side API helpers. These run in Next.js server components and
// read backend URLs from runtime environment variables — NOT baked at build time.

const CATALOGUE_URL = process.env.CATALOGUE_URL ?? "http://localhost:8081";
const ORDERS_URL    = process.env.ORDERS_URL    ?? "http://localhost:8082";
const CARTS_URL     = process.env.CARTS_URL     ?? "http://localhost:8083";
const PAYMENTS_URL  = process.env.PAYMENTS_URL  ?? "http://localhost:8084";
const SHIPPING_URL  = process.env.SHIPPING_URL  ?? "http://localhost:8086";
const USER_URL      = process.env.USER_URL      ?? "http://localhost:8087";

export interface Hat {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: number;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
  cluster: string;
  created_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  hat_id: string;
  quantity: number;
  price: number;
}

export interface CartItem {
  id: string;
  hat_id: string;
  quantity: number;
}

export interface Cart {
  id: string;
  user_id: string;
  items: CartItem[];
}

export async function getCatalogue(): Promise<Hat[]> {
  const res = await fetch(`${CATALOGUE_URL}/catalogue`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function getOrders(token: string): Promise<Order[]> {
  const res = await fetch(`${ORDERS_URL}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getCart(userId: string, token: string): Promise<Cart> {
  const res = await fetch(`${CARTS_URL}/carts/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return { id: "", user_id: userId, items: [] };
  return res.json();
}

export async function addToCart(userId: string, hatId: string, token: string) {
  return fetch(`${CARTS_URL}/carts/${userId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hat_id: hatId, quantity: 1 }),
  });
}

export async function checkout(userId: string, items: CartItem[], hats: Hat[], token: string) {
  const orderItems = items.map((i) => {
    const hat = hats.find((h) => h.id === i.hat_id);
    return { hat_id: i.hat_id, quantity: i.quantity, price: hat?.price ?? 0 };
  });

  const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // Create order
  const orderRes = await fetch(`${ORDERS_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: orderItems }),
  });
  if (!orderRes.ok) throw new Error("Order failed");
  const { id: orderId } = await orderRes.json();

  // Process payment
  await fetch(`${PAYMENTS_URL}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, amount: total }),
  });

  // Clear cart
  await fetch(`${CARTS_URL}/carts/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return orderId;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${USER_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Login failed");
  return res.json() as Promise<{ token: string; user_id: string }>;
}

export async function register(email: string, password: string, name: string) {
  const res = await fetch(`${USER_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) throw new Error("Registration failed");
  return res.json();
}
