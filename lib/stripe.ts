import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }
  return stripeInstance;
}

// For backward compatibility - lazy getter
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return getStripe()[prop as keyof Stripe];
  },
});

// Pricing tiers configuration
export const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: [
      'Up to 2 aircraft',
      'Up to 3 pilots',
      'Basic flight planning',
      'Manual data entry',
      '5 AI parses per month',
    ],
    limits: {
      aircraft: 2,
      pilots: 3,
      aiParsesPerMonth: 5,
      aiAnalysesPerMonth: 3,
    },
  },
  pro: {
    name: 'Pro',
    price: 29,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      'Up to 10 aircraft',
      'Up to 20 pilots',
      'AI document parsing',
      'AI safety analysis',
      '100 AI parses per month',
      'Email notifications',
      'Priority support',
    ],
    limits: {
      aircraft: 10,
      pilots: 20,
      aiParsesPerMonth: 100,
      aiAnalysesPerMonth: 50,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 99,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      'Unlimited aircraft',
      'Unlimited pilots',
      'Unlimited AI parsing',
      'Unlimited AI analysis',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'Team management',
    ],
    limits: {
      aircraft: Infinity,
      pilots: Infinity,
      aiParsesPerMonth: Infinity,
      aiAnalysesPerMonth: Infinity,
    },
  },
} as const;

export type SubscriptionTier = keyof typeof PRICING_TIERS;

export function getTierFromPriceId(priceId: string): SubscriptionTier {
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  return 'free';
}
