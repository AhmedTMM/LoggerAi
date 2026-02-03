'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Zap, X, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface UpgradePromptProps {
  feature: string;
  description?: string;
  currentUsage?: number;
  limit?: number;
  tier?: string;
  variant?: 'inline' | 'modal' | 'banner';
  onClose?: () => void;
}

export function UpgradePrompt({
  feature,
  description,
  currentUsage,
  limit,
  tier = 'free',
  variant = 'inline',
  onClose,
}: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onClose?.();
  };

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-amber-900">
                {currentUsage !== undefined && limit !== undefined
                  ? `${currentUsage}/${limit} ${feature} used this month`
                  : `Upgrade to unlock ${feature}`}
              </p>
              <p className="text-sm text-amber-700">
                {description || 'Get more with Pro'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/pricing">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                Upgrade
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <button
              onClick={handleDismiss}
              className="p-1 text-amber-600 hover:text-amber-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-2">
            Upgrade to Continue
          </h3>
          <p className="text-zinc-600 mb-4">
            {currentUsage !== undefined && limit !== undefined ? (
              <>
                You've used all {limit} {feature} available on the {tier} plan this month.
              </>
            ) : (
              <>This feature requires a paid subscription.</>
            )}
          </p>
          {description && (
            <p className="text-sm text-zinc-500 mb-6">{description}</p>
          )}
          <div className="bg-zinc-50 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-zinc-900 mb-2">
              Pro plan includes:
            </p>
            <ul className="text-sm text-zinc-600 space-y-1">
              <li className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                100 AI parses per month
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                50 AI analyses per month
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                Up to 10 aircraft & 20 pilots
              </li>
            </ul>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDismiss}
            >
              Maybe Later
            </Button>
            <Link href="/pricing" className="flex-1">
              <Button className="w-full">
                View Plans
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant (default)
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Lock className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-zinc-900 mb-1">
            {currentUsage !== undefined && limit !== undefined
              ? `${feature} Limit Reached`
              : `Unlock ${feature}`}
          </h3>
          <p className="text-zinc-600 mb-4">
            {currentUsage !== undefined && limit !== undefined ? (
              <>
                You've used {currentUsage} of {limit} {feature.toLowerCase()} available
                on the {tier} plan this month.
              </>
            ) : (
              description || `Upgrade to Pro to access ${feature.toLowerCase()}.`
            )}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/pricing">
              <Button>
                Upgrade to Pro
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <span className="text-sm text-zinc-500">Starting at $29/month</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for subscription status
export function useSubscriptionStatus() {
  const [status, setStatus] = useState<{
    loading: boolean;
    tier: string;
    canUseAiParsing: boolean;
    canUseAiAnalysis: boolean;
    aiParsesUsed: number;
    aiParsesRemaining: number;
    aiAnalysesUsed: number;
    aiAnalysesRemaining: number;
    limits: {
      aiParsesPerMonth: number;
      aiAnalysesPerMonth: number;
    };
  }>({
    loading: true,
    tier: 'free',
    canUseAiParsing: true,
    canUseAiAnalysis: true,
    aiParsesUsed: 0,
    aiParsesRemaining: 5,
    aiAnalysesUsed: 0,
    aiAnalysesRemaining: 3,
    limits: {
      aiParsesPerMonth: 5,
      aiAnalysesPerMonth: 3,
    },
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/subscription');
      const data = await res.json();
      if (data.success && data.subscription) {
        setStatus({
          loading: false,
          tier: data.subscription.tier,
          canUseAiParsing: data.subscription.canUseAiParsing,
          canUseAiAnalysis: data.subscription.canUseAiAnalysis,
          aiParsesUsed: data.subscription.usage.aiParsesUsed,
          aiParsesRemaining: data.subscription.aiParsesRemaining,
          aiAnalysesUsed: data.subscription.usage.aiAnalysesUsed,
          aiAnalysesRemaining: data.subscription.aiAnalysesRemaining,
          limits: {
            aiParsesPerMonth: data.subscription.limits.aiParsesPerMonth,
            aiAnalysesPerMonth: data.subscription.limits.aiAnalysesPerMonth,
          },
        });
      }
    } catch {
      setStatus((s) => ({ ...s, loading: false }));
    }
  };

  return { ...status, refetch: fetchStatus };
}
