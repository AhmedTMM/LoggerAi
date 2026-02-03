import { User, IUser, SubscriptionTier } from '@/lib/models/User';
import { PRICING_TIERS } from '@/lib/stripe';
import connectDB from '@/lib/db';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd?: Date;
  limits: {
    aircraft: number;
    pilots: number;
    aiParsesPerMonth: number;
    aiAnalysesPerMonth: number;
  };
  usage: {
    aiParsesUsed: number;
    aiAnalysesUsed: number;
  };
  canUseAiParsing: boolean;
  canUseAiAnalysis: boolean;
  aiParsesRemaining: number;
  aiAnalysesRemaining: number;
}

export async function getUserSubscription(userId: string): Promise<SubscriptionInfo | null> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) return null;

  // Check if usage needs to be reset (monthly reset)
  const now = new Date();
  if (user.usageResetDate && now >= user.usageResetDate) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await User.findByIdAndUpdate(userId, {
      aiParsesUsed: 0,
      aiAnalysesUsed: 0,
      usageResetDate: nextMonth,
    });
    user.aiParsesUsed = 0;
    user.aiAnalysesUsed = 0;
  }

  const tier = user.subscriptionTier || 'free';
  const tierConfig = PRICING_TIERS[tier];

  const aiParsesRemaining = Math.max(0, tierConfig.limits.aiParsesPerMonth - (user.aiParsesUsed || 0));
  const aiAnalysesRemaining = Math.max(0, tierConfig.limits.aiAnalysesPerMonth - (user.aiAnalysesUsed || 0));

  return {
    tier,
    status: user.subscriptionStatus || 'active',
    currentPeriodEnd: user.currentPeriodEnd,
    limits: tierConfig.limits,
    usage: {
      aiParsesUsed: user.aiParsesUsed || 0,
      aiAnalysesUsed: user.aiAnalysesUsed || 0,
    },
    canUseAiParsing: aiParsesRemaining > 0,
    canUseAiAnalysis: aiAnalysesRemaining > 0,
    aiParsesRemaining,
    aiAnalysesRemaining,
  };
}

export async function checkFeatureAccess(
  userId: string,
  feature: 'aiParsing' | 'aiAnalysis'
): Promise<{ allowed: boolean; reason?: string; subscription: SubscriptionInfo | null }> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) {
    return {
      allowed: false,
      reason: 'User not found',
      subscription: null,
    };
  }

  if (feature === 'aiParsing') {
    if (!subscription.canUseAiParsing) {
      return {
        allowed: false,
        reason: subscription.tier === 'free'
          ? `You've used all ${subscription.limits.aiParsesPerMonth} AI parses for this month. Upgrade to Pro for more.`
          : `You've reached your monthly limit of ${subscription.limits.aiParsesPerMonth} AI parses.`,
        subscription,
      };
    }
  }

  if (feature === 'aiAnalysis') {
    if (!subscription.canUseAiAnalysis) {
      return {
        allowed: false,
        reason: subscription.tier === 'free'
          ? `You've used all ${subscription.limits.aiAnalysesPerMonth} AI analyses for this month. Upgrade to Pro for more.`
          : `You've reached your monthly limit of ${subscription.limits.aiAnalysesPerMonth} AI analyses.`,
        subscription,
      };
    }
  }

  return { allowed: true, subscription };
}

export async function incrementUsage(
  userId: string,
  type: 'aiParse' | 'aiAnalysis'
): Promise<void> {
  await connectDB();

  const updateField = type === 'aiParse' ? 'aiParsesUsed' : 'aiAnalysesUsed';
  await User.findByIdAndUpdate(userId, {
    $inc: { [updateField]: 1 },
  });
}

export async function checkResourceLimit(
  userId: string,
  resource: 'aircraft' | 'pilots',
  currentCount: number
): Promise<{ allowed: boolean; limit: number; tier: SubscriptionTier }> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) {
    return { allowed: false, limit: 0, tier: 'free' };
  }

  const limit = resource === 'aircraft'
    ? subscription.limits.aircraft
    : subscription.limits.pilots;

  return {
    allowed: currentCount < limit,
    limit,
    tier: subscription.tier,
  };
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier === 'pro' || tier === 'enterprise';
}
