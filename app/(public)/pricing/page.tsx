'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plane,
  Check,
  ArrowRight,
  Zap,
  Shield,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const tiers = [
  {
    name: 'Free',
    id: 'free',
    price: 0,
    description: 'Perfect for getting started with basic flight management.',
    icon: Plane,
    features: [
      'Up to 2 aircraft',
      'Up to 3 pilots',
      'Basic flight planning',
      'Manual data entry',
      '5 AI parses per month',
      '3 AI analyses per month',
    ],
    limitations: [
      'Limited AI features',
      'No priority support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    id: 'pro',
    price: 29,
    description: 'For serious pilots who want full AI-powered capabilities.',
    icon: Zap,
    features: [
      'Up to 10 aircraft',
      'Up to 20 pilots',
      'AI document parsing',
      'AI safety analysis',
      '100 AI parses per month',
      '50 AI analyses per month',
      'Email notifications',
      'Priority support',
    ],
    limitations: [],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    id: 'enterprise',
    price: 99,
    description: 'For flight schools and charter operations.',
    icon: Building2,
    features: [
      'Unlimited aircraft',
      'Unlimited pilots',
      'Unlimited AI parsing',
      'Unlimited AI analysis',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'Team management',
      'Custom reporting',
    ],
    limitations: [],
    cta: 'Contact Sales',
    popular: false,
  },
];

const faqs = [
  {
    question: 'What counts as an AI parse?',
    answer: 'An AI parse is when you upload a document (logbook, maintenance record, POH) and our AI extracts structured data from it. Each document processed counts as one parse.',
  },
  {
    question: 'Can I upgrade or downgrade at any time?',
    answer: 'Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the end of your billing period.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, American Express) through our secure Stripe payment processor.',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer: 'The Free tier gives you 5 AI parses per month to try out our AI features. No credit card required to get started.',
  },
  {
    question: 'What happens if I exceed my limits?',
    answer: "You'll see a prompt to upgrade your plan. Your existing data and functionality remain intact - you just can't use more AI features until the next month or you upgrade.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (tierId: string) => {
    if (tierId === 'free') {
      router.push('/login');
      return;
    }

    setLoading(tierId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        // User not logged in, redirect to login
        router.push('/login?redirect=/pricing');
      } else {
        console.error('Checkout error:', data.error);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/landing" className="flex items-center gap-2">
              <Plane className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-zinc-900">LoggerAi</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/landing" className="text-zinc-600 hover:text-zinc-900">
                Home
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-zinc-600 max-w-2xl mx-auto">
            Choose the plan that fits your operation. Upgrade anytime as you grow.
          </p>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={`relative rounded-2xl p-8 ${
                  tier.popular
                    ? 'bg-blue-600 text-white ring-4 ring-blue-600 ring-offset-2'
                    : 'bg-white border-2 border-zinc-200'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-400 text-amber-900 text-sm font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      tier.popular ? 'bg-white/20' : 'bg-blue-100'
                    }`}
                  >
                    <tier.icon
                      className={`w-6 h-6 ${
                        tier.popular ? 'text-white' : 'text-blue-600'
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-4xl font-bold">${tier.price}</span>
                  <span
                    className={tier.popular ? 'text-blue-100' : 'text-zinc-500'}
                  >
                    /month
                  </span>
                </div>

                <p
                  className={`mb-6 ${
                    tier.popular ? 'text-blue-100' : 'text-zinc-600'
                  }`}
                >
                  {tier.description}
                </p>

                <Button
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={loading === tier.id}
                  className={`w-full mb-6 ${
                    tier.popular
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : ''
                  }`}
                  variant={tier.popular ? 'outline' : 'default'}
                >
                  {loading === tier.id ? 'Loading...' : tier.cta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                          tier.popular ? 'text-blue-200' : 'text-emerald-500'
                        }`}
                      />
                      <span
                        className={
                          tier.popular ? 'text-blue-50' : 'text-zinc-700'
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-zinc-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-zinc-900 text-center mb-12">
            Compare Plans
          </h2>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left p-4 text-zinc-900 font-semibold">
                    Feature
                  </th>
                  <th className="text-center p-4 text-zinc-900 font-semibold">
                    Free
                  </th>
                  <th className="text-center p-4 text-zinc-900 font-semibold bg-blue-50">
                    Pro
                  </th>
                  <th className="text-center p-4 text-zinc-900 font-semibold">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Aircraft', '2', '10', 'Unlimited'],
                  ['Pilots', '3', '20', 'Unlimited'],
                  ['AI Parses/month', '5', '100', 'Unlimited'],
                  ['AI Analyses/month', '3', '50', 'Unlimited'],
                  ['Document Upload', '✓', '✓', '✓'],
                  ['Flight Planning', '✓', '✓', '✓'],
                  ['Email Notifications', '–', '✓', '✓'],
                  ['Priority Support', '–', '✓', '✓'],
                  ['Team Management', '–', '–', '✓'],
                  ['Custom Integrations', '–', '–', '✓'],
                  ['SLA Guarantee', '–', '–', '✓'],
                ].map(([feature, free, pro, enterprise], index) => (
                  <tr
                    key={index}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="p-4 text-zinc-700">{feature}</td>
                    <td className="p-4 text-center text-zinc-600">{free}</td>
                    <td className="p-4 text-center text-zinc-900 bg-blue-50 font-medium">
                      {pro}
                    </td>
                    <td className="p-4 text-center text-zinc-600">
                      {enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-zinc-900 text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-zinc-200 p-6"
              >
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                  {faq.question}
                </h3>
                <p className="text-zinc-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join hundreds of pilots already using LoggerAi.
          </p>
          <Link href="/login">
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Plane className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-zinc-900">LoggerAi</span>
            </div>
            <p className="text-sm text-zinc-500">
              © 2024 LoggerAi. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
